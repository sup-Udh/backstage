/**
 * Agent definitions, main process.
 *
 * Configuration and runtime state are deliberately separate types. An agent is
 * a persistent thing — a role, a model, a set of tools. A task is temporary,
 * and what an agent is doing right now is temporary too. Mixing them would
 * mean writing "currently working" to disk.
 */

export type ExecutionProfile = 'quick' | 'normal' | 'deep'

/** Tool families an agent can be granted. */
export type ToolFamily = 'filesystem' | 'terminal' | 'git' | 'web'

/** Who an agent is. Persisted; survives restarts. */
export interface AgentConfig {
  id: string
  name: string
  role: string
  /**
   * Which of the active theme's characters portrays this agent. A slot rather
   * than a character id, because the cast changes with the world.
   */
  characterSlot: number
  providerId: string
  /** null means "whatever that provider has selected". */
  modelId: string | null
  instructions: string
  tools: string[]
  profile: ExecutionProfile
  enabled: boolean
}

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface AgentTask {
  id: string
  prompt: string
  status: TaskStatus
  assignedAgents: string[]
  createdAt: number
  completedAt?: number
  result?: string
  error?: string
}

/**
 * Events the runtime emits. The renderer turns these into chat lines,
 * activity entries and character behaviour — it never inspects the provider.
 */
export type RuntimeEventType =
  | 'task.created'
  | 'task.completed'
  | 'task.failed'
  | 'agent.activated'
  | 'agent.thinking'
  | 'agent.working'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.idle'
  | 'agent.tool.started'
  | 'agent.tool.completed'
  | 'agent.tool.failed'
  | 'agent.message'
  | 'file.created'
  | 'file.modified'
  | 'file.deleted'

export interface RuntimeEvent {
  type: RuntimeEventType
  taskId?: string
  agentId?: string
  /** Display name, so the renderer need not resolve config. */
  agentName?: string
  /** Line for the activity feed. */
  activity?: string
  /** Line for the transcript. */
  message?: string
  /** Task headline. */
  task?: string
  /**
   * What the agent is doing right now, in specific terms:
   * "Reading package.json", "Running npm run build".
   */
  action?: string
  tool?: string
  target?: string
  path?: string
  model?: string
  at: number
}
