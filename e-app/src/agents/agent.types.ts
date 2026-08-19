/**
 * The agent runtime layer.
 *
 * This layer knows NOTHING about pixels, themes, sprites or the office.
 * It only models "what is this AI agent currently doing". Today the values
 * are produced by a fake runtime; later they will be produced by real
 * provider events. Nothing downstream needs to change when that happens.
 */

/** What an agent is doing. This is *intent*, not animation. */
export type AgentStatus =
  | 'idle'
  | 'working'
  | 'thinking'
  | 'talking'
  | 'waiting'
  | 'success'
  | 'error'

export interface Agent {
  /** Stable id. Themes bind their characters to this. */
  id: string
  /** Which model powers this agent, e.g. "Claude Opus". */
  model: string
  status: AgentStatus
  /** Human readable current task, shown in tooltips. */
  task: string | null
  /**
   * Whether this agent is in the office yet. Reserves start inactive and are
   * called in as the workload grows, which is what makes the room fill up.
   */
  active: boolean
}

export type AgentListener = (agents: Agent[]) => void

/**
 * The contract the world renders against. A real Claude/OpenAI-backed
 * runtime can implement this same interface and the world will not notice.
 */
export interface AgentRuntime {
  getAgents(): Agent[]
  get(id: string): Agent | undefined
  /** Advance the simulation. dt in seconds. */
  tick(dt: number): void
  subscribe(fn: AgentListener): () => void
}
