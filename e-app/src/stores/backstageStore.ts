import { create } from 'zustand'
import { defaultThemeId, isKnownTheme } from '../themes'
import type { AgentEvent } from '../agents/agentEvents'
import type {
  AgentSession,
  ProviderStatus,
  TerminalSession
} from '../shared/providerApi'

/**
 * The application store.
 *
 * It holds what React needs to render and nothing that changes per frame:
 * character positions and animation state stay inside the world engine,
 * because putting them here would re-render the tree sixty times a second.
 *
 * The world and the command centre both read from this, which is what keeps
 * the two panels describing the same office — the agent selected in the world
 * is the agent the command centre is addressed to, and the session shown in
 * the terminal is the session whose character is working on screen.
 */

export type AppView = 'landing' | 'app'
/**
 * How tasks are executed. `fake` replays the scripted timeline, which is what
 * you want while working on the world without spending API credits; `real`
 * calls the connected provider.
 */
export type ExecutionMode = 'real' | 'fake'

/**
 * Which surface the command centre is showing.
 *
 * Always exactly one — the panel is a tool with tabs, not a stack of drawers,
 * so there is no "closed" state to represent. Activity is deliberately absent:
 * it is no longer a destination. It is shown in context inside the session and
 * task surfaces that produced it.
 */
export type TabId = 'messages' | 'files' | 'git' | 'terminal' | 'tasks' | 'commands'

export type PageId = 'home' | 'cases' | 'agents' | 'themes' | 'account'

export interface ChatMessage {
  id: number
  kind: 'user' | 'agent' | 'system'
  /** Set on agent lines, so the UI can resolve the current theme's name. */
  agentId?: string
  text: string
  at: number
}

export interface ActivityEntry {
  id: number
  agentId?: string
  agentName?: string
  text: string
  at: number
}

export interface TaskState {
  id: number
  title: string
  status: 'running' | 'complete' | 'failed'
  startedAt: number
  /** The closing summary, once the task finishes. */
  result?: string
}

const THEME_KEY = 'backstage.theme'
const MODE_KEY = 'backstage.mode'

function loadMode(): ExecutionMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'fake' ? 'fake' : 'real'
  } catch {
    return 'real'
  }
}

function loadThemeId(): string {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (isKnownTheme(saved)) return saved as string
  } catch {
    // Storage can be unavailable; the default is always valid.
  }
  return defaultThemeId
}

interface BackstageState {
  view: AppView
  page: PageId
  themeId: string
  /** True while the world is veiled mid-theme-swap. */
  switching: boolean

  /** Per-agent chat history. Keyed by agentId. */
  agentMessages: Record<string, ChatMessage[]>
  /** Per-agent activity feeds. Keyed by agentId. */
  agentActivity: Record<string, ActivityEntry[]>
  /** Per-agent current task. Keyed by agentId. */
  agentTasks: Record<string, TaskState | null>

  /** Mirror of the main process's provider state. Never holds a key. */
  provider: ProviderStatus | null
  mode: ExecutionMode
  /** Which agent the chat is addressed to, or 'all' for the team. */
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

  setProvider: (status: ProviderStatus | null) => void
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
  setMode: (mode: ExecutionMode) => void
  pushUserMessage: (text: string) => void
  pushSystemMessage: (text: string) => void
  loadConversation: (workspaceId: string, agentId: string) => Promise<void>
  /** Fold a runtime event into the transcript, feed and task state. */
  ingestEvent: (event: AgentEvent) => void
  clearConversation: () => void
}

let nextId = 1

