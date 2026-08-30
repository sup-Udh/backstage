import type { Agent, AgentListener, AgentRuntime, AgentStatus } from './agent.types'
import type { ActivityType, AgentActivity } from '../shared/activity'
import { ACTIVITY_LABEL, statusForActivity } from '../shared/activity'
import { makeRng } from '../world/pixel/ops'
import { EventBus } from './agentEvents'
import { buildTaskScript, type Beat } from './taskScript'

/**
 * The landing page's simulated office.
 *
 * This was scaffolding for a world that had no real agents behind it. It now
 * has exactly one job: making the shop window look like a working office
 * before anyone has connected a provider. The workspace uses LiveTeamRuntime
 * instead, and deliberately has no ambient scheduler — a character that mimes
 * working while its agent is idle is the interface lying about the one thing
 * it exists to report.
 *
 * It implements the same AgentRuntime interface, which is why the renderer
 * cannot tell the two apart.
 */

interface Plan {
  status: AgentStatus
  /** Seconds this status lasts. */
  duration: number
  task: string | null
}

const TASKS: Partial<Record<AgentStatus, string[]>> = {
  working: [
    'Refactoring auth middleware',
    'Writing migration 0042',
    'Patching the retry backoff',
    'Rewriting the parser tests',
    'Tracing a flaky integration test',
    'Wiring up the webhook handler'
  ],
  thinking: [
    'Reading the evidence board',
    'Comparing two stack traces',
    'Working out where state diverges',
    'Mapping the call graph'
  ],
  talking: [
    'Handing off the repro steps',
    'Arguing about the schema',
    'Syncing on the rollout plan',
    'Pairing on the failing case'
  ],
  waiting: ['Waiting on CI', 'Blocked on a review'],
  idle: ['Between tasks'],
  success: ['Done - 3 files changed', 'Done - tests green', 'Done - shipped'],
  error: ['Hit a wall on the migration']
}

/** How often each status comes up once the opening beats are done. */
const WEIGHTS: [AgentStatus, number][] = [
  ['working', 0.44],
  ['thinking', 0.2],
  ['talking', 0.13],
  ['idle', 0.15],
  ['success', 0.08]
]

/**
 * The tool family each simulated task line implies.
 *
 * Keyed by the same phrases `TASKS` uses, so the shop window's characters read
 * a screen for a task about reading and type for a task about writing. It is a
 * simulation, so this is invented — but it is invented *from the task line
 * already shown to the user*, so what the character does and what the label
 * says still agree, which is the property that matters.
 */
const SHOWCASE_ACTIVITY: ActivityType[] = [
  'reading_file',
  'running_command',
  'git_operation',
  'web_search',
  'searching_code',
  'testing'
]

/**
 * A showcase activity, in the same shape a real one arrives in.
 *
 * The landing page is a shop window and says so — it invents work because
 * there is no account behind it and nothing to report. What it must not do is
 * invent a *different shape* of work: building the same `AgentActivity` the
 * runtime produces is what lets one world renderer draw both, and is why the
 * simulation cannot drift away from the thing it is advertising.
 */
function showcaseActivity(id: string, type: ActivityType): AgentActivity {
  return {
    agentId: id,
    projectId: 'showcase',
    type,
    label: ACTIVITY_LABEL[type],
    detail: null,
    detailFull: null,
    startedAt: Date.now(),
    status: statusForActivity(type),
    progress: null
  }
}

const DURATIONS: Partial<Record<AgentStatus, [number, number]>> = {
  working: [16, 30],
  thinking: [9, 15],
  talking: [9, 14],
  idle: [6, 11],
  waiting: [6, 10],
  success: [2.5, 3.5],
  error: [5, 8]
}

export interface FakeAgentSpec {
  id: string
  model: string
  name?: string
  role?: string
  slot?: number
  useOwnName?: boolean
}

export class FakeAgentRuntime implements AgentRuntime {
  private agents: Agent[]
  private remaining: number[]
  private rng: () => number
  private listeners = new Set<AgentListener>()
  /** Set while two agents are mid-conversation, so they finish together. */
  private conversation: [number, number] | null = null
  /** Scripted first transition per agent, so the opening beats land. */
  private forced: (AgentStatus | null)[] = []

  /** Events the world and the command centre both listen to. */
  readonly events = new EventBus()

  /*
   * While a task is running the ambient scheduler stands down and the
   * timeline below drives every agent instead. That is what makes a
   * submitted prompt produce a legible sequence rather than more of the
   * same random office noise.
   */
  private script: Beat[] = []
  private scriptClock = 0
  private scriptCursor = 0
  private taskActive = false
  /** Set while a real provider request is in flight. */
  private liveActive = false

