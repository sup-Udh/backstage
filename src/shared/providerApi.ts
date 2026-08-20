/**
 * The contract between the renderer and the main process.
 *
 * Types only — this file is erased at compile time, so both the preload bundle
 * and the React bundle import it without either pulling the other's runtime in.
 * Nothing here carries a credential: the renderer is never told an API key,
 * only whether one exists and its last four characters.
 *
 * The agent domain itself lives in ./agents and is imported rather than
 * restated here. It was written down twice once, and the two copies drifted
 * until neither process could pass an agent to the other.
 */

import type {
  AgentConfig,
  AgentRuntimeState,
  AgentTask,
  AgentValidation,
  AwarenessSnapshot,
  CapabilityInfo,
  ChatMessage,
  CollaborationMessage,
  OrchestrationSettings,
  RuntimeEvent,
  Trigger
} from './agents'

export type * from './agents'

export interface ProviderModel {
  id: string
  name: string
  description: string
  verified: boolean
}

/** Static facts about a provider, for rendering its card. */
export interface ProviderDescriptor {
  id: string
  name: string
  blurb: string
  keyUrl: string
}

export interface ProviderStatus {
  id: string
  name: string
  connected: boolean
  hasKey: boolean
  /** Masked, e.g. "…4f2a". Never the whole key. */
  keyHint: string | null
  selectedModel: string | null
  models: ProviderModel[]
}

export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'network'
  | 'not_connected'
  | 'bad_request'
  | 'unknown'

export interface ConnectionResult {
  success: boolean
  error?: string
  errorKind?: ProviderErrorKind
  status?: ProviderStatus
}

/* ------------------------------------------------------------- workspace -- */

export interface WorkspaceInfo {
  root: string | null
  name: string | null
  exists: boolean
}

/* ----------------------------------------------------------------- tasks -- */

export interface GenerationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface RunTaskParams {
  prompt: string
  history?: GenerationTurn[]
  /** A specific agent id, or 'all' to involve every spawned, enabled agent. */
  target?: string
}

export interface RunTaskAck {
  accepted: boolean
  /** One task id per agent the request was accepted for. */
  taskIds?: string[]
  /** Who it actually went to, so the UI can say "3 recipients". */
  agentIds?: string[]
  error?: string
  /** Per-agent refusals, when some of a broadcast could not be started. */
  rejected?: { agentId: string; error: string }[]
}

/* ------------------------------------------------------------- approvals -- */

/**
 * A dangerous tool call waiting on the user.
 *
 * Everything needed to decide is here, including the real arguments: an
 * approval prompt that does not say what is being approved is theatre.
 */
export interface ApprovalRequest {
  id: string
  agentId: string
  agentName: string
  taskId: string
  executionId: string
  tool: string
  summary: string
  detail: string
  at: number
}

/* -------------------------------------------------------------- terminal -- */

export type TerminalStatus = 'starting' | 'running' | 'exited'
export type SessionAgent = 'claude' | 'codex' | 'gemini' | null

export interface TerminalSession {
  id: string
  title: string
  cwd: string
  shell: string
  status: TerminalStatus
  createdAt: number
  exitCode?: number
  agent: SessionAgent
  command: string | null
  pid?: number
}

export type AgentSessionStatus =
  | 'starting'
  | 'working'
  | 'waiting'
  | 'exited'
  | 'error'

/** A real external CLI session, e.g. Claude Code running in a PTY. */
export interface AgentSession {
  id: string
  provider: SessionAgent
  terminalSessionId: string
  cwd: string
  status: AgentSessionStatus
  startedAt: number
  endedAt?: number
  lastOutput?: string
  /** "Claude 1" until the user renames it. Unique across live sessions. */
  name: string
  /** Which of the active theme's characters stands in for this session. */
  characterSlot: number
  /** Other live sessions this one is connected to. */
  connections: string[]
}

/**
 * One line of a CLI session's readable transcript.
 *
 * Reconstructed from the PTY's output by a small terminal emulator, because a
 * full-screen CLI emits repaints rather than a conversation. `user` lines are
 * what was sent in; `output` lines are what the process printed. Nothing here
 * is interpreted — there is no attempt to label a line as "the assistant
 * speaking", because that structure does not exist in the byte stream.
 */
