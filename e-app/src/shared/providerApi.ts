/**
 * The contract between the renderer and the main process.
 *
 * Types only — this file is erased at compile time, so both the preload bundle
 * and the React bundle import it without either pulling the other's runtime in.
 * Nothing here carries a credential: the renderer is never told an API key,
 * only whether one exists and its last four characters.
 */

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
  /** A specific agent id, or 'all' to involve the whole enabled team. */
  target?: string
}

export interface RunTaskAck {
  accepted: boolean
  taskId?: string
  error?: string
}

/** Mirrors the main process's RuntimeEvent. */
export interface AgentRuntimeEvent {
  type: string
  taskId?: string
  agentId?: string
  targetAgentId?: string
  agentName?: string
  activity?: string
  message?: string
  task?: string
  /** What the agent is doing right now, e.g. "Reading package.json". */
  action?: string
  tool?: string
  target?: string
  path?: string
  model?: string
  at: number
}

export type ExecutionProfile = 'quick' | 'normal' | 'deep'

/** An agent's persisted configuration. Never carries runtime state. */
export interface AgentConfig {
  id: string
  name: string
  role: string
  characterSlot: number
  providerId: string
  modelId: string | null
  instructions: string
  tools: string[]
  profile: ExecutionProfile
  enabled: boolean
  workspace: string | null
  canTalkTo: string[]
  autoMode: boolean
  /** List of agent IDs that this agent should automatically react to when they finish a task */
  triggers: string[]
  createdAt: number
  updatedAt: number
}

export interface ToolFamilyInfo {
  id: string
  label: string
  blurb: string
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
  }

  workspace: {
    get(): Promise<WorkspaceInfo>
    choose(): Promise<WorkspaceInfo>
    clear(): Promise<WorkspaceInfo>
  }

  agents: {
    list(): Promise<AgentConfig[]>
    save(agent: Partial<AgentConfig>): Promise<AgentConfig[]>
    remove(agentId: string): Promise<AgentConfig[]>
    toolFamilies(): Promise<ToolFamilyInfo[]>
    run(params: RunTaskParams): Promise<RunTaskAck>
    loadChat(workspaceId: string, agentId: string): Promise<any[]>
    appendChat(workspaceId: string, agentId: string, message: any): Promise<void>
    clearChat(workspaceId: string, agentId: string): Promise<void>
    /** Subscribe to runtime events. Returns an unsubscribe function. */
    onEvent(handler: (event: AgentRuntimeEvent) => void): () => void
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

  sessions: {
    list(): Promise<AgentSession[]>
    onChanged(handler: (sessions: AgentSession[]) => void): () => void
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
