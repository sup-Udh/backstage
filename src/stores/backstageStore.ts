import { create } from 'zustand'
import { useAuth } from './authStore'
import { groupForTool, type ToolRun } from '../agents/toolActivity'
import type {
  AgentRuntimeState,
  AgentSession,
  ApprovalRequest,
  ChatMessage,
  CollaborationMessage,
  ProviderStatus,
  RuntimeEvent,
  SessionLine,
  TerminalSession,
  ThreadInfo
} from '../shared/providerApi'

/**
 * The application store.
 *
 * It holds what React needs to render and nothing that changes per frame:
 * character positions and animation state stay inside the world engine,
 * because putting them here would re-render the tree sixty times a second.
 *
 * Everything about an agent is keyed by agentId. There is no current
 * conversation, no current task and no current status — only `chatTarget`,
 * which is a view preference and changes nothing about what any agent is
 * doing. That distinction is what makes switching agents free: it moves which
 * conversation is on screen and touches nothing else.
 */

/**
 * Which surface is on screen.
 *
 * `loading`, `projects` and `setup` are the way into a project, and they are
 * view states rather than routes because there is nothing to route to yet:
 * until a project exists there is no workspace, no roster and no theme for a
 * page to render.
 *
 *   landing    Home: the product's start screen, for people with no account
 *   login      signing in with Google; the gate to everything below it
 *   loading    entering: real initialisation, shown as a walk to the office
 *   onboarding first run for an account: connect your AI providers
 *   projects  which piece of work is this, of the ones already set up
 *   setup     choosing a folder, a world, a cast and a team lead
 *   app       inside a project
 *
 * `projects` exists because the app used to reopen whatever was last active
 * and say nothing about it. A project is a folder that agents write into, so
 * silently picking one is the app choosing which repository to edit on the
 * user's behalf — it asks now, every time, even when there is only one answer.
 *
 * `landing` and `login` are public. Everything after them is protected, and
 * `PROTECTED_VIEWS` below is the list `App` enforces — deriving it from the
 * type rather than restating it in a guard is what stops a sixth view being
 * added one day and quietly defaulting to public.
 *
 * The guard runs in both directions. A signed-out user cannot reach a
 * protected view, and a signed-in one cannot sit on a public one: Home exists
 * to explain the product and offer a way in, and neither is something to show
 * somebody who is already inside. Launching with a session goes straight to
 * their projects, which is the whole of requirements 18 and 41.
 */
export type AppView =
  | 'landing'
  | 'login'
  | 'loading'
  | 'onboarding'
  | 'projects'
  | 'setup'
  | 'app'

/**
 * The views that require an account.
 *
 * A project is a folder on disk that agents are given write access to, and
 * every one of these surfaces either opens one or is inside one. There is no
 * view here that a signed-out user has any business reaching.
 */
export const PROTECTED_VIEWS: readonly AppView[] = [
  'loading',
  'onboarding',
  'projects',
  'setup',
  'app'
]

/**
 * The views that an account has finished with.
 *
 * The complement of `PROTECTED_VIEWS`, and stated as its complement rather
 * than written out, so the two lists cannot disagree about a view added later.
 * A signed-in user who reaches one of these is on their way to their projects.
 */
export const PUBLIC_VIEWS: readonly AppView[] = (
  ['landing', 'login', 'loading', 'onboarding', 'projects', 'setup', 'app'] as AppView[]
).filter((v) => !PROTECTED_VIEWS.includes(v))

/**
 * Which surface the command centre is showing.
 *
 * Always exactly one — the panel is a tool with tabs, not a stack of drawers,
 * so there is no "closed" state to represent.
 */
export type TabId = 'messages' | 'files' | 'git' | 'terminal' | 'tasks' | 'commands'

/**
 * The pages inside a project.
 *
 * There is deliberately no `themes` page any more. A theme is project
 * configuration chosen during setup, not a global switch — a persistent Themes
 * item in the navigation is an invitation to change one project's world from
 * inside another's, which is exactly the leak this whole model exists to stop.
 * Changing it afterwards lives in Account, beside the rest of the project's
 * settings.
 */
export type PageId = 'home' | 'cases' | 'agents' | 'automations' | 'account'