export interface SessionLine {
  id: string
  sessionId: string
  kind: 'user' | 'output'
  text: string
  at: number
}

/** Whether an operation on a session or a relationship succeeded. */
export interface OkResult {
  ok: boolean
  error?: string
}

/* -------------------------------------------------------- relationships -- */

export interface LinkResult extends OkResult {
  /** The roster after the change, so the caller never has to refetch. */
  agents: AgentConfig[]
}

/** A group of connected agents and the conversation they share. */
export interface ThreadInfo {
  id: string
  members: string[]
  names: string[]
}

export interface ThreadPostResult {
  accepted: boolean
  error?: string
  rejected?: { agentId: string; error: string }[]
}

export interface FileChange {
  kind: 'created' | 'modified' | 'deleted'
  path: string
  at: number
}

/* ----------------------------------------------------------- project ---- */

export interface DirEntry {
  name: string
  path: string
  kind: 'dir' | 'file'
  size?: number
}

export interface ProjectCommand {
  label: string
  command: string
  source: string
}

export interface TextResult {
  success: boolean
  output?: string
  content?: string
  error?: string
}

/* ------------------------------------------------------------------- api -- */

export interface BackstageApi {
  platform: string

  providers: {
    list(): Promise<ProviderDescriptor[]>
    status(): Promise<ProviderStatus[]>
    connect(providerId: string, apiKey: string): Promise<ConnectionResult>
    disconnect(providerId: string): Promise<ProviderStatus>
    test(providerId: string): Promise<ConnectionResult>
    selectModel(providerId: string, modelId: string): Promise<ProviderStatus>
    /**
     * Pushed when connection state changes on its own — notably when the keys
     * stored on disk finish being verified after launch.
     */
    onChanged(handler: (statuses: ProviderStatus[]) => void): () => void
  }

  workspace: {
    get(): Promise<WorkspaceInfo>
    choose(): Promise<WorkspaceInfo>
    clear(): Promise<WorkspaceInfo>
  }

  agents: {
    /* Configuration. */
    list(): Promise<AgentConfig[]>
    save(agent: Partial<AgentConfig>): Promise<AgentConfig[]>
    remove(agentId: string): Promise<AgentConfig[]>
    capabilities(): Promise<CapabilityInfo[]>
    /** Why an agent cannot be spawned, in the user's terms. */
    validate(agentId: string): Promise<AgentValidation>

    /* Presence. Spawning is explicit and persisted; it is not "is working". */
    spawn(agentId: string): Promise<{ agents: AgentConfig[]; validation: AgentValidation }>
    despawn(agentId: string): Promise<AgentConfig[]>

    /* Live state, one entry per agent. Never a single global status. */
    states(): Promise<AgentRuntimeState[]>

    /* Work. */
    run(params: RunTaskParams): Promise<RunTaskAck>
    /** Stop one agent. Every other agent keeps working. */
    cancel(agentId: string): Promise<boolean>
    /** Stop every Backstage-managed execution. Leaves external CLIs alone. */
    stopAll(): Promise<number>
    retry(taskId: string): Promise<RunTaskAck>
    tasks(agentId?: string): Promise<AgentTask[]>

    /* Private per-agent memory. */
    loadChat(workspaceId: string, agentId: string): Promise<ChatMessage[]>
    appendChat(
      workspaceId: string,
      agentId: string,
      message: ChatMessage
    ): Promise<void>
    clearChat(workspaceId: string, agentId: string): Promise<void>

    /* Shared team activity, which is a different thing from memory. */
    collaboration(agentId?: string): Promise<CollaborationMessage[]>
    awareness(): Promise<AwarenessSnapshot>

    /**
     * Collaboration links, in both directions.
     *
     * The cap lives in the main process, so these can be refused. The UI
     * checks too, but only so a button can grey out rather than fail — a
     * limit enforced solely in the renderer is not enforced.
     */
    connect(a: string, b: string): Promise<LinkResult>
    disconnect(a: string, b: string): Promise<LinkResult>

    /** Subscribe to runtime events. Returns an unsubscribe function. */
    onEvent(handler: (event: RuntimeEvent) => void): () => void
  }

