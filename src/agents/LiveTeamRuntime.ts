import type { Agent, AgentListener, AgentRuntime, AgentStatus } from './agent.types'
import { groupForTool } from './toolActivity'
import type { AgentConfig, AgentRuntimeState, RuntimeEvent } from '../shared/providerApi'

/**
 * The team, as bodies in a room.
 *
 * Every value here is mirrored from the main process, which owns the truth
 * about what each agent is doing. This side owns only presentation: where a
 * character stands and what pose it holds.
 *
 * The single most important thing about this class is what it does *not* have.
 * There is no "a task is running" flag, no "live mode" latch, no shared clock
 * that pauses everyone while one agent works. The previous runtime had one,
 * and it was the reason talking to one character felt like it locked the whole
 * application: a single boolean stood between every other agent and its own
 * animation. Each agent here has its own entry and nothing else, so three of
 * them can be in three different states at the same time — which is the entire
 * point of the product.
 */

/** How long the celebration pose holds after a task lands, in seconds. */
const SUCCESS_HOLD = 2.4

/**
 * How long a character keeps facing whoever it last spoke to, in seconds.
 *
 * A handover is a single event, so without this the pairing would exist for
 * one frame and the two characters would never visibly acknowledge each
 * other. It is short on purpose: a character still turned towards somebody
 * they finished talking to a minute ago is as wrong as one who never turned.
 */
const PARTNER_HOLD = 5

interface Body extends Agent {
  /** Seconds left on the success flourish, if any. */
  celebrating: number
  /** Seconds left before the character stops facing its last correspondent. */
  facing: number
}

export interface ExternalSpec {
  id: string
  name: string
  role: string
  model: string
  slot: number
}

export class LiveTeamRuntime implements AgentRuntime {
  private agents: Body[] = []
  private listeners = new Set<AgentListener>()
  /** Ids belonging to external CLI sessions, which have no configuration. */
  private external = new Set<string>()

  /* ------------------------------------------------------------- reading -- */

  getAgents(): Agent[] {
    return this.agents
  }

  get(id: string): Agent | undefined {
    return this.agents.find((a) => a.id === id)
  }

  /** Agents with a body in the world right now. */
  getVisible(): Agent[] {
    return this.agents.filter((a) => a.visible)
  }

