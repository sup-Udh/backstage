import type { AgentLifecycle } from '../shared/agents'

/**
 * The renderer's view of an agent.
 *
 * This layer knows nothing about providers, tools or prompts. It models "what
 * is this agent doing" so the world can draw a body doing it.
 *
 * The status vocabulary is not invented here. It is the main process's
 * lifecycle, imported, plus exactly one addition: `success`, a brief
 * celebration the world plays when a task lands. That is a visual flourish
 * with no runtime meaning, which is why it is the only thing this side adds —
 * everything else would be a second state machine drifting from the first.
 */
export type AgentStatus = AgentLifecycle | 'success'

export type { AgentLifecycle }

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
  /**
   * Show this agent's own name rather than the character's.
   *
   * Configured agents are re-cast by the theme — Jane becomes Rachel in
   * another world. An external CLI session is not part of any cast: it is
   * Claude or Codex wherever it runs, so it keeps its name.
   */
  useOwnName?: boolean
  /** Which model powers this agent, e.g. "gpt-5-mini". */
  model: string
  /** Provider label, for the badge. */
  provider: string
  status: AgentStatus
  /** What it is doing right now, in specific terms. Shown in tooltips. */
  task: string | null
  /** The execution this status belongs to, so stale events can be ignored. */
  taskId: string | null
  executionId: string | null
  /** How many tasks are waiting behind the current one. */
  queued: number
  /** Configured and not disabled. */
  active: boolean
  /**
   * Brought into the workspace by the user.
   *
   * Deliberately distinct from "is working". A spawned agent with nothing to
   * do is present and idle, which is exactly what an office looks like.
   */
  spawned: boolean
  /**
   * Whether the agent has a body in the world right now.
   *
   * Follows `spawned` for configured agents. External CLI sessions set it
   * directly, because they have no configuration to spawn from.
   */
  visible: boolean
}

export type AgentListener = (agents: Agent[]) => void

/**
 * The contract the world renders against.
 *
 * Both the live team and the landing page's simulation implement it, which is
 * why the renderer cannot tell them apart — and why the showcase can keep its
 * ambient scheduler without that behaviour ever reaching a real agent.
 */
export interface AgentRuntime {
  getAgents(): Agent[]
  get(id: string): Agent | undefined
  /** Advance the simulation. dt in seconds. */
  tick(dt: number): void
  subscribe(fn: AgentListener): () => void
}
