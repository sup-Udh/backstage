import type { Agent, AgentListener, AgentRuntime, AgentStatus } from './agent.types'
import { makeRng } from '../world/pixel/ops'

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

  constructor(specs: FakeAgentSpec[], seed = 20260818) {
    this.rng = makeRng(seed)
    this.agents = specs.map((s) => ({
      id: s.id,
      model: s.model,
      status: 'idle',
      task: null
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

  tick(dt: number): void {
    let changed = false

    for (let i = 0; i < this.agents.length; i++) {
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
      if (this.agents[i].status === 'talking') continue
      if (this.agents[i].status === 'success') continue
      free.push(i)
    }
    if (free.length === 0) return -1
    return free[Math.floor(this.rng() * free.length)]
  }
}
