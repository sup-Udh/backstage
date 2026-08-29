import { ipcMain } from 'electron'
import type {
  Case,
  LegacyAdoption,
  Project,
  ProjectBootstrap,
  ProjectDraft,
  ProjectPatch,
  ProjectSnapshot
} from '../src/shared/projects'
import type { AgentTask } from '../src/shared/agents'
import {
  deleteCase,
  getCase,
  listCases,
  removeProjectCases,
  renameCase,
  setCaseStatus
} from '../cases/caseStore'
import { tasksInCase } from '../agents/taskStore'
import {
  createProject,
  deleteProject,
  getActiveProject,
  getProject,
  listProjects,
  setActiveProject,
  updateProject
} from '../projects/projectStore'
import { adoptLegacy, bootstrapProjects } from '../projects/bootstrap'
import { listAgents, listAllAgents, removeProjectAgents, seedRoster } from '../agents/agentStore'
/*
 * The rules module directly, not the store's wrappers: those resolve against
 * the *open* project's roster, and this deletes a project that is not open.
 */
import { groupOf, threadIdFor } from '../agents/relationships'
import { agentRegistry } from '../agents/AgentRegistry'
import { orchestrator } from '../agents/AgentOrchestrator'
import { conversationStore } from '../agents/conversationStore'
import { forgetAgent, removeProjectTriggers } from '../agents/triggerStore'
import { pickFolder } from '../workspace/WorkspaceManager'
import { PROVIDERS } from '../providers/registry'
import { statusFor } from './providers'
import { terminals } from '../terminal/TerminalSessionManager'
import { agentSessions } from '../terminal/AgentSessionManager'
import { sessionTranscripts } from '../terminal/sessionTranscript'

/**
 * The project surface.
 *
 * This is where a project and its roster are composed. `projectStore` knows
 * nothing about agents and `agentStore` knows nothing about themes, which is
 * what keeps them from importing each other — so the one operation that needs
 * both, "create a project and the people in it", lives here.
 *
 * Note the file next door: `project.ts` (singular) is files, git and commands
 * for the open project. This one is the projects themselves.
 */