/**
 * Which part of Settings is open.
 *
 * Lifted out of `Account`'s own `useState` so the account menu can open the
 * page *at* a section — "API keys" has to land on the providers panel, not on
 * the profile with the panel one click away. It stays a single source of
 * truth rather than a prop chain: `Account` reads and writes this, and nothing
 * else needs to know the section list exists.
 */
export type AccountSection =
  | 'profile'
  | 'providers'
  | 'agents'
  | 'projects'
  | 'account'

/** The target that means "everyone who is in the office". */
export const ALL_AGENTS = 'all'

export interface ActivityEntry {
  id: string
  agentId?: string
  agentName?: string
  text: string
  at: number
}

/** How many activity lines to keep per agent. */
const ACTIVITY_LIMIT = 80
/** How many collaboration entries to keep on screen. */
const COLLAB_LIMIT = 120
/**
 * How many tool calls to keep per agent.
 *
 * Deliberately generous: these are the evidence behind an agent's answer, and
 * a deep investigation can legitimately make dozens of calls. They are cheap
 * — a name, a line of text and a status — and they are never persisted.
 */
const TOOL_LIMIT = 200
/** How many reconstructed lines to keep per CLI session. */
const SESSION_LINE_LIMIT = 400

interface BackstageState {
  view: AppView
  page: PageId
  /** Which section Settings opens on. */
  accountSection: AccountSection

  /** Private per-agent transcripts. Keyed by agentId. */
  agentMessages: Record<string, ChatMessage[]>
  /** Per-agent activity feeds. Keyed by agentId. */
  agentActivity: Record<string, ActivityEntry[]>
  /**
   * Every tool call each agent has made this session, in order.
   *
   * Ephemeral by design. It is a record of what happened while the app was
   * open, not part of the agent's memory — the conversation store holds what
   * was *said*, and mixing a hundred tool lines into that would both bloat
   * the transcript on disk and feed them back to the model as if they were
   * dialogue.
   */
  agentTools: Record<string, ToolRun[]>
  /**
   * Prose an agent is still in the middle of saying, keyed by agentId.
   *
   * Provisional, and never written anywhere else. The moment the runtime
   * reports the finished text — as `agent.message` or `agent.completed` — the
   * entry is dropped and the real, complete line takes its place. The
   * conversation is therefore built from what the agent actually said, not
   * from whatever fragments happened to arrive, so a dropped chunk shows as a
   * flicker rather than as a permanently truncated answer.
   *
   * Keyed by agent rather than execution because an agent runs one execution
   * at a time, which is the same guarantee everything else in this store
   * relies on.
   */
  streaming: Record<string, string>
  /**
   * Readable transcripts for CLI sessions, keyed by AgentSession id.
   *
   * Separate from `agentMessages` because it is a different kind of thing: an
   * agent's transcript is its memory, loaded from disk and fed back to the
   * model, while this is a reconstruction of what a process printed. Mixing
   * them would mean the app trying to persist, and eventually re-send, the
   * output of a program it does not own.
   */
  sessionLines: Record<string, SessionLine[]>
  /** Live per-agent runtime state, mirrored from the main process. */
  agentStates: Record<string, AgentRuntimeState>
  /** Shared agent-to-agent activity. Not private memory. */
  collaboration: CollaborationMessage[]
  /** Dangerous tool calls waiting on the user. */
  approvals: ApprovalRequest[]

  /** Mirror of the main process's provider state. Never holds a key. */
  providers: ProviderStatus[]
  /**
   * Which agent the chat is addressed to, or ALL_AGENTS.
   *
   * A view preference. Changing it never starts, stops or interrupts work.
   */
  chatTarget: string
  /**
   * The character highlighted in the world.
   *
   * Shared rather than local to the world panel, because selecting someone is
   * a whole-workspace act: it moves the TALK TO selector, rings the character
   * on the floor and opens their inspector, whichever surface started it.
   */
  selectedAgentId: string | null

