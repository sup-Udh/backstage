import type { Agent, AgentListener, AgentRuntime, AgentStatus } from './agent.types'
import { makeRng } from '../world/pixel/ops'
import { EventBus } from './agentEvents'
import { buildTaskScript, type Beat } from './taskScript'
import { INITIAL_ACTIVE } from './roster'

/**
 * A stand-in for the real agent event stream.
 *
 * It exists so the world has something to react to today. When real provider
 * events arrive, this class is replaced by one that implements the same
 * AgentRuntime interface and the world layer does not change:
 *
 *     fakeAgent.status = 'working'   ->   realAgent.status = 'working'
 */

interface Plan {
  status: AgentStatus
  /** Seconds this status lasts. */
  duration: number
  task: string | null
}

const TASKS: Record<AgentStatus, string[]> = {
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

const DURATIONS: Record<AgentStatus, [number, number]> = {
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
      model: s.model,
      status: 'idle',
      task: null,
      active: i < INITIAL_ACTIVE
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
      if (!a.active) return
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

  /** Only the agents currently in the office. */
  getActive(): Agent[] {
    return this.agents.filter((a) => a.active)
  }

  /**
   * Call in the next reserve. Returns the agent, or null if everyone is
   * already here. The world notices the new active agent on its next tick and
   * walks them in from the door.
   */
  activateNext(): Agent | null {
    const next = this.agents.find((a) => !a.active)
    if (!next) return null
    next.active = true
    next.status = 'idle'
    next.task = null
    this.remaining[this.agents.indexOf(next)] = 1.5
    this.emit()
    return next
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
    const [lo, hi] = DURATIONS[status]
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
   * Run a task against a real provider.
   *
   * The agent state machine and the events are exactly the ones the scripted
   * path emits, so the world, the activity feed and the transcript cannot tell
   * a real request from a simulated one. The only difference is that the
   * middle of the sequence is an awaited network call rather than a timer.
   */
  async runLiveTask(
    prompt: string,
    execute: (input: string) => Promise<{ text: string; model?: string }>
  ): Promise<void> {
    if (this.isBusy()) return

    const lead = this.getActive()[0]
    if (!lead) return

    this.liveActive = true
    const title = prompt.trim().replace(/\s+/g, ' ').slice(0, 46)

    this.events.emit({
      type: 'task.created',
      task: title,
      activity: `Task received: ${title}`
    })

    this.hold(lead.id, 'thinking', 'Reading the brief')
    this.events.emit({
      type: 'agent.thinking',
      agentId: lead.id,
      activity: 'Started reading the brief.'
    })

    // A beat of thinking before the walk to a desk, so the sequence reads.
    await new Promise((r) => setTimeout(r, 600))

    this.hold(lead.id, 'working', title)

    try {
      const result = await execute(prompt)

      this.events.emit({
        type: 'agent.working',
        agentId: lead.id,
        activity: result.model
          ? `Working with ${result.model}.`
          : 'Working on the task.'
      })

      this.hold(lead.id, 'success', 'Done')
      this.events.emit({
        type: 'agent.completed',
        agentId: lead.id,
        activity: 'Completed the task.',
        message: result.text
      })
      this.events.emit({ type: 'task.completed', task: title, activity: 'Task closed.' })
    } catch (err) {
      // The character must never be left stuck in `working`.
      this.hold(lead.id, 'error', 'Blocked')
      this.events.emit({
        type: 'agent.failed',
        agentId: lead.id,
        activity: 'Could not finish the task.',
        message:
          err instanceof Error
            ? err.message
            : 'Something went wrong while contacting the provider.'
      })
      this.events.emit({ type: 'task.failed', task: title, activity: 'Task failed.' })
    } finally {
      // Let the result register, then hand the office back to the scheduler.
      await new Promise((r) => setTimeout(r, 1800))
      this.liveActive = false
      for (let i = 0; i < this.agents.length; i++) {
        if (this.agents[i].active) this.assign(i, i % 2 === 0 ? 'working' : 'idle')
      }
      this.emit()
    }
  }

  /**
   * Accept a task from the user and play its timeline. Ignored while another
   * task is still running, so the office can never be driven by two scripts.
   */
  submitTask(prompt: string): boolean {
    if (this.taskActive) return false

    // Every new task brings one more pair of hands into the office.
    const joined = this.activateNext()
    if (joined) {
      this.events.emit({
        type: 'agent.started',
        agentId: joined.id,
        activity: 'Joined the team.'
      })
    }

    this.script = buildTaskScript(prompt, this.getActive())
    this.scriptClock = 0
    this.scriptCursor = 0
    this.taskActive = true
    return true
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
      for (let i = 0; i < this.agents.length; i++) {
        if (this.agents[i].active) this.assign(i, i % 2 === 0 ? 'working' : 'idle')
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
      if (!this.agents[i].active) continue
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
      if (!this.agents[i].active) continue
      if (this.agents[i].status === 'talking') continue
      if (this.agents[i].status === 'success') continue
      free.push(i)
    }
    if (free.length === 0) return -1
    return free[Math.floor(this.rng() * free.length)]
  }
}