export function registerProjectsHandlers(): void {
  ipcMain.handle('projects:bootstrap', (): ProjectBootstrap => bootstrapProjects())

  ipcMain.handle('projects:list', (): Project[] => listProjects())

  ipcMain.handle('projects:active', (): Project | null => getActiveProject())

  ipcMain.handle('projects:chooseFolder', () => pickFolder())

  /**
   * Create a project and cast it.
   *
   * The roster arrives as characters because that is how the user picked it.
   * Every one becomes an agent, and the character chosen as team lead becomes
   * the project's god agent — resolved here, by position, because the renderer
   * speaks in character ids and the runtime only speaks in agent ids.
   */
  ipcMain.handle(
    'projects:create',
    (_e, draft: ProjectDraft): ProjectSnapshot | { error: string } => {
      if (!draft?.workspacePath) return { error: 'Choose a project folder first.' }
      if (!draft.themeId) return { error: 'Choose a world for this project.' }
      if (!draft.roster?.length) {
        return { error: 'Choose at least one character for this project.' }
      }

      const project = createProject({
        name: draft.name,
        workspacePath: draft.workspacePath,
        themeId: draft.themeId,
        characterRoster: draft.roster.map((r) => r.characterId)
      })

      /*
       * Seeding needs the project to be the open one, because `upsertAgent`
       * and every scoped read resolve against whatever is active. Opening it
       * first also means a failure part-way through leaves a real, openable
       * project rather than an orphaned record.
       */
      setActiveProject(project.id)

      const agents = seedRoster(project.id, draft.roster, defaultProviderId())

      const leadIndex = draft.godCharacterId
        ? draft.roster.findIndex((r) => r.characterId === draft.godCharacterId)
        : 0
      const godAgentId = agents[leadIndex >= 0 ? leadIndex : 0]?.id ?? null
      const withLead = updateProject(project.id, { godAgentId }) ?? project

      return { project: withLead, agents }
    }
  )

  ipcMain.handle(
    'projects:open',
    (_e, projectId: unknown): ProjectSnapshot | null => {
      const prevActive = getActiveProject()
      const project = setActiveProject(String(projectId ?? ''))
      if (!project) return null

      if (prevActive && prevActive.id !== project.id) {
        // Stop any running API tasks for the old project
        const prevAgents = listAllAgents().filter(a => a.projectId === prevActive.id)
        for (const a of prevAgents) orchestrator.cancel(a.id)

        // Stop terminals
        const prevTerminals = terminals.list().filter(t => t.projectId === prevActive.id)
        for (const t of prevTerminals) {
          for (const s of agentSessions.list()) {
            if (s.terminalSessionId === t.id) sessionTranscripts.forget(s.id)
          }
          agentSessions.forgetTerminal(t.id)
          terminals.remove(t.id)
        }
      }

      return { project, agents: listAgents() }
    }
  )

  ipcMain.handle(
    'projects:update',
    (_e, projectId: unknown, patch: ProjectPatch): Project | null =>
      updateProject(String(projectId ?? ''), patch ?? {})
  )

  ipcMain.handle(
    'projects:adoptLegacy',
    (_e, input: LegacyAdoption): ProjectSnapshot | null => adoptLegacy(input)
  )

  /**
   * Delete a project and everything scoped to it.
   *
   * Composed here for the same reason creation is: this is the only layer that
   * can see the project registry, the roster, the automations, the cases and
   * the transcripts at once. Leaving any of them behind would not be a tidy
   * remainder — an agent whose project is gone is stamped with an id nothing
   * resolves, so it is invisible in every view and impossible to delete from
   * the interface afterwards.
   *
   * The order matters. Running work is cancelled before its configuration
   * stops existing, and the transcripts are removed while the agents that key
   * them are still known.
   *
   * What is *not* touched is the folder on disk. Backstage was given access to
   * a repository; forgetting it is all this does.
   */
  ipcMain.handle('projects:remove', (_e, projectId: unknown): Project[] => {
    const id = String(projectId ?? '')
    const project = getProject(id)
    if (!project) return listProjects()

    const doomed = removeProjectAgents(id)

    /*
     * Every group conversation among them, worked out from the relationships
     * they still carry — a thread id is derived from its members, so once the
     * agents are gone the file can no longer be named.
     */
    const threadIds = new Set<string>()
    for (const agent of doomed) {
      const members = groupOf(doomed, agent.id)
      if (members.length > 1) threadIds.add(threadIdFor(members))
    }

    for (const agent of doomed) {
      // Stop it before it stops existing, as `agents:remove` does.
      orchestrator.cancel(agent.id)
      /*
       * Triggers are swept app-wide rather than project-wide: an automation in
       * another project could name one of these agents, and `forgetAgent`
       * already covers exactly that case.
       */
      forgetAgent(agent.id)
      conversationStore.forget(project.workspacePath, agent.id)
    }
    for (const threadId of threadIds) {
      conversationStore.forget(project.workspacePath, threadId)
    }

    removeProjectTriggers(id)
    removeProjectCases(id)
    deleteProject(id)
    agentRegistry.refreshAll()

    return listProjects()
  })

  /* ----------------------------------------------------------- cases -- */

  ipcMain.handle('cases:list', (): Case[] => listCases())

  /**
   * The work done under one case.
   *
   * Read from the task ledger rather than from the case record, so a task that
   * has aged out of the bounded in-memory log simply does not appear. The
   * alternative — trusting the stored id list — would show entries the app can
   * say nothing at all about.
   */
  ipcMain.handle('cases:tasks', (_e, caseId: unknown): AgentTask[] => {
    const target = getCase(String(caseId ?? ''))
    return target ? tasksInCase(target.id) : []
  })

  ipcMain.handle(
    'cases:rename',
    (_e, caseId: unknown, name: unknown): Case[] => {
      renameCase(String(caseId ?? ''), String(name ?? ''))
      return listCases()
    }
  )

  ipcMain.handle(
    'cases:setStatus',
    (_e, caseId: unknown, status: unknown): Case[] => {
      setCaseStatus(
        String(caseId ?? ''),
        status === 'closed' ? 'closed' : 'open'
      )
      return listCases()
    }
  )

  ipcMain.handle('cases:remove', (_e, caseId: unknown): Case[] => {
    deleteCase(String(caseId ?? ''))
    return listCases()
  })
}

/**
 * Which provider newly seeded agents start on.
 *
 * A connected one if there is one, so a project created after the user has set
 * up their keys works immediately. Otherwise the first registered provider —
 * the agent simply cannot be spawned until a key exists, which the roster page
 * already explains in the user's own terms.
 */
function defaultProviderId(): string {
  const connected = PROVIDERS.find((p) => statusFor(p.id).connected)
  return connected?.id ?? PROVIDERS[0]?.id ?? 'openai'
}