  subscribe(fn: AgentListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.agents)
  }

  private find(id: string): Body | undefined {
    return this.agents.find((a) => a.id === id)
  }

  /* ----------------------------------------------------- configured team -- */

  /**
   * Mirror the persisted roster.
   *
   * Agents are added, updated and removed to match exactly. Presence follows
   * `spawned`, so spawning on the Agents page is what puts a character in the
   * office — not being given work, and not the app deciding on the user's
   * behalf.
   */
  syncConfigs(
    configs: AgentConfig[],
    describe: (config: AgentConfig) => { model: string; provider: string }
  ): void {
    let changed = false

    for (const config of configs) {
      const badge = describe(config)
      const existing = this.find(config.id)

      if (existing) {
        if (
          existing.name !== config.name ||
          existing.role !== config.role ||
          existing.slot !== config.characterSlot ||
          existing.model !== badge.model ||
          existing.provider !== badge.provider ||
          existing.active !== config.enabled ||
          existing.spawned !== config.spawned
        ) {
          existing.name = config.displayName || config.name
          existing.role = config.role
          existing.slot = config.characterSlot
          existing.model = badge.model
          existing.provider = badge.provider
          existing.active = config.enabled
          existing.spawned = config.spawned
          existing.visible = config.spawned
          if (!config.spawned) {
            existing.status = 'offline'
            existing.task = null
          }
          changed = true
        }
        continue
      }

      this.agents.push({
        id: config.id,
        name: config.displayName || config.name,
        role: config.role,
        slot: config.characterSlot,
        model: badge.model,
        provider: badge.provider,
        status: config.spawned ? 'ready' : 'offline',
        task: null,
        taskId: null,
        executionId: null,
        queued: 0,
        active: config.enabled,
        spawned: config.spawned,
        visible: config.spawned,
        celebrating: 0,
        facing: 0
      })
      changed = true
    }

    // A deleted agent must lose its body, or the office keeps a character
    // nobody can select, configure or stop.
    const live = new Set(configs.map((c) => c.id))
    const before = this.agents.length
    this.agents = this.agents.filter((a) => this.external.has(a.id) || live.has(a.id))
    if (this.agents.length !== before) changed = true

    if (changed) this.emit()
  }

  /**
   * Mirror live runtime state.
   *
   * Applied per agent, so a state arriving for Jane cannot disturb Michael.
   * The celebration is preserved while it plays: main has already moved on to
   * idle by the time the user sees the pose.
   */
  applyStates(states: AgentRuntimeState[]): void {
    let changed = false

    for (const state of states) {
      const body = this.find(state.agentId)
      if (!body) continue
      if (this.external.has(body.id)) continue

      const status: AgentStatus = body.celebrating > 0 ? 'success' : state.status

      if (
        body.status !== status ||
        body.task !== (state.action ?? state.task) ||
        body.taskId !== state.taskId ||
        body.executionId !== state.executionId ||
        body.queued !== state.queued ||
        body.spawned !== state.spawned
      ) {
        body.status = status
        body.task = state.action ?? state.task
        body.taskId = state.taskId
        body.executionId = state.executionId
        body.queued = state.queued
        body.spawned = state.spawned
        body.visible = state.spawned
        changed = true
      }
    }

    if (changed) this.emit()
  }

  /**
   * React to a single event.
   *
   * State changes arrive through `applyStates`; this handles the two things a
   * state snapshot cannot express — a completion worth celebrating, and the
   * moment two agents are talking to each other.
   */
  applyEvent(event: RuntimeEvent): void {
    const body = event.agentId ? this.find(event.agentId) : undefined

    switch (event.type) {
      /*
       * What the agent is actually doing, at tool granularity.
       *
       * The event already carries the tool's registry name and always has;
       * the world simply never looked at it, which is why an agent grepping
       * the codebase and an agent running the test suite were drawn as the
       * same person making the same two-frame typing motion. Nothing is
       * invented here — the group is a lookup on a name main supplied.
       */
      case 'agent.tool.started':
        if (body && event.tool) {
          const group = groupForTool(event.tool)
          if (body.activity !== group) {
            body.activity = group
            this.emit()
          }
        }
        break

      case 'agent.idle':
      case 'agent.cancelled':
      case 'agent.failed':
        if (body && (body.activity !== null || body.partnerId)) {
          body.activity = null
          body.partnerId = null
          this.emit()
        }
        break

      case 'agent.completed':
        if (body) {
          body.status = 'success'
          body.task = 'Done'
          body.celebrating = SUCCESS_HOLD
          body.activity = null
          this.emit()
        }
        break

      case 'agent.delegated':
      case 'agent.message.sent': {
        /*
         * Both ends of a handover, shown at once. The sender is talking; the
         * receiver is listening. Neither is marked as working — being sent a
         * message is not the same as having started the work, and saying
         * otherwise would make the office lie about who is busy.
         */
        const target = event.targetAgentId ? this.find(event.targetAgentId) : undefined
        if (body) {
          body.status = 'talking'
          body.task = `Talking to ${event.targetAgentName ?? event.targetAgentId ?? 'a teammate'}`
          // Both ends learn who the other is, so both turn towards each other
          // rather than one addressing the back of the other's head.
          body.partnerId = event.targetAgentId ?? null
          body.facing = PARTNER_HOLD
        }
        if (target && target.executionId === null) {
          target.status = 'waiting'
          target.task = `Hearing from ${event.agentName ?? event.agentId ?? 'a teammate'}`
          target.partnerId = event.agentId ?? null
          target.facing = PARTNER_HOLD
        }
        if (body || target) this.emit()
        break
      }

      default:
        break
    }
  }

  /* ------------------------------------------------ external CLI sessions -- */

  /**
   * A real external CLI session, e.g. Claude Code running in a PTY.
   *
   * These are inhabitants too, but they have no configuration to spawn from,
   * so they manage their own presence. They keep their own name in every
   * world: Claude is Claude whichever theme is loaded.
   */
  registerExternal(spec: ExternalSpec): void {
    if (this.find(spec.id)) return
    this.external.add(spec.id)
    this.agents.push({
      id: spec.id,
      name: spec.name,
      role: spec.role,
      slot: spec.slot,
      useOwnName: true,
      model: spec.model,
      provider: 'cli',
      status: 'ready',
      task: null,
      taskId: null,
      executionId: null,
      queued: 0,
      active: true,
      spawned: true,
      visible: true,
      celebrating: 0,
      facing: 0
    })
    this.emit()
  }

  /**
   * Rename or recast a session that is already in the world.
   *
   * Separate from `setExternalStatus` because these are not status: a session
   * renamed to "Auth review" or moved onto a different character has not
   * started or stopped doing anything, and folding the two together would
   * mean a rename could not be applied without also asserting a status.
   */
  updateExternal(id: string, patch: { name?: string; slot?: number }): void {
    const body = this.find(id)
    if (!body || !this.external.has(id)) return

    let changed = false
    if (patch.name !== undefined && patch.name !== body.name) {
      body.name = patch.name
      changed = true
    }
    if (patch.slot !== undefined && patch.slot !== body.slot) {
      body.slot = patch.slot
      changed = true
    }
    if (changed) this.emit()
  }

  setExternalStatus(id: string, status: AgentStatus, task: string | null): void {
    const body = this.find(id)
    if (!body || !this.external.has(id)) return
    if (body.status === status && body.task === task) return
    body.status = status
    body.task = task
    this.emit()
  }

  removeExternal(id: string): void {
    if (!this.external.has(id)) return
    this.external.delete(id)
    this.agents = this.agents.filter((a) => a.id !== id)
    this.emit()
  }

  /* ---------------------------------------------------------------- tick -- */

  /**
   * Advance presentation only.
   *
   * There is deliberately no ambient scheduler here. The landing page's office
   * invents activity because it is a shop window; this one must not, because a
   * character that mimes working when its agent is idle is the interface
   * lying about the thing it exists to report.
   */
  tick(dt: number): void {
    let changed = false
    for (const body of this.agents) {
      if (body.facing > 0) {
        body.facing -= dt
        if (body.facing <= 0) {
          body.facing = 0
          body.partnerId = null
          changed = true
        }
      }

      if (body.celebrating <= 0) continue
      body.celebrating -= dt
      if (body.celebrating <= 0) {
        body.celebrating = 0
        // Hand it back to whatever main last said; idle is the resting pose.
        if (body.status === 'success') {
          body.status = body.spawned ? 'idle' : 'offline'
          body.task = null
        }
        changed = true
      }
    }
    if (changed) this.emit()
  }
}
