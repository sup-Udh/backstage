import { ipcMain } from 'electron'
import type {
  Case,
  LegacyAdoption,
  Project,
  ProjectBootstrap,
  ProjectDraft,
  ProjectPatch,
  ProjectSnapshot
} from '../../src/shared/projects'
import type { AgentTask } from '../../src/shared/agents'
import {
  deleteCase,
  getCase,
  listCases,
  renameCase,
  setCaseStatus
} from '../cases/caseStore'
import { tasksInCase } from '../agents/taskStore'
import {
  createProject,
  getActiveProject,
  listProjects,
  setActiveProject,
  updateProject
} from '../projects/projectStore'
import { adoptLegacy, bootstrapProjects } from '../projects/bootstrap'
import { listAgents, seedRoster } from '../agents/agentStore'
import { pickFolder } from '../workspace/WorkspaceManager'
import { PROVIDERS } from '../providers/registry'
import { statusFor } from './providers'

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
      const project = setActiveProject(String(projectId ?? ''))
      if (!project) return null
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
