import type { Trigger, TriggerActionType, TriggerEventType } from './agent.types'
import { makeId, readJson, writeJson } from './persist'
import { getSettings } from './settingsStore'
import { getActiveProjectId } from '../projects/projectStore'
import { isScheduleEvent, nextRunAt, normaliseSchedule } from './schedule'
import { detachAutomation } from './groupChats'
import { removeTriggerRuns } from './automationRuns'

/**
 * Automations, persisted.
 *
 * An automation is WHEN / IF / WHO / THEN, and it carries its own chain depth
 * and cooldown rather than borrowing the global ones. The global settings are
 * a ceiling, not a substitute: whichever of the two is stricter applies, so
 * lowering the global maximum immediately tightens every automation without
 * having to rewrite any of them.
 *
 * `lastFiredAt` is persisted deliberately. A cooldown that resets when the app
 * restarts is a cooldown that can be defeated by restarting. `nextRunAt` is
 * persisted for the same reason in reverse: a schedule recomputed from scratch
 * on every launch would let a daily automation be skipped by closing the app
 * over the minute it was due.
 */

const FILE = 'triggers.json'

const EVENTS: TriggerEventType[] = [
  'agent.task.completed',
  'agent.task.started',
  'agent.error',
  'agent.idle',
  'file.changed',
  'file.created',
  'file.deleted',
  'git.changed',
  'task.created',
  'task.completed',
  'agent.message.received',
  'schedule.daily',
  'schedule.weekly',
  'schedule.interval',
  'manual'
]

const ACTIONS: TriggerActionType[] = [
  'send.message',
  'create.task',
  'request.review',
  'notify.user'
]

export const TRIGGER_EVENT_LABELS: Record<TriggerEventType, string> = {
  'agent.task.completed': 'Agent completes a task',
  'agent.task.started': 'Agent starts a task',
  'agent.error': 'Agent fails',
  'agent.idle': 'Agent becomes idle',
  'file.changed': 'A file changes',
  'file.created': 'A file is created',
  'file.deleted': 'A file is deleted',
  'git.changed': 'Git state changes',
  'task.created': 'A task is created',
  'task.completed': 'A task completes',
  'agent.message.received': 'Agent receives a message',
  'schedule.daily': 'Every day at a time',
  'schedule.weekly': 'Every week on chosen days',
  'schedule.interval': 'On a repeating interval',
  manual: 'Only when I run it'
}

export const TRIGGER_ACTION_LABELS: Record<TriggerActionType, string> = {
  'send.message': 'Send a message to an agent',
  'create.task': 'Create a task for an agent',
  'request.review': 'Ask an agent to review the work',
  'notify.user': 'Notify me'
}

let triggers: Trigger[] | null = null

/**
 * Which agents this automation runs on.
 *
 * `agentIds` is the real field and `targetAgentId` is its head, kept because
 * every automation written before teams existed has one and nothing should
 * have to be migrated by hand. Deriving one from the other here — rather than
 * letting both be written independently — is what stops them disagreeing about
 * who an automation is for.
 */
function resolveAgents(t: Record<string, unknown>): string[] {
  const list = Array.isArray(t.agentIds)
    ? t.agentIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  if (list.length > 0) return [...new Set(list)]
  const single = typeof t.targetAgentId === 'string' && t.targetAgentId ? t.targetAgentId : null
  return single ? [single] : []
}

function normalise(raw: unknown): Trigger | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const event = EVENTS.includes(t.event as TriggerEventType)
    ? (t.event as TriggerEventType)
    : null
  const action = ACTIONS.includes(t.action as TriggerActionType)
    ? (t.action as TriggerActionType)
    : null
  if (!event || !action) return null

  const settings = getSettings()
  const id = typeof t.id === 'string' && t.id ? t.id : makeId('trg')
  const agentIds = resolveAgents(t)
  const schedule = isScheduleEvent(event) ? normaliseSchedule(t.schedule) : null
  const lastRunAt = Number.isFinite(t.lastRunAt) ? Number(t.lastRunAt) : null

  return {
    id,
    // Never inferred from the open project, for the same reason an agent's is
    // not: an unstamped record predates projects and must not be adopted by
    // whichever one happens to be open.
    projectId: typeof t.projectId === 'string' ? t.projectId : '',
    name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : 'Automation',
    enabled: t.enabled !== false,
    event,
    sourceAgentId:
      typeof t.sourceAgentId === 'string' && t.sourceAgentId ? t.sourceAgentId : null,
    condition:
      typeof t.condition === 'string' && t.condition.trim()
        ? t.condition.trim()
        : null,
    action,
    targetAgentId: agentIds[0] ?? null,
    agentIds,
    message: typeof t.message === 'string' ? t.message : '',
    schedule,
    permissionMode: t.permissionMode === 'strict' ? 'strict' : 'inherit',
    maxChainDepth: Number.isFinite(t.maxChainDepth)
      ? Math.min(10, Math.max(1, Number(t.maxChainDepth)))
      : settings.maxChainDepth,
    cooldownMs: Number.isFinite(t.cooldownMs)
      ? Math.min(3_600_000, Math.max(0, Number(t.cooldownMs)))
      : settings.defaultCooldownMs,
    lastFiredAt: Number.isFinite(t.lastFiredAt) ? Number(t.lastFiredAt) : null,
    fireCount: Number.isFinite(t.fireCount) ? Number(t.fireCount) : 0,
    lastRunAt,
    /*
     * Recomputed on load rather than trusted from the file. A stored
     * `nextRunAt` in the past — the app was closed for a week — must not
     * produce a burst of catch-up runs, and `nextRunAt` already collapses a
     * missed backlog into a single upcoming run.
     */
    nextRunAt: isScheduleEvent(event)
      ? nextRunAt(event, schedule, Date.now(), lastRunAt)
      : null,
    createdAt: Number.isFinite(t.createdAt) ? Number(t.createdAt) : Date.now(),
    updatedAt: Number.isFinite(t.updatedAt) ? Number(t.updatedAt) : Date.now()
  }
}

