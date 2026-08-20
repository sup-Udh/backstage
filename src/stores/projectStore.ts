import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  AgentConfig,
  LegacyState,
  Project,
  ProjectDraft,
  ProjectPatch
} from '../shared/providerApi'
import { getTheme, isKnownTheme, defaultThemeId } from '../themes'
import { projectCast } from '../project/cast'
import type { CharacterDef } from '../characters/character.types'
import type { Theme } from '../themes/types'

/**
 * The open project, mirrored from the main process.
 *
 * Nothing here is the source of truth. The main process owns and persists
 * projects; every mutator round-trips and replaces the mirror with what came
 * back, so the UI can never claim a project change that did not persist —
 * the same discipline `teamStore` holds to for the roster.
 *
 * This store is what makes isolation visible. `theme` and `cast` are derived
 * from the open project rather than from a global preference, so a component
 * that reads them cannot accidentally render another project's world: there is
 * no global theme left to read.
 */

/** Where the old global theme preference was kept, before projects. */
const LEGACY_THEME_KEY = 'backstage.theme'

interface ProjectState {
  project: Project | null
  /** Every stored project. One is open; there is no switcher yet. */
  projects: Project[]
  /** Pre-project state waiting to be adopted, if any was found. */
  legacy: LegacyState | null
  loaded: boolean
  /** True while the world is veiled mid-theme-change. */
  switching: boolean

  /**
   * Read what the main process found on disk. Called once, on entering.
   *
   * Returns the projects rather than "the active one", because the walk-in
   * screen's job is to find out what exists — not to choose. Whatever the main
   * process happens to have marked active is still loaded into `project` so a
   * reopened session's scoped reads resolve, but nothing is opened on the
   * strength of it.
   */
  bootstrap: () => Promise<{ projects: Project[]; legacy: LegacyState | null }>
  create: (draft: ProjectDraft) => Promise<{ project?: Project; error?: string }>
  open: (projectId: string) => Promise<Project | null>
  update: (patch: ProjectPatch) => Promise<Project | null>
  /** Fold pre-project workspace and roster into a project, with a theme. */
  adoptLegacy: (name: string) => Promise<Project | null>
  /** Change the project's world. Staged, so it reads as walking onto a set. */
  changeTheme: (themeId: string) => void
}

export const useProject = create<ProjectState>((set, get) => ({
  project: null,
  projects: [],
  legacy: null,
  loaded: false,
  switching: false,

  bootstrap: async () => {
    const api = window.backstage?.projects
    if (!api) return { projects: [], legacy: null }

    const state = await api.bootstrap()
    set({
      project: state.activeProject,
      projects: state.projects,
      legacy: state.legacy,
      loaded: true
    })
    return { projects: state.projects, legacy: state.legacy }
  },

  create: async (draft) => {
    const result = await window.backstage.projects.create(draft)
    if ('error' in result) return { error: result.error }

    set({
      project: result.project,
      projects: await window.backstage.projects.list(),
      legacy: null
    })
    return { project: result.project }
  },

  open: async (projectId) => {
    const snapshot = await window.backstage.projects.open(projectId)
    if (!snapshot) return null
    set({ project: snapshot.project })
    return snapshot.project
  },

  update: async (patch) => {
    const current = get().project
    if (!current) return null

    const next = await window.backstage.projects.update(current.id, patch)
    if (!next) return null
    set((s) => ({
      project: next,
      projects: s.projects.map((p) => (p.id === next.id ? next : p))
    }))
    return next
  },

  /*
   * Adopting predates the theme picker, so the theme comes from the old global
   * preference in localStorage. That is the only place it was ever stored, and
   * reading it here — rather than in the main process — is why nothing behind
   * the IPC boundary has to know one theme id from another.
   */
  adoptLegacy: async (name) => {
    const saved = readLegacyThemeId()
    const theme = getTheme(saved)

    const snapshot = await window.backstage.projects.adoptLegacy({
      name,
      themeId: theme.id,
      // The whole cast: the user never chose a subset, so narrowing it now
      // would remove people from a team they have been working with.
      characterRoster: theme.characters.map((c) => c.id)
    })
    if (!snapshot) return null

    set({
      project: snapshot.project,
      projects: await window.backstage.projects.list(),
      legacy: null
    })
    return snapshot.project
  },

  /*
   * The change is staged rather than instant: veil, commit behind it, lift.
   * That reads as walking onto another set instead of as a React re-render.
   *
   * The roster is rewritten with it. A roster names characters from one world
   * and means nothing in another, so carrying it across would leave the
   * project pointing at people who do not exist here.
   */
  changeTheme: (themeId) => {
    const current = get().project
    if (!current || !isKnownTheme(themeId) || themeId === current.themeId) return

    set({ switching: true })
    window.setTimeout(() => {
      const theme = getTheme(themeId)
      void get()
        .update({
          themeId,
          characterRoster: theme.characters
            .slice(0, Math.max(1, current.characterRoster.length))
            .map((c) => c.id)
        })
        .finally(() => {
          window.setTimeout(() => set({ switching: false }), 60)
        })
    }, 220)
  }
}))

function readLegacyThemeId(): string {
  try {
    const saved = window.localStorage.getItem(LEGACY_THEME_KEY)
    if (isKnownTheme(saved)) return saved as string
  } catch {
    // Storage can be unavailable; the default is always valid.
  }
  return defaultThemeId
}

/* --------------------------------------------------------------- selectors -- */

/**
 * The open project's world.
 *
 * Falls back to the default theme when nothing is open, so a component that
 * renders for a frame before the project arrives has a palette rather than a
 * crash. Nothing user-facing is reachable in that state.
 */
export function useProjectTheme(): Theme {
  return getTheme(useProject((s) => s.project?.themeId))
}

/**
 * The open project's cast, in the order the user picked it.
 *
 * Memoised on the roster's *contents*. `projectCast` builds a new array every
 * call, and this feeds `useMemo` dependency lists all over the app — the world
 * engine rebakes every sprite sheet when it changes — so returning a fresh
 * reference each render would quietly turn those memos off.
 */
export function useProjectCast(): CharacterDef[] {
  const themeId = useProject((s) => s.project?.themeId)
  const rosterKey = useProject((s) => (s.project?.characterRoster ?? []).join('|'))

  return useMemo(
    () => projectCast(getTheme(themeId), rosterKey ? rosterKey.split('|') : []),
    [themeId, rosterKey]
  )
}

/** The agent that coordinates ALL AGENTS work, if the project has one. */
export function godAgentOf(
  project: Project | null,
  agents: AgentConfig[]
): AgentConfig | null {
  if (!project?.godAgentId) return null
  return agents.find((a) => a.id === project.godAgentId) ?? null
}