export const useBackstage = create<BackstageState>((set, get) => ({
  view: 'landing',
  page: 'home',
  themeId: loadThemeId(),
  switching: false,

  agentMessages: {},
  agentActivity: {},
  agentTasks: {},
  provider: null,
  mode: loadMode(),
  chatTarget: 'jane',
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

  setProvider: (provider) => set({ provider }),

  /*
   * Choosing who to talk to also rings them in the world. The two surfaces
   * describe the same office, so they must never disagree about who is in
   * focus.
   */
  setChatTarget: (chatTarget) =>
    set({ chatTarget, selectedAgentId: chatTarget === 'all' ? null : chatTarget }),

  selectAgent: (selectedAgentId) => set({ selectedAgentId }),

  setTab: (tab) => set({ tab }),

  setOpenFile: (openFile) => set({ openFile, tab: 'files' }),

  setAgentSessions: (agentSessions) => set({ agentSessions }),

  setTerminalSessions: (terminalSessions) => set({ terminalSessions }),

  setActiveTerminal: (activeTerminalId) => set({ activeTerminalId }),

  requestSession: (requestedSessionId) => set({ requestedSessionId }),

  queueCommand: (pendingCommand) => set({ pendingCommand }),

  markTerminalOpened: () => set({ terminalEverOpened: true }),

  setMode: (mode) => {
    try {
      window.localStorage.setItem(MODE_KEY, mode)
    } catch {
      // Persisting the preference is a convenience, not a requirement.
    }
    set({ mode })
  },

  pushSystemMessage: (text) =>
    set((s) => {
      const target = s.chatTarget
      const current = s.agentMessages[target] || []
      return {
        agentMessages: {
          ...s.agentMessages,
          [target]: [
            ...current,
            { id: nextId++, kind: 'system', text, at: Date.now() }
          ]
        }
      }
    }),

  pushUserMessage: (text) =>
    set((s) => {
      const target = s.chatTarget
      const current = s.agentMessages[target] || []
      return {
        agentMessages: {
          ...s.agentMessages,
          [target]: [
            ...current,
            { id: nextId++, kind: 'user', text, at: Date.now() }
          ]
        }
      }
    }),

  ingestEvent: (event) =>
    set((s) => {
      const target = event.agentId || s.chatTarget
      const next: Partial<BackstageState> = {}

      if (event.activity) {
        const currentActivity = s.agentActivity[target] || []
        next.agentActivity = {
          ...s.agentActivity,
          [target]: [
            ...currentActivity,
            {
              id: event.id,
              agentId: event.agentId,
              agentName: event.agentName,
              text: event.activity,
              at: event.at
            }
          ].slice(-60)
        }
      }

      if (event.message) {
        const currentMessages = s.agentMessages[target] || []
        next.agentMessages = {
          ...s.agentMessages,
          [target]: [
            ...currentMessages,
            {
              id: event.id,
              kind: 'agent',
              agentId: event.agentId,
              text: event.message,
              at: event.at
            }
          ]
        }
      }

      if (event.type === 'task.created' && event.task) {
        next.agentTasks = {
          ...s.agentTasks,
          [target]: {
            id: event.id,
            title: event.task,
            status: 'running',
            startedAt: event.at
          }
        }
      }

      const currentTask = s.agentTasks[target]
      if (event.type === 'task.failed' && currentTask) {
        next.agentTasks = {
          ...s.agentTasks,
          [target]: { ...currentTask, status: 'failed' }
        }
      }

      if (event.type === 'task.completed' && currentTask) {
        // The closing summary is whichever line the lead agent just spoke.
        const currentMessages = (next.agentMessages ? next.agentMessages[target] : s.agentMessages[target]) || []
        const lastAgentLine = [...currentMessages]
          .reverse()
          .find((m) => m.kind === 'agent')
        
        next.agentTasks = {
          ...s.agentTasks,
          [target]: {
            ...currentTask,
            status: 'complete',
            result: lastAgentLine?.text
          }
        }
      }

      return next
    }),

  clearConversation: () => set((s) => ({
    agentMessages: { ...s.agentMessages, [s.chatTarget]: [] },
    agentActivity: { ...s.agentActivity, [s.chatTarget]: [] },
    agentTasks: { ...s.agentTasks, [s.chatTarget]: null }
  })),

  loadConversation: async (workspaceId: string, agentId: string) => {
    if (!window.backstage?.agents) return
    const messages = await window.backstage.agents.loadChat(workspaceId, agentId)
    set((s) => ({
      agentMessages: {
        ...s.agentMessages,
        [agentId]: messages
      }
    }))
  }
}))
