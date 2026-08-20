import type { Trigger, TriggerActionType, TriggerEventType } from './agent.types'
import { makeId, readJson, writeJson } from './persist'
import { getSettings } from './settingsStore'
import { getActiveProjectId } from '../projects/projectStore'

/**
 * Automations, persisted.
 *
 * A trigger is WHEN / IF / THEN, and it carries its own chain depth and
 * cooldown rather than borrowing the global ones. The global settings are
 * a ceiling, not a substitute: whichever of the two is stricter applies, so
 * lowering the global maximum immediately tightens every trigger without
 * having to rewrite any of them.
 *
 * `lastFiredAt` is persisted deliberately. A cooldown that resets when the app
 * restarts is a cooldown that can be defeated by restarting.
 */

const FILE = 'triggers.json'

const EVENTS: TriggerEventType[] = [
  'agent.task.completed',
  'agent.task.started',
  'agent.error',
  'file.changed',
  'git.changed',
  'task.created',
  'task.completed',
  'agent.message.received'
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
  'agent.error': 'Agent errors',
  'file.changed': 'A file changes',
  'git.changed': 'Git state changes',
  'task.created': 'A task is created',
  'task.completed': 'A task completes',
  'agent.message.received': 'Agent receives a message'
}

export const TRIGGER_ACTION_LABELS: Record<TriggerActionType, string> = {
  'send.message': 'Send a message to an agent',
  'create.task': 'Create a task for an agent',
  'request.review': 'Ask an agent to review the work',
  'notify.user': 'Notify me'
}

let triggers: Trigger[] | null = null

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
    targetAgentId:
      typeof t.targetAgentId === 'string' && t.targetAgentId ? t.targetAgentId : null,
    message: typeof t.message === 'string' ? t.message : '',
    maxChainDepth: Number.isFinite(t.maxChainDepth)
      ? Math.min(10, Math.max(1, Number(t.maxChainDepth)))
      : settings.maxChainDepth,
    cooldownMs: Number.isFinite(t.cooldownMs)
      ? Math.min(3_600_000, Math.max(0, Number(t.cooldownMs)))
      : settings.defaultCooldownMs,
    lastFiredAt: Number.isFinite(t.lastFiredAt) ? Number(t.lastFiredAt) : null,
    fireCount: Number.isFinite(t.fireCount) ? Number(t.fireCount) : 0,
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
      // Editing a trigger must not clear the cooldown it is currently serving.
      merged.lastFiredAt = existing.lastFiredAt
      merged.fireCount = existing.fireCount
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
  if (!created) throw new Error('A trigger needs a valid event and action.')
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
}

/**
 * Remove triggers pointing at an agent that no longer exists.
 *
 * Swept across every project rather than only the open one. Agent ids are
 * unique app-wide and a deletion is permanent, so leaving a stale reference in
 * a project that happens to be closed would only defer the same broken trigger
 * to whenever that project is next opened.
 */
export function forgetAgent(agentId: string): void {
  const list = load()
  const kept = list.filter(
    (t) => t.sourceAgentId !== agentId && t.targetAgentId !== agentId
  )
  if (kept.length !== list.length) {
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
