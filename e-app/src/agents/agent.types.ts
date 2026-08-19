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
  /** Stable id, matching the persisted configuration. */
  id: string
  /** The configured name. Authoritative over the character's own name. */
  name: string
  role: string
  /**
   * Which of the active theme's characters portrays this agent. A slot
   * rather than a character id, because the cast changes with the world.
   */
  slot: number
  /** Which model powers this agent, e.g. "Claude Opus". */
  model: string
  status: AgentStatus
  /** Human readable current task, shown in tooltips. */
  task: string | null
  /**
   * Whether this agent is configured and available at all.
   */
  active: boolean
  /**
   * Whether the agent is physically present in the world right now.
   *
   * Deliberately separate from `status`: an agent can be idle and visible
   * (mid-task, between steps) or idle and hidden (not on a task at all). The
   * world renders exactly the agents assigned to live work, so a big roster
   * does not permanently crowd the office.
   */
  visible: boolean
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