  constructor(specs: FakeAgentSpec[], seed = 20260818) {
    this.rng = makeRng(seed)
    this.agents = specs.map((s, i) => ({
      id: s.id,
      name: s.name ?? s.id,
      role: s.role ?? 'Agent',
      slot: s.slot ?? i,
      model: s.model,
      provider: 'simulated',
      status: 'idle',
      task: null,
      taskId: null,
      executionId: null,
      queued: 0,
      active: true,
      spawned: true,
      visible: false
    }))
    this.remaining = specs.map(() => 0)
    this.openingBeats()
  }

  /**
   * The first thing the user sees must already show the product working:
   * someone typing, someone at the board, someone crossing the office, and a
   * conversation. After these expire the schedule goes stochastic.
   */
  private openingBeats(): void {
    const beats: Plan[] = [
      { status: 'working', duration: 26, task: 'Refactoring auth middleware' },
      { status: 'thinking', duration: 18, task: 'Reading the evidence board' },
      { status: 'idle', duration: 9, task: null },
      { status: 'working', duration: 21, task: 'Writing migration 0042' }
    ]
    this.agents.forEach((a, i) => {
      if (!a.visible) return
      const b = beats[i % beats.length]
      a.status = b.status
      a.task = b.task
      this.remaining[i] = b.duration
    })
    // A conversation starts a few seconds in, once the room has settled, so
    // the user sees every behaviour the product promises within ~5 seconds.
    this.forced = this.agents.map(() => null)
    if (this.agents.length >= 3) {
      this.remaining[2] = 4
      this.forced[2] = 'talking'
    }
  }

  getAgents(): Agent[] {
    return this.agents
  }

  /** Agents physically present in the world right now. */
  getActive(): Agent[] {
    return this.agents.filter((a) => a.visible)
  }

  /**
   * Call in the next reserve. Returns the agent, or null if everyone is
   * already here. The world notices the new active agent on its next tick and
   * walks them in from the door.
   */
  activateNext(): Agent | null {
    const next = this.agents.find((a) => !a.visible)
    if (!next) return null
    return this.show(next.id)
  }

  /**
   * Add an agent the runtime has not seen before. Configuration lives in
   * the main process, so the roster here is filled in as agents appear.
   */
  register(spec: FakeAgentSpec): Agent {
    const existing = this.get(spec.id)
    if (existing) {
      // Configuration can change while an agent is standing in the room.
      existing.model = spec.model
      if (spec.name) existing.name = spec.name
      if (spec.role) existing.role = spec.role
      if (spec.slot !== undefined) existing.slot = spec.slot
      if (spec.useOwnName !== undefined) existing.useOwnName = spec.useOwnName
      return existing
    }
    const agent: Agent = {
      id: spec.id,
      name: spec.name ?? spec.id,
      role: spec.role ?? 'Agent',
      slot: spec.slot ?? this.agents.length,
      useOwnName: spec.useOwnName,
      model: spec.model,
      provider: 'simulated',
      status: 'idle',
      task: null,
      taskId: null,
      executionId: null,
      queued: 0,
      active: true,
      spawned: true,
      visible: false
    }
    this.agents.push(agent)
    this.remaining.push(0)
    this.emit()
    return agent
  }

  /**
   * Bring an agent into the world. Called when it is assigned to a task,
   * by whichever path is running — simulated or real. This is the single
   * place a character comes into existence.
   */
  show(agentId: string): Agent | null {
    const agent = this.get(agentId)
    if (!agent) return null
    if (!agent.visible) {
      agent.visible = true
      agent.status = 'idle'
      agent.task = null
      this.remaining[this.agents.indexOf(agent)] = Number.POSITIVE_INFINITY
      this.emit()
    }
    return agent
  }

  /**
   * Bring the whole roster into the world and start them working.
   *
   * Only for the landing page's showcase office. The workspace deliberately
   * does the opposite: there, presence is earned by being assigned to a task.
   */
  populate(): void {
    for (const agent of this.agents) {
      agent.visible = true
    }
    this.openingBeats()
    this.emit()
  }

  /** True while any visible agent is still held mid-task. */
  private anyBusy(): boolean {
    return this.agents.some(
      (a) => a.visible && this.remaining[this.agents.indexOf(a)] === Number.POSITIVE_INFINITY
    )
  }

  /** Send an agent home. The definition survives; only the body leaves. */
  hide(agentId: string): void {
    const agent = this.get(agentId)
    if (!agent || !agent.visible) return
    agent.visible = false
    agent.status = 'idle'
    agent.task = null
    this.emit()
  }

