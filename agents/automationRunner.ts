import type {
  AgentConfig,
  AgentTask,
  AutomationOrigin,
  RuntimeEvent,
  Trigger
} from './agent.types'
import { getAgent, groupOf, threadIdFor } from './agentStore'
import { systemBus } from './EventBus'
import { makeId } from './persist'
import { orchestrator, recordTriggerMessage, wasRejected } from './AgentOrchestrator'
import { conversationStore } from './conversationStore'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import { getActiveProjectId } from '../projects/projectStore'
import { markRun } from './triggerStore'
import {
  attachRunTask,
  finishRun,
  runForCorrelation,
  runningRunFor,
  startRun
} from './automationRuns'
import { attachAutomation } from './groupChats'
import { appendToThread, rememberChainThread } from './threads'
import { getTask } from './taskStore'

/**
 * Running an automation.
 *
 * One path, used by all three ways an automation can start — an event on the
 * bus, the scheduler, or the user pressing Run now. That matters more than it
 * looks: the event path already existed inside the trigger engine, and the
 * obvious way to add "Run now" is a second copy of it. Two copies is how a
 * scheduled run ends up skipping the permission mode, or the project check, or
 * the group conversation, depending on which one it went through.
 *
 * The three things this adds to what the engine already did:
 *
 *   - a run record, so a scheduled automation is verifiable after the fact
 *   - a group conversation, when the automation runs on more than one agent
 *   - a project check on every target, at the moment of dispatch
 *
 * That last one is the one worth being blunt about. An automation stores a
 * projectId and its agents store one too, and both are compared against the
 * project that is open *now* rather than against each other or against
 * whatever the renderer last said. A scheduled automation belonging to a
 * closed project does not run. There is no path here that reaches an agent in
 * another project, because every agent is resolved through `getAgent`, which
 * only ever answers about the open one.
 */

export interface RunOutcome {
  ok: boolean
  runId?: string
  error?: string
}

function workspaceId(): string {
  return getWorkspaceRoot() ?? 'no-workspace'
}

/**
 * The agents this automation may actually reach, right now.
 *
 * Everything that could have changed since the automation was written is
 * checked here rather than assumed: the project it belongs to, whether the
 * agents still exist, whether they are enabled and spawned, and whether the
 * relationship graph still permits the source to contact them.
 */
export function resolveTargets(trigger: Trigger): {
  agents: AgentConfig[]
  blocked: string | null
} {
  const projectId = getActiveProjectId()
  if (!projectId) return { agents: [], blocked: 'no project is open' }
  if (trigger.projectId !== projectId) {
    return { agents: [], blocked: 'it belongs to a different project' }
  }

  if (trigger.action === 'notify.user') return { agents: [], blocked: null }

  if (trigger.agentIds.length === 0) return { agents: [], blocked: 'no agent is set' }

  const source = trigger.sourceAgentId ? getAgent(trigger.sourceAgentId) : undefined
  const agents: AgentConfig[] = []
  const problems: string[] = []

  for (const id of trigger.agentIds) {
    const agent = getAgent(id)
    if (!agent) {
      problems.push('an agent no longer exists')
      continue
    }
    /*
     * Belt and braces. `getAgent` is already scoped to the open project, so
     * this cannot currently fail — which is exactly why it is worth stating:
     * if that scoping is ever loosened, an automation must not be the thing
     * that discovers it.
     */
    if (agent.projectId !== projectId) {
      problems.push(`${agent.name} belongs to another project`)
      continue
    }
    if (!agent.enabled) {
      problems.push(`${agent.name} is disabled`)
      continue
    }
    if (!agent.spawned) {
      problems.push(`${agent.name} is not spawned`)
      continue
    }
    /*
     * An automation must not be a way around the relationship graph the user
     * configured. If the source may not talk to the target, neither may an
     * automation acting on the source's behalf.
     */
    if (source && !source.canTalkTo.includes(agent.id)) {
      problems.push(`${source.name} is not permitted to contact ${agent.name}`)
      continue
    }
    agents.push(agent)
  }

  if (agents.length === 0) {
    return { agents: [], blocked: problems[0] ?? 'no agent could take it on' }
  }
  return { agents, blocked: null }
}