  /**
   * Whose group conversation is on screen, or null for the private one.
   *
   * A second, deliberately separate view preference. `chatTarget` chooses
   * which worker the user is talking to; this chooses whether they are seeing
   * that worker's private session or the thread it shares with its
   * teammates. Keeping them apart is what stops a group conversation from
   * ever becoming part of a private one — switching views cannot move a
   * message between them, because the two are stored separately and neither
   * is derived from the other.
   */
  threadTarget: string | null
  /** The group behind `threadTarget`, resolved from the main process. */
  thread: ThreadInfo | null
  /** The group conversation itself, keyed by thread id. */
  threadMessages: Record<string, ChatMessage[]>

  /** The command centre's active tab, and the file being viewed in it. */
  tab: TabId
  openFile: string | null
  /** Live external CLI sessions, mirrored from the main process. */
  agentSessions: AgentSession[]
  /** Live PTY sessions, mirrored from the main process. */
  terminalSessions: TerminalSession[]
  /** Which PTY the session surface is showing, and writing input to. */
  activeTerminalId: string | null
  /** A session another surface has asked the terminal to bring forward. */
  requestedSessionId: string | null
  /** A command queued for the terminal to run once it is visible. */
  pendingCommand: string | null
  /**
   * Whether the terminal has ever been opened. Once it has, its panel stays
   * mounted: unmounting would dispose the xterm instance and lose the
   * scrollback of a session that is still running.
   */
  terminalEverOpened: boolean

  /**
   * Get Started.
   *
   * Sends an authenticated user straight in and everyone else to the login
   * page. Requirement 14 is explicit that a signed-in user must not be walked
   * through Google again just because they came back via the landing page.
   */
  enterApp: () => void
  /** Show the sign-in page. */
  showLogin: () => void
  /** First run for this account: offer provider setup. */
  showOnboarding: () => void
  /**
   * Tear down everything that belonged to the signed-out account.
   *
   * Called when authentication ends, from wherever: the account menu, a
   * revoked session, an expired refresh token. The main process does the same
   * on its side — stops executions, closes the project, clears the workspace —
   * and this is the renderer's half: no transcript, no roster state, no
   * approval and no terminal buffer survives into the next account's session.
   */
  resetForSignOut: () => void
  /** Initialisation finished and there are projects to choose between. */
  showProjects: () => void
  /** Create a project: no projects exist, or the user asked for a new one. */
  showSetup: () => void
  /** A project is open; show it. */
  openProject: () => void
  /**
   * Leave the workspace for Home.
   *
   * Only reachable while signed out — the guard sends an authenticated user
   * straight back to their projects — so it is the login page's Back button
   * and the walk-in screen's failure exit, and nothing else. Inside the app,
   * the way out of a project is the project list.
   */
  exitToLanding: () => void
  setPage: (page: PageId) => void
  /** Open Settings, at a given section. */
  openAccount: (section?: AccountSection) => void
  setAccountSection: (section: AccountSection) => void

  setProviders: (statuses: ProviderStatus[]) => void
  setChatTarget: (target: string) => void
  /** Show a worker's group conversation, or null to go back to its own. */
  setThreadTarget: (agentId: string | null) => Promise<void>
  /** Reload the open thread, after it or its membership changed. */
  refreshThread: () => Promise<void>
  selectAgent: (agentId: string | null) => void
  setTab: (tab: TabId) => void
  setOpenFile: (path: string | null) => void
  setAgentSessions: (sessions: AgentSession[]) => void
  /** Replace a session's transcript, e.g. when a panel opens mid-conversation. */
  setSessionLines: (sessionId: string, lines: SessionLine[]) => void
  /** Append one reconstructed line as it arrives. */
  pushSessionLine: (line: SessionLine) => void
  setTerminalSessions: (sessions: TerminalSession[]) => void
  setActiveTerminal: (id: string | null) => void
  requestSession: (id: string | null) => void
  queueCommand: (command: string | null) => void
  markTerminalOpened: () => void

  setAgentStates: (states: AgentRuntimeState[]) => void
  setCollaboration: (messages: CollaborationMessage[]) => void
  setApprovals: (requests: ApprovalRequest[]) => void
  addApproval: (request: ApprovalRequest) => void
  removeApproval: (id: string) => void