  /**
   * Shared conversations between connected agents.
   *
   * Kept apart from `agents.loadChat`, which is one agent's private memory.
   * A thread is the group's, and neither ever becomes part of the other.
   */
  threads: {
    /** The group this agent belongs to, or null if it has no connections. */
    for(agentId: string): Promise<ThreadInfo | null>
    load(threadId: string): Promise<ChatMessage[]>
    clear(threadId: string): Promise<void>
    /** Post into the group. Every member answers on its own queue. */
    post(agentId: string, prompt: string): Promise<ThreadPostResult>
  }

  automation: {
    settings(): Promise<OrchestrationSettings>
    updateSettings(patch: Partial<OrchestrationSettings>): Promise<OrchestrationSettings>
    listTriggers(): Promise<Trigger[]>
    saveTrigger(trigger: Partial<Trigger>): Promise<Trigger[]>
    removeTrigger(triggerId: string): Promise<Trigger[]>
  }

  approvals: {
    pending(): Promise<ApprovalRequest[]>
    resolve(id: string, approved: boolean): Promise<boolean>
    onRequest(handler: (request: ApprovalRequest) => void): () => void
  }

  terminal: {
    list(): Promise<TerminalSession[]>
    create(options?: { cols?: number; rows?: number; title?: string }): Promise<TerminalSession>
    /** Send keystrokes to a live PTY. This is real stdin. */
    write(id: string, data: string): Promise<boolean>
    resize(id: string, cols: number, rows: number): Promise<void>
    kill(id: string): Promise<void>
    close(id: string): Promise<TerminalSession[]>
    /** Replay buffer, so a reopened panel shows prior output. */
    buffer(id: string): Promise<string>
    onOutput(handler: (e: { id: string; data: string }) => void): () => void
    onExit(handler: (e: { id: string; exitCode: number }) => void): () => void
    onSessions(handler: (sessions: TerminalSession[]) => void): () => void
  }

  /**
   * External CLI agent sessions, as first-class workers.
   *
   * Everything here acts on the real process. `send` writes to the same stdin
   * the keyboard does, and `interrupt` delivers a genuine SIGINT — there is
   * one session, and the chat is another view of it rather than a separate
   * conversation with a copy of it.
   */
  sessions: {
    list(): Promise<AgentSession[]>
    /** The readable transcript so far, for a panel opening mid-conversation. */
    lines(sessionId: string): Promise<SessionLine[]>
    /** Send a message to the session's stdin. */
    send(sessionId: string, text: string): Promise<OkResult>
    /** Interrupt the current turn. The session and its context survive. */
    interrupt(sessionId: string): Promise<boolean>
    rename(sessionId: string, name: string): Promise<OkResult>
    setCharacter(sessionId: string, slot: number): Promise<boolean>

    /**
     * Links between two live sessions.
     *
     * Same limits as agent connections, enforced in the main process. Held in
     * memory rather than persisted: a relationship between two processes
     * cannot outlive them.
     */
    connect(a: string, b: string): Promise<OkResult>
    disconnect(a: string, b: string): Promise<OkResult>
    group(sessionId: string): Promise<ThreadInfo | null>
    /** Send one message to every session in the group's real stdin. */
    postGroup(sessionId: string, text: string): Promise<ThreadPostResult>

    onChanged(handler: (sessions: AgentSession[]) => void): () => void
    onLine(handler: (line: SessionLine) => void): () => void
  }

  files: {
    list(path: string): Promise<DirEntry[]>
    read(path: string): Promise<TextResult>
    search(query: string, filenames?: boolean): Promise<TextResult>
    onChanges(
      handler: (e: { changes: FileChange[]; total: number }) => void
    ): () => void
  }

  git: {
    status(): Promise<TextResult>
    diff(path?: string): Promise<TextResult>
    log(): Promise<TextResult>
    branch(): Promise<{ branch: string | null }>
  }

  commands: {
    list(): Promise<ProjectCommand[]>
  }
}

declare global {
  interface Window {
    backstage: BackstageApi
  }
}
