/**
 * The agent domain.
 *
 * Types only, so this file is erased at compile time and both processes can
 * import it without either pulling the other's runtime in. It exists because
 * an agent is described in four places — the persisted store, the runtime, the
 * IPC bridge and the UI — and a schema written down four times drifts apart
 * four ways. There is exactly one definition of an agent, and it is here.
 *
 * Nothing in this file carries a credential. The renderer learns which
 * provider an agent uses, never the key behind it.
 */

/* ---------------------------------------------------------- capabilities -- */

/**
 * What an agent is permitted to do.
 *
 * Deliberately finer-grained than the tool families it replaces: "can read
 * files" and "can rewrite files" are not the same decision, and neither is
 * "can look at git" and "can commit". Every tool declares the capability it
 * needs, so a tool cannot be reached by an agent that was not granted it.
 */
export type CapabilityId =
  | 'files.read'
  | 'files.write'
  | 'terminal.execute'
  | 'git.read'
  | 'git.commit'
  | 'web.search'
  | 'agents.talk'

export interface CapabilityInfo {
  id: CapabilityId
  /** The heading it is listed under: FILES, TERMINAL, GIT, WEB, AGENTS. */
  group: string
  label: string
  blurb: string
  /**
   * True when granting it lets the agent change something or spend something.
   * Privileged capabilities are never on by default.
   */
  privileged: boolean
}

/* --------------------------------------------------------------- agents -- */

export type ExecutionProfile = 'quick' | 'normal' | 'deep'

/**
 * Who an agent is. Persisted; survives restarts.
 *
 * Configuration only. What an agent is *doing* lives in AgentRuntimeState and
 * is never written to disk — mixing them would mean persisting "currently
 * working", which is false the moment the app is closed.
 */
export interface AgentConfig {
  id: string
  name: string
  /** Shown in place of `name` when set. Empty means "use the name". */
  displayName: string
  role: string
  providerId: string
  /** null means "whatever that provider has selected as its default". */
  modelId: string | null
  /** The agent's persistent instruction, added to Backstage's base rules. */
  instructions: string
  capabilities: CapabilityId[]
  profile: ExecutionProfile
  /**
   * The theme whose cast the character was picked from. A character is only
   * meaningful inside its own world, so the theme is stored with the slot.
   */
  themeId: string | null
  /**
   * Which of the active theme's characters portrays this agent. A slot rather
   * than a character id, because the cast changes with the world.
   */
  characterSlot: number
  enabled: boolean
  /**
   * Whether the agent has been brought into the workspace.
   *
   * Distinct from `enabled` and from being busy: spawned means "exists in the
   * world and can receive work", not "is working". Persisted, so the office is
   * the same room when the app reopens.
   */
  spawned: boolean
  /** Absolute path this agent is bound to. null follows the open workspace. */
  workspace: string | null
  /** Agents this one may send work or messages to. Directional. */
  canTalkTo: string[]
  createdAt: number
  updatedAt: number
}

/* ------------------------------------------------------------- lifecycle -- */

/**
 * The agent state machine, defined once.
 *
 * Every surface — the roster, the world, the team header, the chat panel —
 * reads these and only these. A component that invents its own status is a
 * component that will eventually disagree with the runtime.
 *
 *   offline   not enabled, or its provider is not connected
 *   ready     spawned and able to work, nothing assigned yet
 *   idle      spawned, has finished its work, nothing assigned now
 *   queued    work is waiting behind something else
 *   thinking  a model call is in flight
 *   working   running tools
 *   talking   reporting, or sending to another agent
 *   waiting   blocked on another agent or on approval
 *   error     the last execution failed
 */
export type AgentLifecycle =
  | 'offline'
  | 'ready'
  | 'idle'
  | 'queued'
  | 'thinking'
  | 'working'
  | 'talking'
  | 'waiting'
  | 'error'

/** Statuses that mean the agent is actively occupied. */
export const BUSY_STATUSES: AgentLifecycle[] = [
  'queued',
  'thinking',
  'working',
  'talking',
  'waiting'
]

/**
 * What an agent is doing right now. Never persisted.
 *
 * One of these exists per agent, independently. There is deliberately no
 * "current agent" anywhere in the runtime: every value here is reached through
 * an agentId, which is what lets three agents work at once.
 */
export interface AgentRuntimeState {
  agentId: string
  status: AgentLifecycle
  /** Specific and present-tense: "Reading package.json". */
  action: string | null
  /** Headline of the task being worked on. */
  task: string | null
  taskId: string | null
  executionId: string | null
  /** How many tasks are waiting behind the current one. */
  queued: number
  lastError: string | null
  spawned: boolean
  enabled: boolean
  /** False when the agent's provider has no usable connection. */
  runnable: boolean
  updatedAt: number
}

/* ----------------------------------------------------------------- tasks -- */

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AgentTask {
  id: string
  agentId: string
  prompt: string
  /** Short headline, for lists. */
  title: string
  status: TaskStatus
  /** Who started it: the user, another agent, or a trigger. */
  origin: 'user' | 'agent' | 'trigger'
  originAgentId: string | null
  /**
   * Ties every task descended from one originating request together, so a
   * chain can be counted and capped however far it branches.
   */
  correlationId: string
  depth: number
  parentTaskId: string | null
  executionId: string | null
  createdAt: number
  startedAt: number | null
  endedAt: number | null
  result: string | null
  error: string | null
}

/* ---------------------------------------------------------------- events -- */

