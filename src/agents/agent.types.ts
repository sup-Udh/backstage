import type { AgentLifecycle } from '../shared/agents'
import type { ToolGroup } from './toolActivity'

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

  /**
   * Who this agent is currently exchanging something with.
   *
   * Set on both ends of a delegation or a message, and cleared when the
   * exchange is over. The world needs it for one thing that a status alone
   * cannot supply: which way to turn. "Talking" is not a direction, and two
   * characters who are talking to each other while facing their own monitors
   * is the difference between a conversation and a coincidence.
   */
  partnerId?: string | null

  /**
   * The family of the tool that most recently started running.
   *
   * The runtime already reports every tool call — this is not new information
   * and it is not a second state machine, it is the existing `tool` field on
   * `agent.tool.started` filed under a heading. What it buys is that reading a
   * file and running a command stop looking identical: one is a person with
   * their hands off the keyboard reading a screen, the other is a person
   * typing, and both of those are already what the tool names say.
   */
  activity?: ToolGroup | null
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