/**
 * The group conversation this run belongs in, if it has one.
 *
 * Only when the targets are genuinely a connected group. Two agents an
 * automation happens to name are not a group unless the user connected them —
 * inventing a thread for them would put a conversation on Home that does not
 * correspond to any relationship in the office.
 */
function threadForRun(agents: AgentConfig[]): string | null {
  if (agents.length < 2) return null
  const members = groupOf(agents[0].id)
  if (members.length < 2) return null
  if (!agents.every((a) => members.includes(a.id))) return null
  return threadIdFor(members)
}

/**
 * What the agents are actually asked.
 *
 * The automation's own message is the instruction; whatever triggered it is
 * attached as context. Without that context a review request is meaningless —
 * "review the work" tells the reviewer nothing about which work.
 */
export function composePrompt(
  trigger: Trigger,
  event: RuntimeEvent | null,
  sourceName: string | undefined
): string {
  const instruction =
    trigger.message.trim() ||
    (trigger.action === 'request.review'
      ? 'Review the work described below and report any problems you find.'
      : 'Continue from the work described below.')

  const context: string[] = []
  if (sourceName) context.push(`From: ${sourceName}`)
  if (event?.task) context.push(`Task: ${event.task}`)
  if (event?.path) context.push(`File: ${event.path}`)
  if (event?.reason) context.push(`Error: ${event.reason}`)
  if (event?.message) {
    context.push(`What they reported:\n${event.message.trim().slice(0, 2_000)}`)
  }

  return context.length > 0 ? `${instruction}\n\n${context.join('\n')}` : instruction
}

function blocked(trigger: Trigger, reason: string, event?: RuntimeEvent | null): RunOutcome {
  systemBus.emit({
    type: 'trigger.blocked',
    triggerId: trigger.id,
    triggerName: trigger.name,
    agentId: event?.agentId,
    correlationId: event?.correlationId,
    depth: event?.depth,
    reason,
    activity: `Automation "${trigger.name}" did not run: ${reason}`
  })
  return { ok: false, error: reason }
}

/**
 * Run one automation.
 *
 * Returns rather than throws, because two of the three callers are timers and
 * the third is an IPC handler — none of them has anywhere useful to put an
 * exception, and a failed automation is information the user wants, not a
 * crash.
 */
