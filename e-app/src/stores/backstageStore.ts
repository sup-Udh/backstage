import { create } from 'zustand'
import { defaultThemeId, isKnownTheme } from '../themes'
import type { AgentEvent } from '../agents/agentEvents'

/**
 * The application store.
 *
 * It holds what React needs to render and nothing that changes per frame:
 * character positions and animation state stay inside the world engine,
 * because putting them here would re-render the tree sixty times a second.
 *
 * The world and the command centre both read from this, which is what keeps
 * the two panels describing the same office.
 */

export type AppView = 'landing' | 'app'
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
  text: string
  at: number
}

export interface TaskState {
  id: number
  title: string
  status: 'running' | 'complete'
  startedAt: number
  /** The closing summary, once the task finishes. */
  result?: string
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

interface BackstageState {
  view: AppView
  page: PageId
  themeId: string
  /** True while the world is veiled mid-theme-swap. */
  switching: boolean

  messages: ChatMessage[]
  activity: ActivityEntry[]
  task: TaskState | null

  enterApp: () => void
  exitToLanding: () => void
  setPage: (page: PageId) => void
  switchTheme: (id: string) => void

  pushUserMessage: (text: string) => void
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

  messages: [],
  activity: [],
  task: null,

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

  pushUserMessage: (text) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextId++, kind: 'user', text, at: Date.now() }
      ]
    })),

  ingestEvent: (event) =>
    set((s) => {
      const next: Partial<BackstageState> = {}

      if (event.activity) {
        next.activity = [
          ...s.activity,
          {
            id: event.id,
            agentId: event.agentId,
            text: event.activity,
            at: event.at
          }
        ].slice(-40)
      }

      if (event.message) {
        next.messages = [
          ...s.messages,
          {
            id: event.id,
            kind: 'agent',
            agentId: event.agentId,
            text: event.message,
            at: event.at
          }
        ]
      }

      if (event.type === 'task.created' && event.task) {
        next.task = {
          id: event.id,
          title: event.task,
          status: 'running',
          startedAt: event.at
        }
      }

      if (event.type === 'task.completed' && s.task) {
        // The closing summary is whichever line the lead agent just spoke.
        const lastAgentLine = [...(next.messages ?? s.messages)]
          .reverse()
          .find((m) => m.kind === 'agent')
        next.task = {
          ...s.task,
          status: 'complete',
          result: lastAgentLine?.text
        }
      }

      return next
    }),

  clearConversation: () => set({ messages: [], activity: [], task: null })
}))
