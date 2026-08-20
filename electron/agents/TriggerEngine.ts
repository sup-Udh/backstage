import type { RuntimeEvent, Trigger, TriggerEventType } from './agent.types'
import { getAgent } from './agentStore'
import { systemBus } from './EventBus'
import { listTriggers, markFired } from './triggerStore'
import { getSettings } from './settingsStore'
import { orchestrator, recordTriggerMessage, wasRejected } from './AgentOrchestrator'
import { conversationStore } from './conversationStore'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import { makeId } from './persist'

/**
 * The trigger engine: WHEN / IF / THEN.
 *
 * It listens to the one event bus and nothing else, which is what makes it
 * possible to add a trigger type without touching the runtime.
 *
 * Four independent protections stop a chain running away, and they are checked
 * in cost order — the free ones first, so a blocked chain never reaches the
 * expensive check:
 *
 *   1. AUTO off             nothing automatic runs at all
 *   2. cooldown             a trigger cannot re-fire immediately
 *   3. chain depth          Jane -> Michael -> Pam stops at the limit
 *   4. duplicate detection  the same message twice in a chain is refused
 *
 * The orchestrator then applies its own chain-size and duplicate checks when
 * the task is submitted. That duplication is deliberate: this layer refuses
 * early so nothing is spent, and that layer refuses last so nothing gets past.
 */

/** Which bus events can satisfy which trigger event. */
const MATCHES: Record<TriggerEventType, RuntimeEvent['type'][]> = {
  'agent.task.completed': ['task.completed'],
  'agent.task.started': ['task.started'],
  'agent.error': ['task.failed'],
  'file.changed': ['file.created', 'file.modified', 'file.deleted'],
  'git.changed': ['git.changed'],
  'task.created': ['task.created'],
  'task.completed': ['task.completed'],
  'agent.message.received': ['agent.message.received']
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
      // A broken trigger must never take the runtime down with it.
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

  const triggers = listTriggers().filter((t) => t.enabled)
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

    fire(trigger, event)
  }
}

/** The IF. A trigger with no condition always matches. */
function conditionMet(trigger: Trigger, event: RuntimeEvent): boolean {
  if (!trigger.condition) return true
  const haystack = [event.task, event.message, event.activity, event.path, event.reason]
    .filter((x): x is string => typeof x === 'string')
    .join(' ')
    .toLowerCase()
  return haystack.includes(trigger.condition.toLowerCase())
}

/** Why this firing must not happen, or null if it may. */
function blockedReason(
  trigger: Trigger,
  event: RuntimeEvent,
  globalMaxDepth: number
): string | null {
  if (trigger.action !== 'notify.user') {
    if (!trigger.targetAgentId) return 'no target agent is set'
    const target = getAgent(trigger.targetAgentId)
    if (!target) return 'the target agent no longer exists'
    if (!target.enabled) return `${target.name} is disabled`
    if (!target.spawned) return `${target.name} is not spawned`

    // An automation must not be a way around the relationship graph the user
    // configured. If the source may not talk to the target, neither may a
    // trigger acting on the source's behalf.
    if (trigger.sourceAgentId) {
      const source = getAgent(trigger.sourceAgentId)
      if (source && !source.canTalkTo.includes(target.id)) {
        return `${source.name} is not permitted to contact ${target.name}`
      }
    }
  }

  const sinceLast = trigger.lastFiredAt ? Date.now() - trigger.lastFiredAt : Infinity
  if (sinceLast < trigger.cooldownMs) {
    const left = Math.ceil((trigger.cooldownMs - sinceLast) / 1000)
    return `cooling down for another ${left}s`
  }

  // Whichever of the two limits is stricter wins, so tightening the global
  // maximum immediately tightens every trigger.
  const cap = Math.min(trigger.maxChainDepth, globalMaxDepth)
  const nextDepth = (event.depth ?? 0) + 1
  if (nextDepth > cap) return `chain depth limit reached (${cap})`

  return null
}

