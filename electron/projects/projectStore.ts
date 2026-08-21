import { resolve } from 'node:path'
import type { Project, ProjectPatch } from '../../src/shared/projects'
import { makeId, readJson, writeJson } from '../agents/persist'
import { setWorkspace } from '../workspace/WorkspaceManager'
import { nameFromPath, normaliseProject, resolveActiveId } from './projectRules'

export { nameFromPath } from './projectRules'

/**
 * The project registry, persisted.
 *
 * Many projects are stored; exactly one is open. Opening a project is the act
 * that points the rest of the app at a workspace, a theme and a cast — so
 * `setActiveProject` is deliberately the only thing in here with a side effect
 * beyond the file, and that side effect is calling `setWorkspace`. The path
 * validator in WorkspaceManager stays the single security boundary; nothing
 * here learns to open a file.
 *
 * This module knows nothing about agents. Creating a project also creates its
 * roster, but that composition happens in the IPC layer, which can see both
 * stores — putting it here would make projectStore and agentStore import each
 * other, and each one is reached from the other's normalisation path.
 */

const FILE = 'projects.json'

interface Stored {
  activeProjectId: string | null
  projects: Project[]
}

let state: Stored | null = null

function load(): Stored {
  if (state) return state

  const raw = readJson<Partial<Stored>>(FILE, {})
  const projects = Array.isArray(raw.projects)
    ? raw.projects.map(normaliseProject).filter((p): p is Project => p !== null)
    : []

  state = {
    activeProjectId: resolveActiveId(projects, raw.activeProjectId),
    projects
  }
  return state
}

function persist(): void {
  if (state) writeJson(FILE, state)
}

/* ------------------------------------------------------------- reading -- */

export function listProjects(): Project[] {
  return load().projects
}

export function hasProjects(): boolean {
  return load().projects.length > 0
}

export function getProject(id: string): Project | undefined {
  return load().projects.find((p) => p.id === id)
}

export function getActiveProject(): Project | null {
  const { activeProjectId, projects } = load()
  if (!activeProjectId) return null
  return projects.find((p) => p.id === activeProjectId) ?? null
}

/**
 * The active project's id, or the empty string.
 *
 * Used to stamp and filter child records. Returning a string rather than
 * `null` is deliberate: an agent stamped with `''` belongs to no project and
 * is therefore invisible everywhere, which is the correct outcome for a record
 * written while nothing was open.
 */
export function getActiveProjectId(): string {
  return getActiveProject()?.id ?? ''
}

/* ------------------------------------------------------------- writing -- */

/**
 * Open a project.
 *
 * Pointing the workspace at it is part of opening it, not a separate step a
 * caller could forget — a project whose folder was not loaded would be one
 * where every file tool silently refused.
 */
export function setActiveProject(id: string): Project | null {
  const s = load()
  const project = s.projects.find((p) => p.id === id)
  if (!project) return null

  s.activeProjectId = project.id
  persist()
  setWorkspace(project.workspacePath)
  return project
}

export function createProject(input: {
  name: string
  workspacePath: string
  themeId: string
  characterRoster: string[]
}): Project {
  const s = load()
  const workspacePath = resolve(input.workspacePath)
  const now = Date.now()

  const project: Project = {
    id: makeId('proj'),
    name: input.name.trim() || nameFromPath(workspacePath),
    workspacePath,
    themeId: input.themeId,
    characterRoster: [...input.characterRoster],
    // Set once the roster's agents exist; the caller that creates them owns it.
    godAgentId: null,
    createdAt: now,
    updatedAt: now
  }

  s.projects.push(project)
  persist()
  return project
}

/**
 * Remove a project from the registry.
 *
 * The folder on disk is deliberately untouched. Backstage was given access to
 * a repository; forgetting it is the app's business, and deleting the user's
 * source tree because they tidied a list is not a mistake that can be undone.
 *
 * If the project being deleted was the open one, the workspace is closed with
 * it. Leaving it pointed at a folder no project claims any more would keep
 * every file and terminal tool live against a project that no longer exists —
 * the one state the security boundary is meant to make impossible. Nothing is
 * opened in its place: which project to open next is the picker's question,
 * and answering it here would be the app choosing a repository again.
 *
 * Child records are *not* swept here. `projectStore` knows nothing about
 * agents, cases or automations, and teaching it would make it and `agentStore`
 * import each other; the IPC layer, which can see all of them, composes the
 * full delete.
 */
export function deleteProject(id: string): boolean {
  const s = load()
  const index = s.projects.findIndex((p) => p.id === id)
  if (index === -1) return false

  s.projects.splice(index, 1)
  if (s.activeProjectId === id) {
    s.activeProjectId = null
    setWorkspace(null)
  }
  persist()
  return true
}

/**
 * Whether this agent coordinates the open project.
 *
 * Lives here, beside the setting itself, because three separate places need
 * the answer and each one used to work it out for itself — the permission
 * check in the team tools, the system prompt, and the tool list. They had
 * already drifted: the permission check and the prompt agreed that the lead
 * may reach its whole team, and the tool list did not, so the lead was
 * authorised to do something it had no tool to do.
 */
export function isTeamLead(agentId: string): boolean {
  const project = getActiveProject()
  return !!project?.godAgentId && project.godAgentId === agentId
}

export function updateProject(id: string, patch: ProjectPatch): Project | null {
  const project = getProject(id)
  if (!project) return null

  if (patch.name !== undefined && patch.name.trim()) {
    project.name = patch.name.trim()
  }
  if (patch.themeId !== undefined && patch.themeId) {
    project.themeId = patch.themeId
  }
  if (patch.characterRoster !== undefined) {
    project.characterRoster = patch.characterRoster.filter(
      (x): x is string => typeof x === 'string'
    )
  }
  if (patch.godAgentId !== undefined) {
    project.godAgentId = patch.godAgentId || null
  }

  project.updatedAt = Date.now()
  persist()
  return project
}

/**
 * Adopt a project that was assembled elsewhere.
 *
 * Only the migration uses this: it reconstructs a project from state that
 * predates the idea of projects, and needs to keep the ids it has already
 * stamped onto the existing roster rather than being handed a fresh one.
 */
export function adoptProject(project: Project, makeActive: boolean): Project {
  const s = load()
  s.projects.push(project)
  if (makeActive) s.activeProjectId = project.id
  persist()
  if (makeActive) setWorkspace(project.workspacePath)
  return project
}
