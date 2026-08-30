import type { AgentLifecycle, AgentRuntimeState, AgentValidation } from './agent.types'
import type { AgentActivity } from '../src/shared/activity'
import { activitySentence } from '../src/shared/activity'
import { getAgent, listAgents } from './agentStore'
import { hasApiKey, readConfig } from '../credentials/secureStore'
import { getProviderDefinition } from '../providers/registry'
import { systemBus } from './EventBus'

/**
 * What every agent is doing, right now.
 *
 * The single most important property of this class is that nothing in it is
 * global. There is no "current agent", no "current status", no "current task" —
 * every value is behind an agentId. That is precisely what allows Jane to keep
 * working while the user talks to Michael, and it is the constraint the rest
 * of the runtime is built to preserve.
 *
 * State here is never persisted. "Currently working" is false the moment the
 * app closes, so writing it to disk would only ever produce a lie on restart.
 */

interface Internal extends AgentRuntimeState {
  /** Distinguishes "has never worked" (ready) from "has finished" (idle). */
  hasWorked: boolean
}

class AgentRegistry {
  private states = new Map<string, Internal>()

  /* --------------------------------------------------------- derivation -- */

  /**
   * Whether this agent could actually run a task at this moment.
   *
   * Checks only that a key exists, never decrypting one — this runs on every
   * roster render, and the answer to "is it connected" does not require the
   * secret itself.
   */
  private runnableNow(agentId: string): boolean {
    const agent = getAgent(agentId)
    if (!agent || !agent.enabled) return false
    if (!getProviderDefinition(agent.providerId)) return false
    if (!hasApiKey(agent.providerId)) return false
    return agent.modelId !== null || readConfig(agent.providerId).selectedModel !== null
  }

  /** The status an idle agent should be showing, given its configuration. */
  private restingStatus(agentId: string, hasWorked: boolean): AgentLifecycle {
    const agent = getAgent(agentId)
    if (!agent || !agent.enabled) return 'offline'
    if (!agent.spawned) return 'offline'
    if (!this.runnableNow(agentId)) return 'offline'
    return hasWorked ? 'idle' : 'ready'
  }

  private blank(agentId: string): Internal {
    const agent = getAgent(agentId)
    return {
      agentId,
      status: 'offline',
      action: null,
      activity: null,
      task: null,
      taskId: null,
      executionId: null,
      queued: 0,
      lastError: null,
      spawned: agent?.spawned ?? false,
      enabled: agent?.enabled ?? false,
      runnable: false,
      hasWorked: false,
      updatedAt: Date.now()
    }
  }

  /* ------------------------------------------------------------- reading -- */

  get(agentId: string): AgentRuntimeState {
    const existing = this.states.get(agentId)
    if (existing) return strip(existing)
    const created = this.blank(agentId)
    this.states.set(agentId, created)
    this.refresh(agentId, false)
    return strip(this.states.get(agentId)!)
  }

  list(): AgentRuntimeState[] {
    return listAgents().map((a) => this.get(a.id))
  }

  /** Whether the agent is mid-execution. Used to decide queueing. */
  isBusy(agentId: string): boolean {
    const s = this.states.get(agentId)
    return !!s && s.executionId !== null
  }

  /* ------------------------------------------------------------- writing -- */

  /**
   * Recompute the derived fields for one agent from its configuration.
   *
   * Called whenever configuration or provider connectivity changes. It leaves
   * a busy agent's status alone: a provider being disconnected mid-task does
   * not retroactively make that task not have happened.
   */
  refresh(agentId: string, announce = true): void {
    const state = this.states.get(agentId) ?? this.blank(agentId)
    const agent = getAgent(agentId)

    state.enabled = agent?.enabled ?? false
    state.spawned = agent?.spawned ?? false
    state.runnable = this.runnableNow(agentId)

    if (state.executionId === null && state.status !== 'error') {
      state.status = this.restingStatus(agentId, state.hasWorked)
      if (state.status === 'offline') {
        state.action = null
        state.activity = null
        state.task = null
      }
    }

    state.updatedAt = Date.now()
    this.states.set(agentId, state)
    if (announce) this.announce(agentId)
  }

  /** Recompute every agent. Cheap, and always correct after a roster change. */
  refreshAll(): void {
    for (const agent of listAgents()) this.refresh(agent.id)
    // Drop state for agents that no longer exist, so a deleted agent cannot
    // linger in the world as a body with no configuration behind it.
    const live = new Set(listAgents().map((a) => a.id))
    for (const id of [...this.states.keys()]) {
      if (!live.has(id)) this.states.delete(id)
    }
  }

  patch(agentId: string, patch: Partial<AgentRuntimeState>): AgentRuntimeState {
    const state = this.states.get(agentId) ?? this.blank(agentId)
    Object.assign(state, patch, { updatedAt: Date.now() })
    this.states.set(agentId, state)
    this.announce(agentId)
    return strip(state)
  }

  /** Move an agent into a busy status for a specific execution. */
  beginExecution(
    agentId: string,
    executionId: string,
    taskId: string,
    task: string
  ): void {
    const state = this.states.get(agentId) ?? this.blank(agentId)
    state.executionId = executionId
    state.taskId = taskId
    state.task = task
    state.status = 'thinking'
    state.action = 'Reading the brief'
    state.activity = null
    state.lastError = null
    state.hasWorked = true
    state.updatedAt = Date.now()
    this.states.set(agentId, state)
    this.announce(agentId)
  }