function fire(trigger: Trigger, event: RuntimeEvent): void {
  const sourceAgent = event.agentId ? getAgent(event.agentId) : undefined
  const targetAgent = trigger.targetAgentId ? getAgent(trigger.targetAgentId) : undefined
  const correlationId = event.correlationId ?? makeId('chain')
  const depth = (event.depth ?? 0) + 1

  if (trigger.action === 'notify.user') {
    markFired(trigger.id)
    systemBus.emit({
      type: 'trigger.fired',
      triggerId: trigger.id,
      triggerName: trigger.name,
      agentId: event.agentId,
      agentName: event.agentName,
      correlationId,
      depth,
      message: trigger.message || `${trigger.name} fired.`,
      activity: `Automation "${trigger.name}" fired.`
    })
    return
  }

  if (!targetAgent) return

  const prompt = composePrompt(trigger, event, sourceAgent?.name)

  // Deduplicate before anything is spent. An identical message to the same
  // agent in the same chain is the ping-pong case the depth counter misses.
  const recorded = recordTriggerMessage({
    senderAgentId: sourceAgent?.id ?? 'system',
    senderName: sourceAgent?.name ?? 'Backstage',
    receiverAgentId: targetAgent.id,
    receiverName: targetAgent.name,
    message: prompt,
    reason: `Automation: ${trigger.name}`,
    taskId: event.taskId ?? null,
    correlationId,
    depth
  })

  if (!recorded) {
    systemBus.emit({
      type: 'trigger.blocked',
      triggerId: trigger.id,
      triggerName: trigger.name,
      agentId: event.agentId,
      targetAgentId: targetAgent.id,
      correlationId,
      depth,
      reason: 'duplicate message in this chain',
      activity: `Automation "${trigger.name}" did not run: duplicate message in this chain`
    })
    return
  }

  markFired(trigger.id)

  systemBus.emit({
    type: 'trigger.fired',
    triggerId: trigger.id,
    triggerName: trigger.name,
    agentId: sourceAgent?.id,
    agentName: sourceAgent?.name,
    targetAgentId: targetAgent.id,
    targetAgentName: targetAgent.name,
    taskId: event.taskId,
    correlationId,
    depth,
    message: prompt,
    activity: `Automation "${trigger.name}": ${targetAgent.name} was asked to help.`
  })

  const workspaceId = getWorkspaceRoot() ?? 'no-workspace'

  if (trigger.action === 'send.message') {
    /*
     * A message is context, not work. It lands in the target's memory for
     * their next turn and starts nothing — which is the whole difference
     * between an automation that informs and one that spends.
     */
    conversationStore.append(workspaceId, targetAgent.id, {
      id: makeId('msg'),
      kind: 'collaboration',
      agentId: targetAgent.id,
      fromAgentId: sourceAgent?.id,
      fromName: sourceAgent?.name ?? 'Backstage',
      text: prompt,
      at: Date.now()
    })
    systemBus.emit({
      type: 'agent.message.received',
      agentId: targetAgent.id,
      agentName: targetAgent.name,
      targetAgentId: sourceAgent?.id,
      targetAgentName: sourceAgent?.name,
      correlationId,
      depth,
      message: prompt,
      activity: `received a note from ${sourceAgent?.name ?? 'Backstage'}.`
    })
    return
  }

  // create.task and request.review both become real work on the target's own
  // queue, at one greater depth so the chain remains countable.
  const result = orchestrator.submit({
    agentId: targetAgent.id,
    prompt,
    origin: 'trigger',
    originAgentId: sourceAgent?.id ?? null,
    correlationId,
    depth,
    parentTaskId: event.taskId ?? null
  })

  if (wasRejected(result)) {
    systemBus.emit({
      type: 'trigger.blocked',
      triggerId: trigger.id,
      triggerName: trigger.name,
      agentId: sourceAgent?.id,
      targetAgentId: targetAgent.id,
      correlationId,
      depth,
      reason: result.error,
      activity: `Automation "${trigger.name}" did not run: ${result.error}`
    })
    return
  }

  conversationStore.append(workspaceId, targetAgent.id, {
    id: makeId('msg'),
    kind: 'collaboration',
    agentId: targetAgent.id,
    fromAgentId: sourceAgent?.id,
    fromName: sourceAgent?.name ?? 'Backstage',
    text: prompt,
    at: Date.now(),
    taskId: result.id
  })
}

/**
 * What the target agent is actually asked.
 *
 * The trigger's own message is the instruction; the originating work is
 * attached as context. Without that context a review request is meaningless —
 * "review the work" tells the reviewer nothing about which work.
 */
function composePrompt(
  trigger: Trigger,
  event: RuntimeEvent,
  sourceName: string | undefined
): string {
  const instruction =
    trigger.message.trim() ||
    (trigger.action === 'request.review'
      ? 'Review the work described below and report any problems you find.'
      : 'Continue from the work described below.')

  const context: string[] = []
  if (sourceName) context.push(`From: ${sourceName}`)
  if (event.task) context.push(`Task: ${event.task}`)
  if (event.path) context.push(`File: ${event.path}`)
  if (event.reason) context.push(`Error: ${event.reason}`)
  if (event.message) {
    const trimmed = event.message.trim()
    context.push(`What they reported:\n${trimmed.slice(0, 2_000)}`)
  }

  return context.length > 0 ? `${instruction}\n\n${context.join('\n')}` : instruction
}