function load(): Trigger[] {
  if (triggers) return triggers
  const raw = readJson<unknown[]>(FILE, [])
  triggers = (Array.isArray(raw) ? raw : [])
    .map(normalise)
    .filter((t): t is Trigger => t !== null)
  return triggers
}

function persist(): void {
  writeJson(FILE, triggers ?? [])
}

/** The open project's automations. Same scoping rule as the agent roster. */
function scoped(): Trigger[] {
  const projectId = getActiveProjectId()
  if (!projectId) return []
  return load().filter((t) => t.projectId === projectId)
}

export function listTriggers(): Trigger[] {
  return scoped()
}

/**
 * Every project's scheduled automations.
 *
 * The scheduler needs this and nothing else does. It is deliberately separate
 * from `listTriggers` and never reachable over IPC: crossing the project
 * boundary is the whole risk in a scheduler, so the one function that does it
 * is named for it, and the scheduler still refuses to *run* anything outside
 * the open project.
 */
export function listAllScheduled(): Trigger[] {
  return load().filter((t) => t.enabled && isScheduleEvent(t.event))
}

export function getTrigger(id: string): Trigger | undefined {
  return scoped().find((t) => t.id === id)
}

export function upsertTrigger(input: Partial<Trigger>): Trigger {
  const list = load()
  const existing = input.id ? scoped().find((t) => t.id === input.id) : undefined

  if (existing) {
    const merged = normalise({ ...existing, ...input, id: existing.id })
    if (merged) {
      merged.createdAt = existing.createdAt
      merged.projectId = existing.projectId
      merged.updatedAt = Date.now()
      // Editing an automation must not clear the cooldown it is serving, or
      // reset the history of what it has already done.
      merged.lastFiredAt = existing.lastFiredAt
      merged.fireCount = existing.fireCount
      merged.lastRunAt = existing.lastRunAt
      merged.nextRunAt = isScheduleEvent(merged.event)
        ? nextRunAt(merged.event, merged.schedule, Date.now(), merged.lastRunAt)
        : null
      Object.assign(existing, merged)
      persist()
    }
    return existing
  }

  const projectId = getActiveProjectId()
  if (!projectId) throw new Error('No project is open.')

  const created = normalise({
    ...input,
    projectId,
    id: makeId('trg'),
    createdAt: Date.now()
  })
  if (!created) throw new Error('An automation needs a valid trigger and action.')
  list.push(created)
  persist()
  return created
}

export function deleteTrigger(id: string): void {
  const target = scoped().find((t) => t.id === id)
  if (!target) return
  const list = load()
  list.splice(list.indexOf(target), 1)
  persist()
  // The group it ran on outlives it; the claim on the group's name does not.
  detachAutomation(id)
  removeTriggerRuns(id)
}

/**
 * Drop every automation belonging to a project.
 *
 * Same reason the agent and case stores have one: `deleteTrigger` resolves
 * against the open project, and a project is deleted with nothing open.
 */
export function removeProjectTriggers(projectId: string): number {
  if (!projectId) return 0
  const list = load()
  const kept = list.filter((t) => t.projectId !== projectId)
  if (kept.length === list.length) return 0

  const removed = list.length - kept.length
  triggers = kept
  persist()
  return removed
}

/**
 * Remove automations pointing at an agent that no longer exists.
 *
 * Swept across every project rather than only the open one. Agent ids are
 * unique app-wide and a deletion is permanent, so leaving a stale reference in
 * a project that happens to be closed would only defer the same broken
 * automation to whenever that project is next opened.
 *
 * An automation that runs on a team loses only the departed member; one that
 * has nobody left is removed, because an automation with no agent can never do
 * anything again.
 */
export function forgetAgent(agentId: string): void {
  const list = load()
  const kept: Trigger[] = []
  let changed = false

  for (const trigger of list) {
    if (trigger.sourceAgentId === agentId) {
      changed = true
      continue
    }
    if (!trigger.agentIds.includes(agentId)) {
      kept.push(trigger)
      continue
    }
    const remaining = trigger.agentIds.filter((id) => id !== agentId)
    changed = true
    if (remaining.length === 0 && trigger.action !== 'notify.user') continue
    trigger.agentIds = remaining
    trigger.targetAgentId = remaining[0] ?? null
    kept.push(trigger)
  }

  if (changed) {
    triggers = kept
    persist()
  }
}

/** Record a firing, so the cooldown is real and survives a restart. */
export function markFired(id: string, at = Date.now()): void {
  const trigger = getTrigger(id)
  if (!trigger) return
  trigger.lastFiredAt = at
  trigger.fireCount += 1
  persist()
}

/**
 * Record a run, and work out when the next one is due.
 *
 * Separate from `markFired` because they answer different questions: firing is
 * about the cooldown, running is about the schedule. A manual "Run now" on a
 * daily automation should not move tomorrow morning's run, so the caller
 * decides whether the schedule advances.
 */
export function markRun(id: string, advanceSchedule: boolean, at = Date.now()): void {
  const trigger = getTrigger(id)
  if (!trigger) return
  trigger.lastRunAt = at
  trigger.lastFiredAt = at
  trigger.fireCount += 1
  if (advanceSchedule && isScheduleEvent(trigger.event)) {
    trigger.nextRunAt = nextRunAt(trigger.event, trigger.schedule, at, at)
  }
  trigger.updatedAt = at
  persist()
}