  /**
   * Release an agent from an execution.
   *
   * Guarded by executionId: a cancelled execution that finishes its final
   * cleanup after the agent has already started the next task must not drag
   * that new task's status back to idle.
   */
  endExecution(agentId: string, executionId: string, error?: string | null): void {
    const state = this.states.get(agentId)
    if (!state || state.executionId !== executionId) return
    state.executionId = null
    state.taskId = null
    state.task = null
    state.action = null
    /*
     * The activity is deliberately *not* cleared here.
     *
     * The last thing an execution reports is `completed`, `error` or
     * `stopped`, and that is the one the user most needs to see — a ✓ that is
     * wiped in the same tick it was written is a ✓ nobody ever sees. The
     * activity store holds a terminal activity for a couple of seconds and
     * then drops it, which is what produces COMPLETE → IDLE rather than a
     * character that simply stops.
     */
    state.lastError = error ?? null
    state.status = error ? 'error' : this.restingStatus(agentId, true)
    state.updatedAt = Date.now()
    this.announce(agentId)
  }

  /**
   * Record what this agent is doing, in normalised terms.
   *
   * Written here rather than published on a channel of its own, because this
   * object is what every surface in the product already reads. The status and
   * the prose `action` are both *derived from* the activity rather than set
   * beside it — which is what makes it impossible for the badge to say
   * "waiting for approval" while the roster says the same agent is working.
   *
   * Called only by `activityStore`, which is the single writer.
   */
  setActivity(agentId: string, activity: AgentActivity | null): void {
    const state = this.states.get(agentId) ?? this.blank(agentId)
    state.activity = activity
    if (activity) {
      state.status = activity.status
      state.action = activitySentence(activity)
      if (activity.status !== 'error') state.lastError = null
    }
    state.updatedAt = Date.now()
    this.states.set(agentId, state)
    this.announce(agentId)
  }

  /** Update the live status of an in-flight execution only. */
  progress(
    agentId: string,
    executionId: string,
    status: AgentLifecycle,
    action?: string | null
  ): void {
    const state = this.states.get(agentId)
    if (!state || state.executionId !== executionId) return
    state.status = status
    if (action !== undefined) state.action = action
    state.updatedAt = Date.now()
    this.announce(agentId)
  }

  setQueued(agentId: string, queued: number): void {
    const state = this.states.get(agentId) ?? this.blank(agentId)
    if (state.queued === queued) return
    state.queued = queued
    // Waiting work is visible even when the agent itself is between tasks.
    if (state.executionId === null && queued > 0) state.status = 'queued'
    state.updatedAt = Date.now()
    this.states.set(agentId, state)
    this.announce(agentId)
  }

  /**
   * Mark an execution as stopping.
   *
   * Cancellation is not instant: it takes effect at the next step or tool
   * boundary, because neither provider SDK can abort a request already in
   * flight. Reporting idle the moment the user clicks would be the interface
   * claiming work has ended while it is still being billed — this says
   * truthfully that it is on its way down, and `endExecution` moves it to
   * idle when it genuinely has.
   *
   * Guarded by executionId like every other transition here, so a stop
   * arriving just as an execution finishes cannot mark the next one stopping.
   */
  beginStop(agentId: string, executionId: string): void {
    const state = this.states.get(agentId)
    if (!state || state.executionId !== executionId) return
    if (state.status === 'stopping') return
    state.status = 'stopping'
    state.action = 'Stopping'
    state.updatedAt = Date.now()
    this.announce(agentId)
  }

  /** Clear a sticky error once the user has acted on it. */
  clearError(agentId: string): void {
    const state = this.states.get(agentId)
    if (!state || state.lastError === null) return
    state.lastError = null
    if (state.executionId === null) {
      state.status = this.restingStatus(agentId, state.hasWorked)
    }
    this.announce(agentId)
  }

  private announce(agentId: string): void {
    const state = this.states.get(agentId)
    if (!state) return
    const agent = getAgent(agentId)
    systemBus.emit({
      type: 'agent.state',
      agentId,
      agentName: agent?.name,
      state: strip(state)
    })
  }
}

function strip(state: Internal): AgentRuntimeState {
  const { hasWorked, ...rest } = state
  void hasWorked
  return { ...rest }
}

export const agentRegistry = new AgentRegistry()

/* ------------------------------------------------------------ validation -- */

/**
 * Why an agent cannot be spawned, in the user's terms.
 *
 * Every check names the thing to go and fix. "Not ready" tells a user nothing;
 * "OpenAI is not connected" tells them where to go.
 */
export function validateAgent(agentId: string): AgentValidation {
  const problems: string[] = []
  const agent = getAgent(agentId)

  if (!agent) {
    return { agentId, ok: false, problems: ['That agent no longer exists.'] }
  }

  if (!agent.name.trim()) problems.push('The agent needs a name.')
  if (!agent.role.trim()) problems.push('The agent needs a role.')

  const def = getProviderDefinition(agent.providerId)
  if (!def) {
    problems.push(`Unknown provider "${agent.providerId}".`)
  } else if (!hasApiKey(agent.providerId)) {
    problems.push(
      `${def.name} is not connected. Add your API key in Settings → AI Providers.`
    )
  } else {
    const model = agent.modelId ?? readConfig(agent.providerId).selectedModel
    if (!model) problems.push(`No model is selected for ${def.name}.`)
  }

  if (!agent.instructions.trim()) {
    problems.push('The agent has no system prompt.')
  }

  if (agent.capabilities.length === 0) {
    problems.push('The agent has no capabilities and could not do anything.')
  }

  return { agentId, ok: problems.length === 0, problems }
}
