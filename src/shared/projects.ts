/**
 * The project domain.
 *
 * Types only, like ./agents, so both processes import it without either
 * pulling the other's runtime in.
 *
 * A project is the container for everything the user sees after they walk in:
 * one workspace folder, one theme, one cast, one team lead, and the agents,
 * relationships and cases that belong to them. Nothing in Backstage is global
 * any more except credentials and the orchestration spend limits — everything
 * else is reached through a project id, which is what makes "no cross-theme
 * leaking" a property of the data model rather than a rule each page has to
 * remember.
 */

import type { AgentConfig } from './agents'

export interface Project {
  id: string
  /** Editable. Defaults to the workspace folder's own name. */
  name: string
  /** Absolute path. The security boundary every local tool resolves against. */
  workspacePath: string
  /** The one theme this project's world, cast and settings come from. */
  themeId: string
  /**
   * The characters chosen for this project, as CharacterDef ids, in the order
   * they were picked.
   *
   * An agent's `characterSlot` indexes *this* list, not the theme's full cast.
   * That is the difference between "the project has three people in it" and
   * "the project shows three of the theme's eight people".
   */
  characterRoster: string[]
  /**
   * The team lead: the agent that receives an ALL AGENTS request, decides how
   * to split it, and reports back.
   *
   * An agent id rather than a character id, because delegation happens in the
   * runtime and the runtime has never heard of characters. null while a
   * project has no agents yet.
   */
  godAgentId: string | null
  createdAt: number
  updatedAt: number
}

/**
 * One character the user picked during setup.
 *
 * The renderer supplies the name and role rather than the main process looking
 * them up, because characters live in `src/themes` alongside canvas code the
 * main process cannot import. Keeping the lookup on the renderer side is also
 * what preserves the rule the codebase already holds to: there is no
 * `if (theme === ...)` anywhere behind the IPC boundary.
 */
export interface RosterEntry {
  /** CharacterDef.id from the chosen theme. */
  characterId: string
  name: string
  role: string
}

/** What the setup wizard hands over to create a project. */
export interface ProjectDraft {
  name: string
  workspacePath: string
  themeId: string
  roster: RosterEntry[]
  /** Which roster entry orchestrates, as a character id. */
  godCharacterId: string | null
}

/** What may be changed after creation, from project settings. */
export interface ProjectPatch {
  name?: string
  themeId?: string
  /** Replacing the roster re-seeds nothing; it only changes who is cast. */
  characterRoster?: string[]
  godAgentId?: string | null
}

/**
 * A project and the roster that belongs to it, returned together.
 *
 * Creating a project also creates its agents, and the caller needs both — so
 * they are returned in one response rather than leaving the renderer to
 * re-fetch and briefly render a project with nobody in it.
 */
export interface ProjectSnapshot {
  project: Project
  agents: AgentConfig[]
}

/* ----------------------------------------------------------------- cases -- */

/**
 * One investigation.
 *
 * A case is what the user asked for; the tasks under it are how the team went
 * about it. Before this existed, the Cases page listed one card per task —
 * so a single request broadcast to three agents read as three unrelated
 * investigations, which is the one thing the page was supposed to make clear
 * it was not.
 *
 * Cases are persisted and project-scoped. Tasks are not persisted: they are a
 * record of a session's work, and reopening the app to a list of jobs that are
 * no longer running is worse than reopening to the investigations they
 * belonged to.
 */
export interface Case {
  id: string
  projectId: string
  name: string
  description: string
  status: 'open' | 'closed'
  createdAt: number
  updatedAt: number
  /** Tasks that have run under this case, oldest first. */
  taskIds: string[]
  /** Every agent that has worked on it. */
  involvedAgentIds: string[]
}

/* ------------------------------------------------------------- bootstrap -- */

/**
 * State from before projects existed, found on disk and not yet adopted.
 *
 * An install predating this change has a workspace folder and a roster that
 * belong to nothing. Discarding them would empty a team the user has been
 * working with, so they are folded into a project instead — but the *theme*
 * was stored in the renderer's localStorage, so the main process reports what
 * it found and the renderer completes the adoption.
 */
export interface LegacyState {
  workspacePath: string
  agentCount: number
}

export interface ProjectBootstrap {
  projects: Project[]
  activeProject: Project | null
  /** Set only when pre-project state was found and has not been adopted yet. */
  legacy: LegacyState | null
}

/** What the renderer supplies to finish adopting pre-project state. */
export interface LegacyAdoption {
  name: string
  themeId: string
  characterRoster: string[]
}
