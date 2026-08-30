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

import type { ActivityEvent, AgentActivity } from './activity'
import type {
  AgentConfig,
  AgentRuntimeState,
  AgentTask,
  AgentValidation,
  AutomationRun,
  AwarenessSnapshot,
  CapabilityInfo,
  ChatMessage,
  CollaborationMessage,
  GroupChatSummary,
  OrchestrationSettings,
  PermissionCategory,
  PermissionCategoryInfo,
  PermissionDecision,
  PermissionRecord,
  ProjectPermissions,
  RuntimeEvent,
  Trigger
} from './agents'
import type {
  Case,
  LegacyAdoption,
  Project,
  ProjectBootstrap,
  ProjectDraft,
  ProjectPatch,
  ProjectSnapshot
} from './projects'
import type { AuthApi } from './auth'

export type * from './agents'
export type * from './activity'
export type * from './projects'
export type * from './auth'

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
  /** A specific agent id, or an array of agent ids for a sequential team execution. */
  target?: string | string[]
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
  /** Who the agent is acting for, when it is not the user. */
  requestedByName: string | null
  /** Set when the work came from an automation rather than from a person. */
  automationName: string | null
  taskId: string
  executionId: string
  tool: string
  /** Which permission rule this falls under, so the card can name it. */
  category: PermissionCategory
  summary: string
  detail: string
  /** The folder it would happen in. */
  workspaceName: string | null
  at: number
}

/** What the user chose. `session` also stops the category asking again today. */
export type ApprovalAnswer = 'allow' | 'session' | 'deny'

/* -------------------------------------------------------------- terminal -- */

export type TerminalStatus = 'starting' | 'running' | 'exited'
export type SessionAgent = 'claude' | 'codex' | 'gemini' | null

export interface TerminalSession {
  id: string
  projectId: string
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
  projectId: string | null
  provider: SessionAgent
  terminalSessionId: string
  cwd: string
  status: AgentSessionStatus
  startedAt: number
  endedAt?: number
  lastOutput?: string
  /** "Claude 1" until the user renames it. Unique across live sessions. */
  name: string
  /**
   * Which of the active theme's characters stands in for this session.
   *
   * -1 until somebody decides. The renderer picks a free character when the
   * user has not, because choosing one needs the theme's cast — which the
   * process that creates sessions has no knowledge of.
   */
  characterSlot: number
  /** True once the user picked deliberately, so nothing reassigns it. */
  characterChosen: boolean
  /** Other live sessions this one is connected to. */
  connections: string[]
  /**
   * What this session is doing, in the same vocabulary every agent uses.
   *
   * Read from the tool banners Claude Code actually renders as it performs an
   * operation — never from its prose, and never from an announced intention.
   * Null when nothing recognisable has been printed, in which case `status`
   * still says whether the process is producing output.
   */
  activity: AgentActivity | null
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

/* ----------------------------------------------------------- claude ------ */

/**
 * Whether Claude Code is usable on this machine.
 *
 * Three states rather than a boolean, because "not installed" and "installed
 * but will not run" need different words in front of the user: one is an
 * install step, the other is a broken environment, and telling somebody to
 * reinstall a CLI that is already on their PATH wastes their afternoon.
 *
 * `running` and `stopped` are deliberately *not* here. Those describe a
 * session, and sessions already have `AgentSessionStatus`. Detection describes
 * the machine.
 */
export type ClaudeState = 'available' | 'not_installed' | 'failed_to_start'

export interface ClaudeDetection {
  state: ClaudeState
  /** Where it resolved on PATH, when it did. */
  path: string | null
  /** Only ever a version that was actually reported. Never invented. */
  version: string | null
  checkedAt: number
  /** Technical detail for `failed_to_start`, shown in settings. */
  detail: string | null
}

/* -------------------------------------------------------- relationships -- */

export interface LinkResult extends OkResult {
  /** The roster after the change, so the caller never has to refetch. */
  agents: AgentConfig[]
  /**
   * Agents granted the ability to talk as part of this connection.
   *
   * Connecting two agents implies they may contact each other, but the tools
   * that do the contacting need the `agents.talk` capability — so linking
   * grants it. Reported here so the change can be shown rather than made
   * quietly.
   */
  granted?: string[]
}

/** A group of connected agents and the conversation they share. */
export interface ThreadInfo {
  id: string
  members: string[]
  names: string[]
  /** The member who leads the rest, when one leads all of them. */
  leadId: string | null
}

/**
 * Who a group message is for.
 *
 * `all` reaches every spawned member independently; `lead` goes to the one who
 * leads the rest, who may then delegate; an agent id addresses one member in
 * front of the group.
 */
export type ThreadRecipient = 'all' | 'lead' | (string & {})

/** What `automation:parse` makes of a sentence, before the user confirms it. */
export interface AutomationDraft {
  name: string
  event: Trigger['event']
  schedule: Trigger['schedule']
  action: Trigger['action']
  agentIds: string[]
  message: string
  condition: string | null
  /** What the parser recognised, in the user's own words. */
  matched: string[]
  /** What it could not work out. */
  missing: string[]
}

export interface AutomationRunResult {
  ok: boolean
  runId?: string
  error?: string
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

  /**
   * The account everything else belongs to.
   *
   * First in the interface because it is first in the data model: a project is
   * owned by a user, and every agent, conversation and case is reached through
   * a project. Nothing below this line answers with anything at all while
   * `auth.state()` reports `unauthenticated`.
   */
  auth: AuthApi

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