export function runAutomation(
  trigger: Trigger,
  options: { origin: AutomationOrigin; event?: RuntimeEvent | null }
): RunOutcome {
  const event = options.event ?? null

  // One run at a time. A daily automation whose agents are still working from
  // yesterday must not stack a second copy of itself on their queues.
  const inFlight = runningRunFor(trigger.id)
  if (inFlight) return blocked(trigger, 'its previous run has not finished', event)

  const sourceAgent = trigger.sourceAgentId ? getAgent(trigger.sourceAgentId) : undefined
  const correlationId = event?.correlationId ?? makeId('chain')
  const depth = (event?.depth ?? 0) + 1

  /* ------------------------------------------------------- notify only -- */

  if (trigger.action === 'notify.user') {
    markRun(trigger.id, options.origin === 'schedule')
    const run = startRun({
      triggerId: trigger.id,
      triggerName: trigger.name,
      origin: options.origin,
      correlationId,
      agentIds: [],
      agentNames: [],
      threadId: null
    })
    const message = trigger.message.trim() || `${trigger.name} fired.`
    if (run) finishRun(run.id, 'completed', { summary: message })

    systemBus.emit({
      type: 'trigger.fired',
      triggerId: trigger.id,
      triggerName: trigger.name,
      agentId: event?.agentId,
      agentName: event?.agentName,
      correlationId,
      depth,
      message,
      activity: `Automation "${trigger.name}" fired.`
    })
    systemBus.emit({
      type: 'automation.completed',
      triggerId: trigger.id,
      triggerName: trigger.name,
      runId: run?.id,
      correlationId,
      message,
      activity: `${trigger.name} completed.`
    })
    return { ok: true, runId: run?.id }
  }

  /* ----------------------------------------------------------- targets -- */

  const { agents, blocked: why } = resolveTargets(trigger)
  if (why) return blocked(trigger, why, event)

  const prompt = composePrompt(trigger, event, sourceAgent?.name)

  /*
   * Deduplicate before anything is spent. An identical message to the same
   * agent in the same chain is the ping-pong case the depth counter misses.
   * Only for event-driven runs: a schedule firing the same daily prompt is
   * exactly what it is supposed to do, and a manual Run now is the user asking
   * for it a second time on purpose.
   */
  if (options.origin === 'event') {
    const fresh = agents.some((agent) =>
      recordTriggerMessage({
        senderAgentId: sourceAgent?.id ?? 'system',
        senderName: sourceAgent?.name ?? 'Backstage',
        receiverAgentId: agent.id,
        receiverName: agent.name,
        message: prompt,
        reason: `Automation: ${trigger.name}`,
        taskId: event?.taskId ?? null,
        correlationId,
        depth
      })
    )
    if (!fresh) return blocked(trigger, 'duplicate message in this chain', event)
  }

  const threadId = threadForRun(agents)
  if (threadId) attachAutomation(threadId, trigger.id, trigger.name)

  const run = startRun({
    triggerId: trigger.id,
    triggerName: trigger.name,
    origin: options.origin,
    correlationId,
    agentIds: agents.map((a) => a.id),
    agentNames: agents.map((a) => a.name),
    threadId
  })

  markRun(trigger.id, options.origin === 'schedule')

  systemBus.emit({
    type: 'automation.started',
    triggerId: trigger.id,
    triggerName: trigger.name,
    runId: run?.id,
    agentId: agents[0]?.id,
    agentName: agents[0]?.name,
    correlationId,
    depth,
    message: prompt,
    activity: `${trigger.name} started — ${agents.map((a) => a.name).join(', ')}.`
  })
  systemBus.emit({
    type: 'trigger.fired',
    triggerId: trigger.id,
    triggerName: trigger.name,
    agentId: sourceAgent?.id,
    agentName: sourceAgent?.name,
    targetAgentId: agents[0]?.id,
    targetAgentName: agents[0]?.name,
    taskId: event?.taskId,
    correlationId,
    depth,
    message: prompt,
    activity: `Automation "${trigger.name}": ${agents
      .map((a) => a.name)
      .join(', ')} ${agents.length === 1 ? 'was' : 'were'} asked to help.`
  })

  /* ------------------------------------------------- a message, not work -- */

  if (trigger.action === 'send.message') {
    /*
     * A message is context, not work. It lands in each target's memory for
     * their next turn and starts nothing — which is the whole difference
     * between an automation that informs and one that spends.
     */
    for (const agent of agents) {
      conversationStore.append(workspaceId(), agent.id, {
        id: makeId('msg'),
        kind: 'collaboration',
        agentId: agent.id,
        fromAgentId: sourceAgent?.id,
        fromName: sourceAgent?.name ?? 'Backstage',
        text: prompt,
        at: Date.now()
      })
      systemBus.emit({
        type: 'agent.message.received',
        agentId: agent.id,
        agentName: agent.name,
        targetAgentId: sourceAgent?.id,
        targetAgentName: sourceAgent?.name,
        correlationId,
        depth,
        message: prompt,
        activity: `received a note from ${sourceAgent?.name ?? 'Backstage'}.`
      })
    }
    if (run) finishRun(run.id, 'completed', { summary: 'Message delivered.' })
    systemBus.emit({
      type: 'automation.completed',
      triggerId: trigger.id,
      triggerName: trigger.name,
      runId: run?.id,
      correlationId,
      message: 'Message delivered.',
      activity: `${trigger.name} completed.`
    })
    return { ok: true, runId: run?.id }
  }

  /* --------------------------------------------------------- real work -- */

  /*
   * The group conversation is opened with the instruction, before anything is
   * queued, so a user watching Home sees the team receive the brief rather
   * than a group that sits empty until the first reply lands.
   */
  if (threadId) {
    rememberChainThread(correlationId, threadId)
    appendToThread(threadId, {
      id: makeId('msg'),
      kind: 'system',
      agentId: threadId,
      fromName: trigger.name,
      text: prompt,
      at: Date.now()
    })
  }

  const started: string[] = []
  const refusals: string[] = []

  for (const agent of agents) {
    const result = orchestrator.submit({
      agentId: agent.id,
      prompt,
      title: trigger.name,
      origin: 'trigger',
      originAgentId: sourceAgent?.id ?? null,
      correlationId,
      depth,
      parentTaskId: event?.taskId ?? null,
      automationName: trigger.name,
      automationRunId: run?.id ?? null,
      strictPermissions: trigger.permissionMode === 'strict'
    })

    if (wasRejected(result)) {
      refusals.push(`${agent.name}: ${result.error}`)
      continue
    }

    started.push(result.id)
    if (run) attachRunTask(run.id, result.id)

    conversationStore.append(workspaceId(), agent.id, {
      id: makeId('msg'),
      kind: 'collaboration',
      agentId: agent.id,
      fromAgentId: sourceAgent?.id,
      fromName: sourceAgent?.name ?? trigger.name,
      text: prompt,
      at: Date.now(),
      taskId: result.id
    })
  }

  if (started.length === 0) {
    const reason = refusals[0] ?? 'nobody could take it on'
    if (run) finishRun(run.id, 'blocked', { error: reason })
    systemBus.emit({
      type: 'automation.failed',
      triggerId: trigger.id,
      triggerName: trigger.name,
      runId: run?.id,
      correlationId,
      reason,
      activity: `${trigger.name} could not start: ${reason}`
    })
    return { ok: false, error: reason }
  }

  return { ok: true, runId: run?.id }
}

