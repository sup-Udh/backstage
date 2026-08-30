import type { AutomationOrigin, AutomationRun, AutomationRunStatus } from './agent.types'
import { makeId, readJson, writeJson } from './persist'
import { getActiveProjectId } from '../projects/projectStore'

/**
 * What each automation actually did, and when.
 *
 * Persisted, unlike the task ledger, and for the opposite reason: a task is a
 * record of the session you are in, while a run is the answer to "what happened
 * overnight" — which is the only question a scheduled automation exists to be
 * asked. Reopening the app to an empty run history would make every scheduled
 * automation unverifiable.
 *
 * Bounded per project rather than globally, so a busy project cannot push a
 * quiet one's history off the end of the file.
 */

const FILE = 'automationRuns.json'

/** Enough to cover a fortnight of a daily automation, and no more. */
const PER_PROJECT_LIMIT = 60

let runs: AutomationRun[] | null = null

function normalise(raw: unknown): AutomationRun | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<AutomationRun>
  if (typeof r.id !== 'string' || typeof r.projectId !== 'string') return null
  if (typeof r.triggerId !== 'string') return null

  const status: AutomationRunStatus =
    r.status === 'completed' || r.status === 'failed' || r.status === 'blocked'
      ? r.status
      : /*
         * A run left as `running` by a crash or a quit is not running. Nothing
         * is going to finish it, and showing it as live forever would make the
         * one status that means "look at this now" meaningless.
         */
        r.status === 'running'
        ? 'failed'
        : 'failed'

  return {
    id: r.id,
    projectId: r.projectId,
    triggerId: r.triggerId,
    triggerName: typeof r.triggerName === 'string' ? r.triggerName : 'Automation',
    origin: (['event', 'schedule', 'manual'] as AutomationOrigin[]).includes(
      r.origin as AutomationOrigin
    )
      ? (r.origin as AutomationOrigin)
      : 'event',
    status,
    startedAt: Number.isFinite(r.startedAt) ? Number(r.startedAt) : Date.now(),
    endedAt: Number.isFinite(r.endedAt) ? Number(r.endedAt) : Date.now(),
    agentIds: Array.isArray(r.agentIds)
      ? r.agentIds.filter((x): x is string => typeof x === 'string')
      : [],
    agentNames: Array.isArray(r.agentNames)
      ? r.agentNames.filter((x): x is string => typeof x === 'string')
      : [],
    taskIds: Array.isArray(r.taskIds)
      ? r.taskIds.filter((x): x is string => typeof x === 'string')
      : [],
    threadId: typeof r.threadId === 'string' ? r.threadId : null,
    correlationId: typeof r.correlationId === 'string' ? r.correlationId : '',
    summary: typeof r.summary === 'string' ? r.summary : null,
    error: typeof r.error === 'string' ? r.error : null
  }
}

function load(): AutomationRun[] {
  if (runs) return runs
  const raw = readJson<unknown[]>(FILE, [])
  runs = (Array.isArray(raw) ? raw : [])
    .map(normalise)
    .filter((r): r is AutomationRun => r !== null)
  return runs
}

function persist(): void {
  const all = load()

  // Trim per project, so one busy project cannot evict another's history.
  const byProject = new Map<string, AutomationRun[]>()
  for (const run of all) {
    const list = byProject.get(run.projectId) ?? []
    list.push(run)
    byProject.set(run.projectId, list)
  }

  const kept: AutomationRun[] = []
  for (const list of byProject.values()) {
    kept.push(...list.slice(-PER_PROJECT_LIMIT))
  }
  kept.sort((a, b) => a.startedAt - b.startedAt)

  runs = kept
  writeJson(FILE, kept)
}

/* --------------------------------------------------------------- writing -- */

export function startRun(input: {
  triggerId: string
  triggerName: string
  origin: AutomationOrigin
  correlationId: string
  agentIds: string[]
  agentNames: string[]
  threadId: string | null
}): AutomationRun | null {
  const projectId = getActiveProjectId()
  if (!projectId) return null

  const run: AutomationRun = {
    id: makeId('run'),
    projectId,
    triggerId: input.triggerId,
    triggerName: input.triggerName,
    origin: input.origin,
    status: 'running',
    startedAt: Date.now(),
    endedAt: null,
    agentIds: [...input.agentIds],
    agentNames: [...input.agentNames],
    taskIds: [],
    threadId: input.threadId,
    correlationId: input.correlationId,
    summary: null,
    error: null
  }
  load().push(run)
  persist()
  return run
}

export function getRun(id: string): AutomationRun | undefined {
  const projectId = getActiveProjectId()
  if (!projectId) return undefined
  return load().find((r) => r.id === id && r.projectId === projectId)
}

export function attachRunTask(runId: string, taskId: string): void {
  const run = getRun(runId)
  if (!run || run.taskIds.includes(taskId)) return
  run.taskIds.push(taskId)
  persist()
}

export function finishRun(
  runId: string,
  status: AutomationRunStatus,
  extra: { summary?: string | null; error?: string | null } = {}
): AutomationRun | undefined {
  const run = getRun(runId)
  if (!run) return undefined
  // A run only settles once. A second agent finishing must not overwrite the
  // failure the first one recorded.
  if (run.status !== 'running') return run

  run.status = status
  run.endedAt = Date.now()
  if (extra.summary !== undefined) run.summary = extra.summary
  if (extra.error !== undefined) run.error = extra.error
  persist()
  return run
}

/**
 * Runs still in flight for this trigger.
 *
 * Used to settle a run when the last of its tasks reports back, and to stop a
 * scheduled automation starting a second run while the first is still going.
 */
export function runningRunFor(triggerId: string): AutomationRun | undefined {
  const projectId = getActiveProjectId()
  if (!projectId) return undefined
  return load().find(
    (r) => r.projectId === projectId && r.triggerId === triggerId && r.status === 'running'
  )
}

export function runForCorrelation(correlationId: string): AutomationRun | undefined {
  if (!correlationId) return undefined
  const projectId = getActiveProjectId()
  if (!projectId) return undefined
  return load().find(
    (r) =>
      r.projectId === projectId &&
      r.correlationId === correlationId &&
      r.status === 'running'
  )
}

/* --------------------------------------------------------------- reading -- */

/** The open project's runs, newest first. */
export function listRuns(limit = 30, triggerId?: string): AutomationRun[] {
  const projectId = getActiveProjectId()
  if (!projectId) return []
  return load()
    .filter((r) => r.projectId === projectId && (!triggerId || r.triggerId === triggerId))
    .slice(-limit)
    .reverse()
}

export function removeTriggerRuns(triggerId: string): void {
  const all = load()
  const kept = all.filter((r) => r.triggerId !== triggerId)
  if (kept.length === all.length) return
  runs = kept
  persist()
}

export function removeProjectRuns(projectId: string): number {
  if (!projectId) return 0
  const all = load()
  const kept = all.filter((r) => r.projectId !== projectId)
  const removed = all.length - kept.length
  if (removed > 0) {
    runs = kept
    persist()
  }
  return removed
}
