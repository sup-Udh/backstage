import type { RuntimeEvent, Trigger, TriggerEventType } from './agent.types'
import { systemBus } from './EventBus'
import { listTriggers } from './triggerStore'
import { getSettings } from './settingsStore'
import { runAutomation } from './automationRunner'
import { isScheduleEvent } from './schedule'

/**
 * The event half of the automation system: WHEN / IF / WHO / THEN.
 *
 * It listens to the one event bus and nothing else, which is what makes it
 * possible to add a trigger type without touching the runtime. The other two
 * ways an automation can start — the scheduler and Run now — do not come
 * through here at all, but all three end at `runAutomation`, so the project
 * check, the permission mode, the run record and the group conversation are
 * the same whichever door was used.
 *
 * Four independent protections stop a chain running away, and they are checked
 * in cost order — the free ones first, so a blocked chain never reaches the
 * expensive check:
 *
 *   1. AUTO off             nothing automatic runs at all
 *   2. cooldown             an automation cannot re-fire immediately
 *   3. chain depth          Jane -> Michael -> Pam stops at the limit
 *   4. duplicate detection  the same message twice in a chain is refused
 *
 * The orchestrator then applies its own chain-size and duplicate checks when
 * the task is submitted. That duplication is deliberate: this layer refuses
 * early so nothing is spent, and that layer refuses last so nothing gets past.
 */

/** Which bus events can satisfy which trigger event. */
const MATCHES: Partial<Record<TriggerEventType, RuntimeEvent['type'][]>> = {
  'agent.task.completed': ['task.completed'],
  'agent.task.started': ['task.started'],
  'agent.error': ['task.failed'],
  'agent.idle': ['agent.idle'],
  'file.changed': ['file.created', 'file.modified', 'file.deleted'],
  'file.created': ['file.created'],
  'file.deleted': ['file.deleted'],
  'git.changed': ['git.changed'],
  'task.created': ['task.created'],
  'task.completed': ['task.completed'],
  'agent.message.received': ['agent.message.received']
  /*
   * `schedule.*` and `manual` are absent on purpose. Nothing emits them, and
   * listing them here with an empty array would suggest they might arrive one
   * day. They are started by the scheduler and by the user respectively.
   */
}

let unsubscribe: (() => void) | null = null

export function initTriggerEngine(): void {
  unsubscribe?.()
  unsubscribe = systemBus.on((event) => {
    // The engine's own output must not be treated as a fresh stimulus in the
    // same tick; depth is what separates a reaction from an echo.
    try {
      handle(event)
    } catch {
      // A broken automation must never take the runtime down with it.
    }
  })
}

export function disposeTriggerEngine(): void {
  unsubscribe?.()
  unsubscribe = null
}

function handle(event: RuntimeEvent): void {
  const settings = getSettings()

  // AUTO is the master switch. With it off, nothing here ever dispatches —
  // agents act only when the user or another agent explicitly asks them to.
  if (!settings.autoCollaboration) return

  /*
   * An automation's own work must not re-trigger it.
   *
   * Every task an automation starts completes, and `agent.task.completed` is
   * the most common trigger there is — so a "when an agent finishes, ask them
   * to review it" automation would answer its own review forever. The chain
   * depth eventually stops that, but only after several paid turns. Refusing
   * to react to a trigger's own output is free and immediate.
   */
  if (event.type === 'automation.started') return

  const triggers = listTriggers().filter(
    (t) => t.enabled && !isScheduleEvent(t.event) && t.event !== 'manual'
  )
  if (triggers.length === 0) return

  for (const trigger of triggers) {
    if (!MATCHES[trigger.event]?.includes(event.type)) continue
    if (trigger.sourceAgentId && trigger.sourceAgentId !== event.agentId) continue
    if (!conditionMet(trigger, event)) continue

    const blocked = blockedReason(trigger, event, settings.maxChainDepth)
    if (blocked) {
      systemBus.emit({
        type: 'trigger.blocked',
        triggerId: trigger.id,
        triggerName: trigger.name,
        agentId: event.agentId,
        targetAgentId: trigger.targetAgentId ?? undefined,
        correlationId: event.correlationId,
        depth: event.depth,
        reason: blocked,
        activity: `Automation "${trigger.name}" did not run: ${blocked}`
      })
      continue
    }

    runAutomation(trigger, { origin: 'event', event })
  }
}

/** The IF. An automation with no condition always matches. */
function conditionMet(trigger: Trigger, event: RuntimeEvent): boolean {
  if (!trigger.condition) return true
  const haystack = [event.task, event.message, event.activity, event.path, event.reason]
    .filter((x): x is string => typeof x === 'string')
    .join(' ')
    .toLowerCase()
  return haystack.includes(trigger.condition.toLowerCase())
}

/**
 * Why this firing must not happen, or null if it may.
 *
 * Only the checks that are cheap and specific to reacting to an event. Whether
 * the target agents exist, are spawned and may be contacted is `runAutomation`'s
 * job — it has to answer that for the scheduler and for Run now as well, and
 * asking it twice in two places is how the two answers drift apart.
 */
function blockedReason(
  trigger: Trigger,
  event: RuntimeEvent,
  globalMaxDepth: number
): string | null {
  const sinceLast = trigger.lastFiredAt ? Date.now() - trigger.lastFiredAt : Infinity
  if (sinceLast < trigger.cooldownMs) {
    const left = Math.ceil((trigger.cooldownMs - sinceLast) / 1000)
    return `cooling down for another ${left}s`
  }

  // Whichever of the two limits is stricter wins, so tightening the global
  // maximum immediately tightens every automation.
  const cap = Math.min(trigger.maxChainDepth, globalMaxDepth)
  const nextDepth = (event.depth ?? 0) + 1
  if (nextDepth > cap) return `chain depth limit reached (${cap})`

  return null
}