/* ------------------------------------------------------------ settling -- */

let unsubscribe: (() => void) | null = null

/**
 * Close a run out when the work it started has finished.
 *
 * Driven by the same bus everything else reads, rather than by the runner
 * awaiting the tasks it queued: an automation's tasks go onto ordinary agent
 * queues and may sit behind other work for minutes, and holding a promise open
 * across that would tie the run's lifetime to the process that started it.
 */
export function initAutomationRunner(): void {
  unsubscribe?.()
  unsubscribe = systemBus.on((event) => {
    if (
      event.type !== 'task.completed' &&
      event.type !== 'task.failed' &&
      event.type !== 'task.cancelled'
    ) {
      return
    }
    if (!event.correlationId) return

    const run = runForCorrelation(event.correlationId)
    if (!run || run.taskIds.length === 0) return

    const tasks = run.taskIds.map((id: string) => getTask(id))
    const settled = tasks.every(
      (t) =>
        t === undefined ||
        t.status === 'completed' ||
        t.status === 'failed' ||
        t.status === 'cancelled'
    )
    if (!settled) return

    const failures = tasks.filter((t) => t?.status === 'failed')
    const results = tasks
      .filter((t): t is AgentTask => t !== undefined && t.status === 'completed' && !!t.result)
      .map(
        (t) =>
          `${run.agentNames[run.agentIds.indexOf(t.agentId)] ?? 'Agent'}: ${t.result}`
      )

    if (failures.length === tasks.length) {
      const reason = failures[0]?.error ?? 'every agent failed'
      finishRun(run.id, 'failed', { error: reason })
      systemBus.emit({
        type: 'automation.failed',
        triggerId: run.triggerId,
        triggerName: run.triggerName,
        runId: run.id,
        correlationId: run.correlationId,
        reason,
        activity: `${run.triggerName} failed: ${reason}`
      })
      return
    }

    const summary = results.join('\n\n').slice(0, 4_000) || 'Finished with no output.'
    finishRun(run.id, 'completed', {
      summary,
      error: failures.length > 0 ? `${failures.length} of ${tasks.length} failed.` : null
    })
    systemBus.emit({
      type: 'automation.completed',
      triggerId: run.triggerId,
      triggerName: run.triggerName,
      runId: run.id,
      correlationId: run.correlationId,
      message: summary,
      activity: `${run.triggerName} completed.`
    })
  })
}

export function disposeAutomationRunner(): void {
  unsubscribe?.()
  unsubscribe = null
}
