import type {
  LegacyAdoption,
  Project,
  ProjectBootstrap,
  ProjectSnapshot
} from '../../src/shared/projects'
import { listAgents, listAllAgents, persistAgents } from '../agents/agentStore'
import { makeId } from '../agents/persist'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import {
  adoptProject,
  getActiveProject,
  hasProjects,
  listProjects,
  setActiveProject
} from './projectStore'
import { nameFromPath, reseatSlots } from './projectRules'

/**
 * What state the app found on disk, and what is still owed.
 *
 * Backstage predates the idea of projects: an install from before this change
 * has a workspace folder, a roster of agents and a theme, none of which belong
 * to anything. Discarding that would empty a team the user has been working
 * with, so it is adopted into a project instead.
 *
 * The *theme* is the one piece the main process cannot supply. It was stored in
 * the renderer's localStorage, and the cast that goes with it lives beside
 * canvas code this side cannot import. So this module reports what it found and
 * the renderer completes the adoption with a theme and a roster — which also
 * keeps the rule the codebase already holds to, that nothing behind the IPC
 * boundary can tell one theme id from another.
 */

/**
 * Bring the stored state up to date and report it.
 *
 * Called once, after `loadWorkspace()`. Opening the stored project is part of
 * this rather than left to the renderer, because every main-process read is
 * already scoped to whatever is open — a window that rendered before a project
 * was active would ask for the roster and correctly be told there is none.
 */
export function bootstrapProjects(): ProjectBootstrap {
  if (hasProjects()) {
    // Re-open the stored project, which also re-points the workspace at it.
    const active = getActiveProject()
    if (active) setActiveProject(active.id)
    return { projects: listProjects(), activeProject: getActiveProject(), legacy: null }
  }

  const workspacePath = getWorkspaceRoot()
  const orphans = listAllAgents().filter((a) => !a.projectId)

  /*
   * Nothing worth adopting: a genuinely fresh install, or one whose only
   * agents already belong somewhere. The setup wizard takes it from here.
   */
  if (!workspacePath && orphans.length === 0) {
    return { projects: [], activeProject: null, legacy: null }
  }

  return {
    projects: [],
    activeProject: null,
    legacy: {
      // An install with agents but no folder is possible; the wizard will ask.
      workspacePath: workspacePath ?? '',
      agentCount: orphans.length
    }
  }
}

/**
 * Adopt pre-project state into a real project.
 *
 * Every agent that belongs to no project is moved into this one and its
 * character slot clamped into the new roster, so a team that was cast against
 * a theme's full eight characters still resolves to a face when the project
 * has three. The first agent becomes the team lead — a project needs one, and
 * the alternative is opening ALL AGENTS mode onto nobody.
 */
export function adoptLegacy(input: LegacyAdoption): ProjectSnapshot | null {
  if (hasProjects()) return null

  // The folder that was already open is the project's workspace. Without one
  // there is nothing to adopt *into*, and the wizard is the right path instead.
  const workspacePath = getWorkspaceRoot()
  if (!workspacePath) return null

  const now = Date.now()
  const project: Project = {
    id: makeId('proj'),
    name: input.name.trim() || nameFromPath(workspacePath),
    workspacePath,
    themeId: input.themeId,
    characterRoster: [...input.characterRoster],
    godAgentId: null,
    createdAt: now,
    updatedAt: now
  }

  const orphans = listAllAgents().filter((a) => !a.projectId)
  const seats = reseatSlots(
    orphans.length,
    project.characterRoster.length,
    orphans.map((a) => a.characterSlot)
  )

  orphans.forEach((agent, i) => {
    agent.projectId = project.id
    agent.characterSlot = seats[i]
    agent.updatedAt = now
  })

  project.godAgentId = orphans[0]?.id ?? null

  adoptProject(project, true)
  // The stamping above mutated the roster in place; this is the write.
  persistAgents()

  return { project, agents: listAgents() }
}
