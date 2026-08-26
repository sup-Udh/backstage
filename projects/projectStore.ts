import { resolve } from 'node:path'
import type { Project, ProjectPatch } from '../src/shared/projects'
import { makeId, readJson, writeJson } from '../agents/persist'
import { once } from '../agents/migrations'
import { setWorkspace } from '../workspace/WorkspaceManager'
import { currentUserId } from '../supabase/authService'
import { mirror } from '../supabase/mirror'
import {
  nameFromPath,
  normaliseProject,
  ownedBy,
  resolveActiveId
} from './projectRules'

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
 *
 * ---------------------------------------------------------------------------
 *
 * This file is also where user isolation is enforced, and it is worth being
 * precise about why it is enough.
 *
 * Nothing in Backstage is global except credentials and the spend limits.
 * Agents, cases, automations, threads and transcripts are every one of them
 * reached by first asking "which project is open?" — `getActiveProjectId()` —
 * and filtering on the answer. Adding an owner to the project record and
 * teaching `owned()` to hide everyone else's therefore scopes the entire
 * application through a single predicate, rather than by adding a `userId`
 * column to six stores and hoping every future read remembers to check it.
 *
 * The two functions that matter are `owned()` and `getActiveProjectId()`. A
 * project belonging to another account is reported as not existing rather than
 * as refused — the same answer `getAgent` gives for an agent in another
 * project, and for the same reason: there is no interface anywhere in the app
 * for a project you cannot open, so a distinct "exists but is not yours"
 * result would only invite callers to handle a case that must stay
 * unreachable.
 *
 * None of this replaces row level security. This is the guard on the local
 * cache; the database enforces the same rule again, on its own, against a
 * client it does not trust. Either alone would be a mistake.
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

/**
 * The signed-in account's projects, and only those.
 *
 * The single filter the rest of the application's isolation rests on. When
 * nobody is signed in, `currentUserId()` is the empty string and this is
 * empty — so a logged-out main process answers every scoped read with nothing,
 * whatever the renderer asks for. That is deliberate defence in depth: the
 * route guard in `App.tsx` stops the *interface* appearing, and this stops the
 * *data* being served even if something got past it.
 */
function owned(): Project[] {
  return ownedBy(load().projects, currentUserId())
}

export function listProjects(): Project[] {
  return owned()
}

export function hasProjects(): boolean {
  return owned().length > 0
}

export function getProject(id: string): Project | undefined {
  return owned().find((p) => p.id === id)
}

/**
 * Every project on disk, across every account.
 *
 * Internal, and exported for exactly two callers that genuinely have to see
 * past the filter: the claim migration below, and the cloud mirror, which
 * reconciles records it is about to stamp. Everything else goes through
 * `owned()` — the same discipline `listAllAgents` is held to.
 */
export function listAllProjects(): Project[] {
  return load().projects
}

/**
 * The open project, if it belongs to the signed-in account.
 *
 * The ownership re-check is not redundant with `setActiveProject`. The active
 * id is persisted, so the project opened by one account is still named in
 * `projects.json` when a different account signs in on the same machine — and
 * without this, every scoped read would happily answer against it.
 */
export function getActiveProject(): Project | null {
  const { activeProjectId } = load()
  if (!activeProjectId) return null
  return owned().find((p) => p.id === activeProjectId) ?? null
}

/**
 * The active project's id, or the empty string.
 *
 * Used to stamp and filter child records. Returning a string rather than
 * `null` is deliberate: an agent stamped with `''` belongs to no project and
 * is therefore invisible everywhere, which is the correct outcome for a record
 * written while nothing was open — and now also the correct outcome for one
 * written while nobody was signed in.
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
  // `owned`, not `s.projects`: opening is the moment a workspace folder is
  // handed to a team, and it must never be another account's folder.
  const project = owned().find((p) => p.id === id)
  if (!project) return null

  s.activeProjectId = project.id
  persist()
  setWorkspace(project.workspacePath)
  return project
}

/**
 * Close whatever is open, without choosing anything in its place.
 *
 * Called on sign-out. Leaving the active id pointing at the previous account's
 * project would keep the workspace — the boundary every file and terminal tool
 * resolves against — aimed at a folder that the person now sitting at the
 * machine has not been given.
 */
export function closeActiveProject(): void {
  const s = load()
  if (!s.activeProjectId) return
  s.activeProjectId = null
  persist()
  setWorkspace(null)
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

  /*
   * Refuse rather than write an unowned project. A project with no owner is
   * invisible to every read in the application, so creating one would present
   * as the wizard succeeding and the project simply never appearing — the
   * worst kind of failure to debug.
   */
  const userId = currentUserId()
  if (!userId) throw new Error('Sign in before creating a project.')

  const project: Project = {
    id: makeId('proj'),
    userId,
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
  mirror.project(project)
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
  // Scoped: a project belonging to another account is not deletable through
  // any path, including a guessed id arriving over IPC.
  if (!getProject(id)) return false

  const index = s.projects.findIndex((p) => p.id === id)
  if (index === -1) return false

  s.projects.splice(index, 1)
  if (s.activeProjectId === id) {
    s.activeProjectId = null
    setWorkspace(null)
  }
  persist()
  mirror.projectRemoved(id)
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
  mirror.project(project)
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
  // Stamped here rather than trusted from the caller: `bootstrap` assembles
  // this record out of pre-account state, which by definition names no owner.
  project.userId = project.userId || currentUserId()
  s.projects.push(project)
  if (makeActive) s.activeProjectId = project.id
  persist()
  if (makeActive) setWorkspace(project.workspacePath)
  mirror.project(project)
  return project
}

/**
 * Hand pre-account projects to the first person who signs in on this machine.
 *
 * Backstage stored projects before it had accounts, so an existing install has
 * work on disk that belongs to nobody — and an unowned project is invisible to
 * every read in this file. Doing nothing would present to that user as their
 * entire workspace having been deleted by an update.
 *
 * The rules, which are the whole of the safety argument:
 *
 *   - it runs once per machine, recorded in the migration ledger, so the
 *     *second* account to sign in inherits nothing;
 *   - it only ever touches records with no owner, so a project already
 *     belonging to somebody cannot be reassigned by it;
 *   - nothing is deleted, moved or rewritten beyond the owner field.
 *
 * A machine genuinely shared by two people from the start is the case this
 * cannot get right on its own, and it resolves it the conservative way: the
 * first signer keeps the legacy data, and the second starts empty rather than
 * being shown someone else's team.
 */
export function claimUnownedProjects(): number {
  const userId = currentUserId()
  if (!userId) return 0

  let claimed = 0
  once('projects.claim-pre-account-projects', () => {
    const s = load()
    for (const project of s.projects) {
      if (project.userId) continue
      project.userId = userId
      /*
       * `updatedAt` is deliberately left alone.
       *
       * It means "when did somebody last work on this", and the picker sorts
       * on it so the project you were in the middle of is the one at the
       * front. Claiming is a migration, not work: stamping the current time
       * would flatten every project in an existing install to the same
       * instant and throw that ordering away — which shows up as a list that
       * has forgotten what you were doing, on the very first launch after
       * signing in.
       */
      claimed++
    }
    if (claimed > 0) {
      persist()
      console.log(
        `[auth] claimed ${claimed} pre-account project(s) for the first signed-in user.`
      )
    }
  })

  return claimed
}