  /**
   * Projects: the container everything else is scoped to.
   *
   * Many are stored and exactly one is open. Opening one re-points the
   * workspace, so every file and terminal tool follows without being told.
   */
  projects: {
    /** What was found on disk, and whether pre-project state needs adopting. */
    bootstrap(): Promise<ProjectBootstrap>
    list(): Promise<Project[]>
    active(): Promise<Project | null>
    /**
     * Pick a folder without opening it.
     *
     * Setup needs a path several steps before the project exists; adopting it
     * then would point every tool at a folder the user has not finished
     * choosing, and strand them there if they abandoned the wizard.
     */
    chooseFolder(): Promise<{ path: string; name: string } | null>
    /** Create the project and one agent per character in its roster. */
    create(draft: ProjectDraft): Promise<ProjectSnapshot | { error: string }>
    open(projectId: string): Promise<ProjectSnapshot | null>
    update(projectId: string, patch: ProjectPatch): Promise<Project | null>
    /**
     * Forget a project, with its agents, automations, cases and transcripts.
     *
     * The folder on disk is not touched. Returns the projects that remain, so
     * the caller never has to re-list to find out what is left.
     */
    remove(projectId: string): Promise<Project[]>
    /** Fold pre-project workspace, roster and theme into a real project. */
    adoptLegacy(input: LegacyAdoption): Promise<ProjectSnapshot | null>
  }

  /**
   * Investigations within the open project.
   *
   * A case is what the user asked for; its tasks are how the team went about
   * it. Cases persist and are project-scoped; the tasks under them are a
   * record of this session's work and are not persisted, so a case can
   * outlive the tasks it lists.
   */
  cases: {
    list(): Promise<Case[]>
    tasks(caseId: string): Promise<AgentTask[]>
    rename(caseId: string, name: string): Promise<Case[]>
    setStatus(caseId: string, status: 'open' | 'closed'): Promise<Case[]>
    remove(caseId: string): Promise<Case[]>
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

    /**
     * What every agent is doing, in normalised terms.
     *
     * Also present on each `AgentRuntimeState`, so this is only for the first
     * paint and for recovering after a project switch — the live path is the
     * `agent.activity` event and the state that travels with it.
     */
    activities(): Promise<AgentActivity[]>
    /** Recent activity, oldest first. The whole project, or one agent. */
    activityTimeline(agentId?: string): Promise<ActivityEvent[]>

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
    /**
     * Post into the group.
     *
     * `recipient` chooses between the whole group, its lead, or one named
     * member — the last still posts into the group conversation, it just says
     * who it is for. Every recipient answers on its own queue.
     */
    post(
      agentId: string,
      prompt: string,
      recipient?: ThreadRecipient
    ): Promise<ThreadPostResult>
  }

  /**
   * Group conversations, as a list.
   *
   * There is no `create`: a group *is* a connection between agents, so
   * connecting two agents creates the conversation and disconnecting them ends
   * it. What can be set is only what a derivation cannot know — the name, and
   * whether it has been read.
   */
  groups: {
    list(): Promise<GroupChatSummary[]>
    get(threadId: string): Promise<GroupChatSummary | null>
    /** An empty name restores the generated one. */
    rename(threadId: string, name: string): Promise<GroupChatSummary[]>
    markRead(threadId: string): Promise<GroupChatSummary[]>
  }

  /**
   * Permission rules for the open project, and what they have decided.
   *
   * Project-scoped, like everything else below a project. Auto Allow is one
   * field of this rather than a setting of its own, because it only means
   * anything relative to the rules beside it.
   */
  permissions: {
    categories(): Promise<PermissionCategoryInfo[]>
    get(): Promise<ProjectPermissions>
    update(patch: {
      autoAllow?: boolean
      rules?: Partial<Record<PermissionCategory, PermissionDecision>>
    }): Promise<ProjectPermissions>
    /** Newest first. What was asked, by whom, and what was decided. */
    history(): Promise<PermissionRecord[]>
    clearHistory(): Promise<PermissionRecord[]>
    /** Categories currently covered by an "allow for this session" grant. */
    sessionGrants(): Promise<PermissionCategory[]>
  }

  automation: {
    settings(): Promise<OrchestrationSettings>
    updateSettings(patch: Partial<OrchestrationSettings>): Promise<OrchestrationSettings>
    listTriggers(): Promise<Trigger[]>
    saveTrigger(trigger: Partial<Trigger>): Promise<Trigger[]>
    removeTrigger(triggerId: string): Promise<Trigger[]>
    /**
     * Run one now, by hand.
     *
     * Takes the same path a schedule or an event does, so a manual run is the
     * real automation rather than a rehearsal of it — same agents, same
     * permission mode, same group conversation, same run record.
     */
    runNow(triggerId: string): Promise<AutomationRunResult>
    /** Run history for the project, or for one automation. Newest first. */
    listRuns(triggerId?: string): Promise<AutomationRun[]>
    run(runId: string): Promise<AutomationRun | null>
    /**
     * Turn a sentence into a draft. Never saved: the user confirms it first.
     */
    parse(text: string): Promise<AutomationDraft>
  }

  approvals: {
    pending(): Promise<ApprovalRequest[]>
    /** `session` allows this one and stops its category asking again today. */
    resolve(id: string, answer: ApprovalAnswer): Promise<boolean>
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

  /**
   * The local Claude Code CLI.
   *
   * Detection only — there is no "run this command" here, and deliberately so.
   * Starting Claude Code is still the terminal surface writing `claude` into a
   * real PTY the user can see and interrupt; this just answers whether doing
   * so is going to work.
   */
  claude: {
    /** Cached answer, or a fresh look when `refresh` is true. */
    detect(refresh?: boolean): Promise<ClaudeDetection>
  }
}

declare global {
  interface Window {
    backstage: BackstageApi
  }
}
