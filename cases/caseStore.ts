import type { Case } from '../src/shared/projects'
import { makeId, readJson, writeJson } from '../agents/persist'
import { getActiveProjectId } from '../projects/projectStore'

/**
 * Cases, persisted and project-scoped.
 *
 * A case is one investigation: what the user asked for, and everything the team
 * did about it. Tasks belong to cases; a request broadcast to three agents is
 * three tasks inside one case, which is the distinction the old flat task list
 * could not express.
 *
 * Cases outlive the session and tasks do not, deliberately. Reopening the app
 * to a list of jobs that are no longer running is noise; reopening to the
 * investigations they belonged to is a record of what the project has been for.
 */

const FILE = 'cases.json'

/** How many cases to keep per project. The oldest closed ones fall off. */
const LIMIT = 200

let cases: Case[] | null = null

function normalise(raw: unknown): Case | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>

  const id = typeof c.id === 'string' ? c.id.trim() : ''
  const projectId = typeof c.projectId === 'string' ? c.projectId.trim() : ''
  if (!id || !projectId) return null

  return {
    id,
    projectId,
    name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Investigation',
    description: typeof c.description === 'string' ? c.description : '',
    status: c.status === 'closed' ? 'closed' : 'open',
    createdAt: Number.isFinite(c.createdAt) ? Number(c.createdAt) : Date.now(),
    updatedAt: Number.isFinite(c.updatedAt) ? Number(c.updatedAt) : Date.now(),
    taskIds: Array.isArray(c.taskIds)
      ? c.taskIds.filter((x): x is string => typeof x === 'string')
      : [],
    involvedAgentIds: Array.isArray(c.involvedAgentIds)
      ? c.involvedAgentIds.filter((x): x is string => typeof x === 'string')
      : []
  }
}

function load(): Case[] {
  if (cases) return cases
  const raw = readJson<unknown[]>(FILE, [])
  cases = (Array.isArray(raw) ? raw : [])
    .map(normalise)
    .filter((c): c is Case => c !== null)
  return cases
}

function persist(): void {
  writeJson(FILE, cases ?? [])
}

/** The open project's cases, newest first. */
export function listCases(): Case[] {
  const projectId = getActiveProjectId()
  if (!projectId) return []
  return load()
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getCase(id: string): Case | undefined {
  return listCases().find((c) => c.id === id)
}

export function createCase(name: string, description = ''): Case | null {
  const projectId = getActiveProjectId()
  if (!projectId) return null

  const now = Date.now()
  const created: Case = {
    id: makeId('case'),
    projectId,
    name: name.trim() || 'Investigation',
    description,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    taskIds: [],
    involvedAgentIds: []
  }

  const all = load()
  all.push(created)
  trim(all, projectId)
  persist()
  return created
}

export function renameCase(id: string, name: string): Case | null {
  const target = getCase(id)
  if (!target || !name.trim()) return null
  target.name = name.trim()
  target.updatedAt = Date.now()
  persist()
  return target
}

export function setCaseStatus(id: string, status: Case['status']): Case | null {
  const target = getCase(id)
  if (!target) return null
  target.status = status
  target.updatedAt = Date.now()
  persist()
  return target
}

export function deleteCase(id: string): void {
  const target = getCase(id)
  if (!target) return
  const all = load()
  all.splice(all.indexOf(target), 1)
  persist()
}

/**
 * Drop every case belonging to a project.
 *
 * Not `deleteCase` in a loop: `getCase` resolves against the open project, and
 * a project is deleted from the picker with nothing open, so each call would
 * find nothing.
 */
export function removeProjectCases(projectId: string): number {
  if (!projectId) return 0
  const all = load()
  const kept = all.filter((c) => c.projectId !== projectId)
  if (kept.length === all.length) return 0

  const removed = all.length - kept.length
  cases = kept
  persist()
  return removed
}

/**
 * Record that a task ran under a case.
 *
 * Called by the orchestrator as work is queued, so the case's membership is
 * built from what actually happened rather than from what was intended. A task
 * that was rejected before it was queued never appears.
 */
export function attachTask(caseId: string, taskId: string, agentId: string): void {
  const target = getCase(caseId)
  if (!target) return

  let changed = false
  if (!target.taskIds.includes(taskId)) {
    target.taskIds.push(taskId)
    changed = true
  }
  if (!target.involvedAgentIds.includes(agentId)) {
    target.involvedAgentIds.push(agentId)
    changed = true
  }
  if (!changed) return

  target.updatedAt = Date.now()
  persist()
}

/**
 * The case a chain of work belongs to, creating one if this is its start.
 *
 * Every task descended from one request shares a correlation id, which is
 * exactly the shape of an investigation — so a case is opened per chain and
 * named from the request that began it. The user never has to create a case
 * before asking a question, and the page still reports investigations rather
 * than individual prompts.
 */
const chainCases = new Map<string, string>()

/** Cap, so a long session cannot grow the chain map without bound. */
const MAX_CHAINS = 500

export function caseForChain(correlationId: string, title: string): string | null {
  const known = chainCases.get(correlationId)
  if (known && getCase(known)) return known

  const created = createCase(title)
  if (!created) return null

  if (chainCases.size >= MAX_CHAINS) {
    const oldest = chainCases.keys().next().value
    if (oldest !== undefined) chainCases.delete(oldest)
  }
  chainCases.set(correlationId, created.id)
  return created.id
}

/** Keep the newest cases for a project, dropping closed ones first. */
function trim(all: Case[], projectId: string): void {
  const mine = all.filter((c) => c.projectId === projectId)
  if (mine.length <= LIMIT) return

  const doomed = mine
    .sort((a, b) => {
      // Closed before open, then oldest first: an investigation still running
      // is never dropped to make room for one that has finished.
      if (a.status !== b.status) return a.status === 'closed' ? -1 : 1
      return a.updatedAt - b.updatedAt
    })
    .slice(0, mine.length - LIMIT)

  for (const c of doomed) all.splice(all.indexOf(c), 1)
}