  /** Append a line to one agent's transcript. */
  pushMessage: (agentId: string, message: ChatMessage) => void
  /** Append the same line to several agents at once, for a broadcast. */
  pushToMany: (agentIds: string[], make: (agentId: string) => ChatMessage) => void
  /** Fold a runtime event into the transcripts, feeds and state. */
  ingestEvent: (event: RuntimeEvent) => void
  loadConversation: (workspaceId: string, agentId: string) => Promise<void>
  clearConversation: (workspaceId: string, agentId: string) => Promise<void>
}

let localSeq = 0

/** Ids for lines this side created, kept distinct from the runtime's. */
export function localId(prefix = 'local'): string {
  localSeq += 1
  return `${prefix}_${Date.now().toString(36)}_${localSeq}`
}

export const useBackstage = create<BackstageState>((set, get) => ({
  view: 'landing',
  page: 'home',
  accountSection: 'profile',

  agentMessages: {},
  agentActivity: {},
  agentTools: {},
  streaming: {},
  sessionLines: {},
  agentStates: {},
  collaboration: [],
  approvals: [],

  providers: [],
  chatTarget: ALL_AGENTS,
  selectedAgentId: null,
  threadTarget: null,
  thread: null,
  threadMessages: {},

  tab: 'messages',
  openFile: null,
  agentSessions: [],
  terminalSessions: [],
  activeTerminalId: null,
  requestedSessionId: null,
  pendingCommand: null,
  terminalEverOpened: false,

  enterApp: () =>
    set({
      view: useAuth.getState().status === 'authenticated' ? 'loading' : 'login'
    }),
  showLogin: () => set({ view: 'login' }),
  showOnboarding: () => set({ view: 'onboarding' }),

  resetForSignOut: () =>
    set({
      view: 'login',
      page: 'home',
      accountSection: 'profile',
      agentMessages: {},
      agentActivity: {},
      agentTools: {},
      streaming: {},
      sessionLines: {},
      agentStates: {},
      collaboration: [],
      approvals: [],
      chatTarget: ALL_AGENTS,
      selectedAgentId: null,
      threadTarget: null,
      thread: null,
      threadMessages: {},
      tab: 'messages',
      openFile: null,
      agentSessions: [],
      terminalSessions: [],
      activeTerminalId: null,
      requestedSessionId: null,
      pendingCommand: null,
      /*
       * Providers are *not* cleared. A connection is a credential on this
       * machine rather than a property of an account — the same reason the
       * settings page says so — and forgetting it on sign-out would make the
       * next person re-enter keys that were never theirs to begin with, and
       * are still sitting encrypted in the OS keychain either way.
       */
    }),

  showProjects: () => set({ view: 'projects' }),
  showSetup: () => set({ view: 'setup' }),
  openProject: () => set({ view: 'app', page: 'home' }),
  exitToLanding: () => set({ view: 'landing' }),
  setPage: (page) => set({ page }),
  openAccount: (accountSection = 'profile') => set({ page: 'account', accountSection }),
  setAccountSection: (accountSection) => set({ accountSection }),

  setProviders: (providers) => set({ providers }),

  /*
   * Choosing who to talk to also rings them in the world. The two surfaces
   * describe the same office, so they must never disagree about who is in
   * focus. Nothing else happens: no task is started or stopped by this.
   */
  setChatTarget: (chatTarget) =>
    set({
      chatTarget,
      selectedAgentId: chatTarget === ALL_AGENTS ? null : chatTarget,
      /*
       * Choosing a worker always shows their own conversation. Leaving a
       * thread open across a switch would put the user in Jane's group
       * conversation while the header said they were talking to Michael.
       */
      threadTarget: null,
      thread: null
    }),

  setThreadTarget: async (workerId) => {
    if (!workerId) {
      set({ threadTarget: null, thread: null })
      return
    }

    /*
     * Two kinds of group, resolved from two places.
     *
     * An agent group has a stored transcript in the main process; a session
     * group has none, because its conversation is the sessions' own output,
     * which the renderer already holds. So a session thread is identified but
     * carries no messages of its own — the panel merges the members' lines.
     */
    if (workerId.startsWith('cli-')) {
      const sessions = get().agentSessions
      const session = sessions.find((s) => `cli-${s.terminalSessionId}` === workerId)
      const thread = session
        ? await window.backstage?.sessions.group(session.id)
        : null
      set({ threadTarget: thread ? workerId : null, thread: thread ?? null })
      return
    }

    const thread = await window.backstage?.threads.for(workerId)
    if (!thread) {
      set({ threadTarget: null, thread: null })
      return
    }
    const messages = await window.backstage.threads.load(thread.id)
    set((s) => ({
      threadTarget: workerId,
      thread,
      threadMessages: { ...s.threadMessages, [thread.id]: messages }
    }))
  },

  refreshThread: async () => {
    const { threadTarget } = get()
    if (!threadTarget) return
    await get().setThreadTarget(threadTarget)
  },

  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  setTab: (tab) => set({ tab }),
  setOpenFile: (openFile) => set({ openFile, tab: 'files' }),
  setAgentSessions: (agentSessions) => set({ agentSessions }),

  setSessionLines: (sessionId, lines) =>
    set((s) => ({
      sessionLines: { ...s.sessionLines, [sessionId]: lines.slice(-SESSION_LINE_LIMIT) }
    })),

  pushSessionLine: (line) =>
    set((s) => {
      const current = s.sessionLines[line.sessionId] ?? []
      // The main process replays on request, so a duplicate is possible when a
      // panel opens at the same moment a line arrives.
      if (current.some((l) => l.id === line.id)) return s
      return {
        sessionLines: {
          ...s.sessionLines,
          [line.sessionId]: [...current, line].slice(-SESSION_LINE_LIMIT)
        }
      }
    }),
  setTerminalSessions: (terminalSessions) => set({ terminalSessions }),
  setActiveTerminal: (activeTerminalId) => set({ activeTerminalId }),
  requestSession: (requestedSessionId) => set({ requestedSessionId }),
  queueCommand: (pendingCommand) => set({ pendingCommand }),
  markTerminalOpened: () => set({ terminalEverOpened: true }),

  setAgentStates: (states) =>
    set(() => {
      const agentStates: Record<string, AgentRuntimeState> = {}
      for (const state of states) agentStates[state.agentId] = state
      return { agentStates }
    }),

  setCollaboration: (collaboration) =>
    set({ collaboration: collaboration.slice(-COLLAB_LIMIT) }),

  setApprovals: (approvals) => set({ approvals }),

  addApproval: (request) =>
    set((s) =>
      s.approvals.some((a) => a.id === request.id)
        ? s
        : { approvals: [...s.approvals, request] }
    ),

  removeApproval: (id) =>
    set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) })),

  pushMessage: (agentId, message) =>
    set((s) => ({
      agentMessages: {
        ...s.agentMessages,
        [agentId]: [...(s.agentMessages[agentId] ?? []), message]
      }
    })),

  pushToMany: (agentIds, make) =>
    set((s) => {
      const agentMessages = { ...s.agentMessages }
      for (const agentId of agentIds) {
        agentMessages[agentId] = [...(agentMessages[agentId] ?? []), make(agentId)]
      }
      return { agentMessages }
    }),

  /**
   * Fold one runtime event into the renderer's state.
   *
   * Everything lands under the agent that produced it. An event with no agent
   * — a file change, a git update — goes only to the activity feeds that ask
   * for it, never into somebody's conversation.
   */
  ingestEvent: (event) =>
    set((s) => {
      const next: Partial<BackstageState> = {}
      const agentId = event.agentId

      if (event.type === 'agent.state' && event.state) {
        next.agentStates = { ...s.agentStates, [event.state.agentId]: event.state }
      }

      /*
       * Streaming prose. Fragments build up a provisional line; anything that
       * ends the turn clears it, because by then either the finished text has
       * arrived or the execution stopped and the fragments describe an answer
       * that will never exist.
       */
      if (event.type === 'agent.message.delta' && agentId && event.message) {
        next.streaming = {
          ...s.streaming,
          [agentId]: (s.streaming[agentId] ?? '') + event.message
        }
      } else if (agentId && ENDS_STREAM.has(event.type) && s.streaming[agentId] !== undefined) {
        const streaming = { ...s.streaming }
        delete streaming[agentId]
        next.streaming = streaming
      }

      /*
       * Tool calls, folded into a per-agent ledger.
       *
       * `started` and `completed` describe the same call in different tenses
       * — "Reading auth.ts" then "Read auth.ts" — so they cannot be matched
       * on their text. They are matched on the tool name against the most
       * recent still-running call instead, which is exact because an
       * execution runs its tools one at a time and awaits each one.
       */
      if (event.type === 'agent.tool.started' && agentId && event.tool) {
        const current = s.agentTools[agentId] ?? []
        next.agentTools = {
          ...s.agentTools,
          [agentId]: [
            ...current,
            {
              id: event.id,
              agentId,
              taskId: event.taskId,
              tool: event.tool,
              group: groupForTool(event.tool),
              action: event.action ?? event.tool,
              status: 'running' as const,
              at: event.at
            }
          ].slice(-TOOL_LIMIT)
        }
      }

      if (
        (event.type === 'agent.tool.completed' || event.type === 'agent.tool.failed') &&
        agentId &&
        event.tool
      ) {
        const current = s.agentTools[agentId] ?? []
        const i = findLastRunning(current, event.tool)
        if (i !== -1) {
          const updated = [...current]
          updated[i] = {
            ...updated[i],
            status: event.type === 'agent.tool.completed' ? 'ok' : 'failed',
            // The past-tense description reads better once it has happened.
            action: event.action ?? updated[i].action,
            error: event.type === 'agent.tool.failed' ? event.reason : undefined
          }
          next.agentTools = { ...s.agentTools, [agentId]: updated }
        }
      }

      /*
       * A cancelled or finished execution can leave a call marked running
       * forever — the tool it was waiting on never reported back. Closing
       * them out here means the transcript never shows a spinner for work
       * that stopped minutes ago.
       */
      if (
        (event.type === 'agent.idle' || event.type === 'agent.cancelled') &&
        agentId
      ) {
        const current = next.agentTools?.[agentId] ?? s.agentTools[agentId] ?? []
        if (current.some((r) => r.status === 'running')) {
          next.agentTools = {
            ...(next.agentTools ?? s.agentTools),
            [agentId]: current.map((r) =>
              r.status === 'running' ? { ...r, status: 'failed' as const } : r
            )
          }
        }
      }

      if (event.activity && agentId) {
        const current = s.agentActivity[agentId] ?? []
        next.agentActivity = {
          ...s.agentActivity,
          [agentId]: [
            ...current,
            {
              id: event.id,
              agentId,
              agentName: event.agentName,
              text: event.activity,
              at: event.at
            }
          ].slice(-ACTIVITY_LIMIT)
        }
      }

      /*
       * Only what the agent actually said to the user. `agent.completed`
       * repeats the final text of `task.completed`, so exactly one of the two
       * may write a line or every answer would appear twice.
       */
      if (event.message && agentId && SPOKEN.has(event.type)) {
        const current = s.agentMessages[agentId] ?? []
        const already = current.some((m) => m.id === event.id)
        if (!already) {
          next.agentMessages = {
            ...s.agentMessages,
            [agentId]: [
              ...current,
              {
                id: event.id,
                kind: 'agent',
                agentId,
                text: event.message,
                at: event.at,
                taskId: event.taskId
              }
            ]
          }
        }
      }

      if (event.type === 'task.failed' && agentId && event.reason) {
        const current = next.agentMessages?.[agentId] ?? s.agentMessages[agentId] ?? []
        next.agentMessages = {
          ...(next.agentMessages ?? s.agentMessages),
          [agentId]: [
            ...current,
            {
              id: event.id,
              kind: 'system',
              agentId,
              text: event.reason,
              at: event.at,
              taskId: event.taskId
            }
          ]
        }
      }

      /*
       * A "notify me" automation has no target agent, so it is not
       * collaboration — it is Backstage telling the user something. It lands
       * in the originating agent's transcript, which is the session the user
       * would be looking at to understand why it fired.
       */
      if (event.type === 'trigger.fired' && !event.targetAgentId && agentId) {
        const current = next.agentMessages?.[agentId] ?? s.agentMessages[agentId] ?? []
        next.agentMessages = {
          ...(next.agentMessages ?? s.agentMessages),
          [agentId]: [
            ...current,
            {
              id: event.id,
              kind: 'system',
              agentId,
              text: `${event.triggerName ?? 'Automation'}: ${event.message ?? 'fired.'}`,
              at: event.at
            }
          ]
        }
      }

      // Agent-to-agent traffic is shared activity, kept out of both agents'
      // private transcripts and shown as collaboration instead.
      if (COLLABORATIVE.has(event.type) && agentId && event.targetAgentId) {
        next.collaboration = [
          ...s.collaboration,
          {
            id: event.id,
            senderAgentId: agentId,
            senderName: event.agentName ?? agentId,
            receiverAgentId: event.targetAgentId,
            receiverName: event.targetAgentName ?? event.targetAgentId,
            message: event.message ?? '',
            reason: event.reason ?? '',
            taskId: event.taskId ?? null,
            correlationId: event.correlationId ?? '',
            depth: event.depth ?? 0,
            kind: (event.type === 'trigger.fired'
              ? 'trigger'
              : 'delegation') as CollaborationMessage['kind'],
            at: event.at
          }
        ].slice(-COLLAB_LIMIT)
      }

      return next
    }),

  loadConversation: async (workspaceId, agentId) => {
    if (!window.backstage?.agents) return
    const messages = await window.backstage.agents.loadChat(workspaceId, agentId)
    set((s) => ({ agentMessages: { ...s.agentMessages, [agentId]: messages } }))
  },

  clearConversation: async (workspaceId, agentId) => {
    await window.backstage?.agents.clearChat(workspaceId, agentId)
    set((s) => ({
      agentMessages: { ...s.agentMessages, [agentId]: [] },
      agentActivity: { ...s.agentActivity, [agentId]: [] },
      agentTools: { ...s.agentTools, [agentId]: [] },
      streaming: { ...s.streaming, [agentId]: '' }
    }))
  }
}))