export type RuntimeEventType =
  // Tasks
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  // Agent lifecycle
  | 'agent.state'
  | 'agent.spawned'
  | 'agent.despawned'
  | 'agent.activated'
  | 'agent.thinking'
  | 'agent.working'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.cancelled'
  | 'agent.idle'
  // Tools
  | 'agent.tool.started'
  | 'agent.tool.completed'
  | 'agent.tool.failed'
  // What the agent says to the user
  | 'agent.message'
  /**
   * A fragment of prose, as the model produces it.
   *
   * Carries `message` (the fragment, not the whole text so far) and the
   * `executionId` it belongs to. Deliberately separate from `agent.message`:
   * a delta is provisional and is never written to memory, while a message
   * is something the agent has finished saying. A consumer that ignores
   * deltas entirely still shows a complete, correct conversation.
   */
  | 'agent.message.delta'
  // Agent to agent
  | 'agent.message.sent'
  | 'agent.message.received'
  | 'agent.delegated'
  /** A collaboration link was created or removed between two agents. */
  | 'agent.connected'
  | 'agent.disconnected'
  // Automation
  | 'trigger.fired'
  | 'trigger.blocked'
  // Workspace
  | 'file.created'
  | 'file.modified'
  | 'file.deleted'
  | 'git.changed'
  | 'terminal.started'
  | 'terminal.exited'

/**
 * One thing that happened.
 *
 * The renderer turns these into chat lines, roster status and character
 * behaviour. It never inspects a provider, which is why an OpenAI agent and a
 * Gemini agent are indistinguishable everywhere above this line.
 */
export interface RuntimeEvent {
  id: string
  type: RuntimeEventType
  at: number

  agentId?: string
  /** Display name, so no consumer has to resolve configuration. */
  agentName?: string
  targetAgentId?: string
  targetAgentName?: string

  taskId?: string
  parentTaskId?: string
  executionId?: string
  correlationId?: string
  depth?: number

  /** Line for the activity rail. */
  activity?: string
  /** Line for the transcript. */
  message?: string
  /** Task headline. */
  task?: string
  /** What the agent is doing right now, e.g. "Reading package.json". */
  action?: string

  tool?: string
  path?: string
  model?: string
  provider?: string
  /** On trigger.* events. */
  triggerId?: string
  triggerName?: string
  reason?: string
  /** On agent.state events: the whole new state, so no consumer infers it. */
  state?: AgentRuntimeState
}

/* --------------------------------------------------- agent collaboration -- */

export type CollaborationKind = 'delegation' | 'message' | 'trigger'

/** A real agent-to-agent event, recorded whether or not anyone is watching. */
export interface CollaborationMessage {
  id: string
  senderAgentId: string
  senderName: string
  receiverAgentId: string
  receiverName: string
  message: string
  /** Why it was sent: the sending agent's stated reason, or the trigger. */
  reason: string
  taskId: string | null
  correlationId: string
  depth: number
  kind: CollaborationKind
  at: number
}

/* ------------------------------------------------------------ automation -- */

export type TriggerEventType =
  | 'agent.task.completed'
  | 'agent.task.started'
  | 'agent.error'
  | 'file.changed'
  | 'git.changed'
  | 'task.created'
  | 'task.completed'
  | 'agent.message.received'

export type TriggerActionType =
  | 'send.message'
  | 'create.task'
  | 'request.review'
  | 'notify.user'

/**
 * WHEN [event] IF [condition] THEN [action].
 *
 * Every trigger carries its own safety limits rather than relying on a global
 * setting, because the dangerous trigger in a set is rarely the one the global
 * default was chosen for.
 */
export interface Trigger {
  id: string
  name: string
  enabled: boolean
  event: TriggerEventType
  /** null means any agent. */
  sourceAgentId: string | null
  /** Optional substring the event's text must contain for the trigger to run. */
  condition: string | null
  action: TriggerActionType
  targetAgentId: string | null
  message: string
  maxChainDepth: number
  cooldownMs: number
  /** Persisted, so restarting cannot be used to bypass a cooldown. */
  lastFiredAt: number | null
  fireCount: number
  createdAt: number
  updatedAt: number
}

/**
 * Orchestration settings. Persisted.
 *
 * AUTO is off by default and stays off until the user turns it on: automatic
 * collaboration spends real money, and a default that surprises someone with a
 * bill is not a defensible default.
 */
export interface OrchestrationSettings {
  autoCollaboration: boolean
  maxChainDepth: number
  defaultCooldownMs: number
  /** Cap on automatic messages descending from one originating task. */
  maxMessagesPerChain: number
}

/* ---------------------------------------------------------- verification -- */

/** Why an agent cannot be spawned, in the user's terms. Empty means it can. */
export interface AgentValidation {
  agentId: string
  ok: boolean
  problems: string[]
}

/* ------------------------------------------------------------- awareness -- */

/**
 * Structured shared awareness.
 *
 * Agents are told what the team is doing through this, never by being handed
 * another agent's private conversation. Shared world state and private memory
 * are different things and are kept that way.
 */
export interface AwarenessSnapshot {
  workspace: { root: string | null; name: string | null; exists: boolean }
  git: { branch: string | null; dirty: number }
  agents: AgentRuntimeState[]
  tasks: AgentTask[]
  recentEvents: RuntimeEvent[]
  recentMessages: CollaborationMessage[]
  settings: OrchestrationSettings
}

/* ------------------------------------------------------------ transcript -- */

/** A line in one agent's private conversation. */
export interface ChatMessage {
  id: string
  kind: 'user' | 'agent' | 'system' | 'collaboration'
  agentId: string
  /** Who spoke, when it was not this agent or the user. */
  fromAgentId?: string
  fromName?: string
  text: string
  at: number
  taskId?: string
}