  get(id: string): Agent | undefined {
    return this.agents.find((a) => a.id === id)
  }

  subscribe(fn: AgentListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.agents)
  }

  private pickStatus(): AgentStatus {
    let r = this.rng()
    for (const [status, w] of WEIGHTS) {
      if (r < w) return status
      r -= w
    }
    return 'working'
  }

  private duration(status: AgentStatus): number {
    const [lo, hi] = DURATIONS[status] ?? [8, 14]
    return lo + this.rng() * (hi - lo)
  }

  private task(status: AgentStatus): string | null {
    const pool = TASKS[status]
    if (!pool || pool.length === 0) return null
    return pool[Math.floor(this.rng() * pool.length)]
  }

  private assign(i: number, status: AgentStatus): void {
    const a = this.agents[i]
    a.status = status
    a.task = this.task(status)
    /*
     * A different tool family each time somebody picks work up, so a row of
     * busy desks is not a row of identical typing animations. The office is
     * meant to look like several people doing several different things.
     */
    a.activity =
      status === 'working'
        ? showcaseActivity(
            a.id,
            SHOWCASE_ACTIVITY[Math.floor(this.rng() * SHOWCASE_ACTIVITY.length)]
          )
        : null
    if (status !== 'talking') a.partnerId = null
    this.remaining[i] = this.duration(status)
  }

  /** True while any task - scripted or real - is playing out. */
  isBusy(): boolean {
    return this.taskActive || this.liveActive
  }

  /** Hold an agent where it is until something explicitly moves it on. */
  private hold(agentId: string, status: AgentStatus, task: string | null): void {
    const agent = this.get(agentId)
    if (!agent) return
    agent.status = status
    if (task !== null) agent.task = task
    this.remaining[this.agents.indexOf(agent)] = Number.POSITIVE_INFINITY
    this.emit()
  }

  /**
   * Run a task as a scripted simulation.
   *
   * Deliberately goes through the same show()/hide() lifecycle as a real task:
   * assignment brings characters into the world, and the end of the task takes
   * them out. Only the execution backend differs.
   */
  submitTask(prompt: string): boolean {
    if (this.isBusy()) return false

    const cast = this.agents.slice(0, 3)
    for (const agent of cast) {
      const joining = !agent.visible
      this.show(agent.id)
      if (joining) {
        this.events.emit({
          type: 'agent.started',
          agentId: agent.id,
          activity: 'Joined the task.'
        })
      }
    }

    this.script = buildTaskScript(prompt, this.getActive())
    this.scriptClock = 0
    this.scriptCursor = 0
    this.taskActive = true
    return true
  }

  /**
   * Apply an event from the main-process agent runtime.
   *
   * This is the whole real-mode path. The runtime up there owns the provider
   * and the tool loop; this side owns bodies in a room. Because activation and
   * deactivation arrive as events, the character lifecycle is identical
   * whether the task was run by OpenAI, by Gemini or by the scripted
   * simulation — there is no provider-specific spawning logic left.
   */
  applyRuntimeEvent(event: {
    type: string
    agentId?: string
    activity?: string
    message?: string
    task?: string
    action?: string
    tool?: string
    model?: string
    targetAgentId?: string
    /** The whole normalised activity, on `agent.activity` events. */
    agentActivity?: AgentActivity
  }): void {
    const id = event.agentId

    switch (event.type) {
      case 'agent.activated':
        if (id) {
          this.liveActive = true
          this.show(id)
          this.hold(id, 'thinking', event.action ?? 'Picking up the task')
        }
        break

      case 'agent.thinking':
        if (id) this.hold(id, 'thinking', event.action ?? 'Working out what to look at')
        break

      case 'agent.activity':
        if (id && event.agentActivity) {
          const agent = this.get(id)
          if (agent) agent.activity = event.agentActivity
        }
        if (id) this.hold(id, 'working', event.action ?? 'Working')
        break

      case 'agent.working':
        /*
         * The specific action - "Reading package.json" - becomes the agent's
         * task line, so the hover card and the world tag say what is actually
         * happening rather than a generic "working".
         */
        if (id) this.hold(id, 'working', event.action ?? 'Working')
        break

      case 'agent.message':
        if (id) this.hold(id, 'talking', 'Reporting back')
        break

      case 'agent.delegated':
        if (id && event.targetAgentId) {
          const from = this.get(id)
          const to = this.get(event.targetAgentId)
          if (from) from.partnerId = event.targetAgentId
          if (to) to.partnerId = id
        }
        if (id && event.targetAgentId) {
          // Phase 18: Pixel-World Synchronization
          // When an agent delegates a task to someone, both walk to a conversation spot and talk.
          this.hold(id, 'talking', `Delegating to ${event.targetAgentId}`)
          this.show(event.targetAgentId)
          this.hold(event.targetAgentId, 'talking', `Listening to ${id}`)
        }
        break

      case 'agent.completed':
        if (id) this.hold(id, 'success', 'Done')
        break

      case 'agent.failed':
        if (id) this.hold(id, 'error', 'Blocked')
        break

      case 'agent.idle':
        /*
         * Back to idle at the same desk - never removed. Once an agent has
         * been in the office it stays, so the room accumulates the user's team
         * instead of emptying after every task. The delay lets the success or
         * error state register first.
         */
        if (id) {
          const agentId = id
          window.setTimeout(() => {
            const agent = this.get(agentId)
            if (!agent || !agent.visible) return
            agent.status = 'idle'
            agent.task = null
            // Hand it back to the ambient scheduler so it settles naturally.
            this.remaining[this.agents.indexOf(agent)] = 2 + this.rng() * 3
            if (!this.anyBusy()) this.liveActive = false
            this.emit()
          }, 2200)
        }
        break

      default:
        break
    }
  }

  /** Advance the scripted timeline. Returns true if any agent changed. */
  private tickScript(dt: number): boolean {
    this.scriptClock += dt
    let changed = false

    while (
      this.scriptCursor < this.script.length &&
      this.script[this.scriptCursor].at <= this.scriptClock
    ) {
      const beat = this.script[this.scriptCursor++]

      if (beat.agentId && beat.status) {
        const agent = this.get(beat.agentId)
        if (agent) {
          agent.status = beat.status
          agent.task = beat.agentTask ?? agent.task
          // Hold the agent here until the next beat moves it.
          const idx = this.agents.indexOf(agent)
          this.remaining[idx] = Number.POSITIVE_INFINITY
          changed = true
        }
      }

      this.events.emit({
        type: beat.type,
        agentId: beat.agentId,
        activity: beat.activity,
        message: beat.message,
        task: beat.task
      })
    }

    if (this.scriptCursor >= this.script.length && this.taskActive) {
      // Timeline done: hand the office back to the ambient scheduler, which
      // settles everyone into normal work rather than freezing them.
      this.taskActive = false
      this.script = []
      // Same exit as a real task: everyone returns to idle, and stays.
      for (let i = 0; i < this.agents.length; i++) {
        if (this.agents[i].visible) this.assign(i, 'idle')
      }
      changed = true
    }
    return changed
  }

  tick(dt: number): void {
    // A real request drives the agents directly; the scheduler would fight it.
    if (this.liveActive) return

    if (this.taskActive) {
      if (this.tickScript(dt)) this.emit()
      return
    }

    let changed = false

    for (let i = 0; i < this.agents.length; i++) {
      if (!this.agents[i].visible) continue
      this.remaining[i] -= dt
      if (this.remaining[i] > 0) continue

      // A conversation ends for both participants at once.
      if (this.conversation && this.conversation.includes(i)) {
        const [a, b] = this.conversation
        this.conversation = null
        this.assign(a, 'working')
        this.assign(b, this.rng() > 0.5 ? 'working' : 'thinking')
        changed = true
        continue
      }

      let next = this.forced[i] ?? this.pickStatus()
      this.forced[i] = null

      // Talking needs someone to talk to. Draft a partner who is free.
      if (next === 'talking') {
        const partner = this.findPartner(i)
        if (partner === -1) {
          next = 'thinking'
        } else {
          const d = this.duration('talking')
          const topic = this.task('talking')
          for (const idx of [i, partner]) {
            this.agents[idx].status = 'talking'
            this.agents[idx].task = topic
            // Each end knows the other, so the pair turn to face each other
            // instead of addressing the room.
            this.agents[idx].partnerId =
              this.agents[idx === i ? partner : i].id
            this.remaining[idx] = d
          }
          this.conversation = [i, partner]
          changed = true
          continue
        }
      }

      this.assign(i, next)
      changed = true
    }

    if (changed) this.emit()
  }

  /** Someone not already mid-conversation and not celebrating. */
  private findPartner(self: number): number {
    const free: number[] = []
    for (let i = 0; i < this.agents.length; i++) {
      if (i === self) continue
      if (!this.agents[i].visible) continue
      if (this.agents[i].status === 'talking') continue
      if (this.agents[i].status === 'success') continue
      free.push(i)
    }
    if (free.length === 0) return -1
    return free[Math.floor(this.rng() * free.length)]
  }
}