/** The most recent unfinished call of this tool, or -1. */
function findLastRunning(runs: ToolRun[], tool: string): number {
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].tool === tool && runs[i].status === 'running') return i
  }
  return -1
}

/**
 * Events whose `message` is something the agent said to the user.
 *
 * `task.completed` deliberately is not here: it carries the same text as
 * `agent.completed`, and letting both write would print every answer twice.
 */
const SPOKEN = new Set<RuntimeEvent['type']>(['agent.message', 'agent.completed'])

/**
 * Events after which a provisional streamed line is no longer wanted.
 *
 * `agent.message` and `agent.completed` carry the finished text that replaces
 * it; the rest mean the turn ended without one, and leaving a half-sentence
 * on screen would be showing an answer the agent never gave.
 */
const ENDS_STREAM = new Set<RuntimeEvent['type']>([
  'agent.message',
  'agent.completed',
  'agent.failed',
  'agent.cancelled',
  'agent.idle',
  'task.failed',
  'task.cancelled'
])

/** Events that represent one agent contacting another. */
const COLLABORATIVE = new Set<RuntimeEvent['type']>([
  'agent.delegated',
  'agent.message.sent',
  'trigger.fired'
])

/* --------------------------------------------------------------- selectors -- */

/**
 * The transcript on screen.
 *
 * For one agent it is that agent's own memory. For ALL AGENTS it is every
 * spawned agent's lines merged in time order — which is what makes a broadcast
 * readable as three separate replies rather than one invented consensus.
 */
export function transcriptFor(
  state: { agentMessages: Record<string, ChatMessage[]> },
  target: string,
  everyone: string[]
): ChatMessage[] {
  if (target !== ALL_AGENTS) return state.agentMessages[target] ?? []

  const merged: ChatMessage[] = []
  const seenUserLines = new Set<string>()

  for (const agentId of everyone) {
    for (const message of state.agentMessages[agentId] ?? []) {
      /*
       * One broadcast writes the same prompt into every recipient's memory.
       * Showing it once keeps the merged view readable; agent replies are
       * never collapsed, because those genuinely are different answers.
       */
      if (message.kind === 'user') {
        const key = `${message.text}@${Math.round(message.at / 1000)}`
        if (seenUserLines.has(key)) continue
        seenUserLines.add(key)
      }
      merged.push(message)
    }
  }

  return merged.sort((a, b) => a.at - b.at)
}
