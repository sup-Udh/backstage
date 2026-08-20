import { create } from 'zustand'
import { defaultThemeId, isKnownTheme } from '../themes'
import type {
  AgentRuntimeState,
  AgentSession,
  ApprovalRequest,
  ChatMessage,
  CollaborationMessage,
  ProviderStatus,
  RuntimeEvent,
  TerminalSession
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

export type AppView = 'landing' | 'app'

/**
 * Which surface the command centre is showing.
 *
 * Always exactly one — the panel is a tool with tabs, not a stack of drawers,
 * so there is no "closed" state to represent.
 */
export type TabId = 'messages' | 'files' | 'git' | 'terminal' | 'tasks' | 'commands'

export type PageId = 'home' | 'cases' | 'agents' | 'automations' | 'themes' | 'account'

/** The target that means "everyone who is in the office". */
export const ALL_AGENTS = 'all'

export interface ActivityEntry {
  id: string
  agentId?: string
  agentName?: string
  text: string
  at: number
}

const THEME_KEY = 'backstage.theme'

function loadThemeId(): string {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (isKnownTheme(saved)) return saved as string
  } catch {
    // Storage can be unavailable; the default is always valid.
  }
  return defaultThemeId
}

/** How many activity lines to keep per agent. */
const ACTIVITY_LIMIT = 80
/** How many collaboration entries to keep on screen. */
const COLLAB_LIMIT = 120

interface BackstageState {
  view: AppView
  page: PageId
  themeId: string
  /** True while the world is veiled mid-theme-swap. */
  switching: boolean

  /** Private per-agent transcripts. Keyed by agentId. */
  agentMessages: Record<string, ChatMessage[]>
  /** Per-agent activity feeds. Keyed by agentId. */
  agentActivity: Record<string, ActivityEntry[]>
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

  enterApp: () => void
  exitToLanding: () => void
  setPage: (page: PageId) => void
  switchTheme: (id: string) => void

  setProviders: (statuses: ProviderStatus[]) => void
  setChatTarget: (target: string) => void
  selectAgent: (agentId: string | null) => void
  setTab: (tab: TabId) => void
  setOpenFile: (path: string | null) => void
  setAgentSessions: (sessions: AgentSession[]) => void
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
  themeId: loadThemeId(),
  switching: false,

  agentMessages: {},
  agentActivity: {},
  agentStates: {},
  collaboration: [],
  approvals: [],

  providers: [],
  chatTarget: ALL_AGENTS,
  selectedAgentId: null,

  tab: 'messages',
  openFile: null,
  agentSessions: [],
  terminalSessions: [],
  activeTerminalId: null,
  requestedSessionId: null,
  pendingCommand: null,
  terminalEverOpened: false,

  enterApp: () => set({ view: 'app', page: 'home' }),
  exitToLanding: () => set({ view: 'landing' }),
  setPage: (page) => set({ page }),

  /*
   * The swap is staged rather than instant: veil, commit behind it, lift. That
   * reads as walking onto another set instead of as a React re-render.
   */
  switchTheme: (id) => {
    if (!isKnownTheme(id) || id === get().themeId) return
    set({ switching: true })
    window.setTimeout(() => {
      set({ themeId: id })
      try {
        window.localStorage.setItem(THEME_KEY, id)
      } catch {
        // Persisting is a convenience, never a requirement.
      }
      window.setTimeout(() => set({ switching: false }), 60)
    }, 220)
  },

  setProviders: (providers) => set({ providers }),

  /*
   * Choosing who to talk to also rings them in the world. The two surfaces
   * describe the same office, so they must never disagree about who is in
   * focus. Nothing else happens: no task is started or stopped by this.
   */
  setChatTarget: (chatTarget) =>
    set({
      chatTarget,
      selectedAgentId: chatTarget === ALL_AGENTS ? null : chatTarget
    }),

  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  setTab: (tab) => set({ tab }),
  setOpenFile: (openFile) => set({ openFile, tab: 'files' }),
  setAgentSessions: (agentSessions) => set({ agentSessions }),
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
            kind: event.type === 'trigger.fired' ? 'trigger' : 'delegation',
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
      agentActivity: { ...s.agentActivity, [agentId]: [] }
    }))
  }
}))

/**
 * Events whose `message` is something the agent said to the user.
 *
 * `task.completed` deliberately is not here: it carries the same text as
 * `agent.completed`, and letting both write would print every answer twice.
 */
const SPOKEN = new Set<RuntimeEvent['type']>(['agent.message', 'agent.completed'])

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
