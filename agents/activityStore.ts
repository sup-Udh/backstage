import type { ActivityEvent, ActivityType, AgentActivity } from '../src/shared/activity'
import {
  ACTIVITY_LABEL,
  isBusyActivity,
  statusForActivity
} from '../src/shared/activity'
import { getAgent } from './agentStore'
import { agentRegistry } from './AgentRegistry'
import { systemBus } from './EventBus'
import { makeId } from './persist'
import { getActiveProjectId } from '../projects/projectStore'

/**
 * What every agent is doing right now, and what they have just done.
 *
 * The single writer. Everything that knows an agent has started doing
 * something — the executor between tool calls, the orchestrator on a
 * hand-off, the approval layer when a prompt goes up, the Claude session
 * reader — comes through `report` and nowhere else. That is what keeps the
 * pixel world, the chat header, the group chat and the timeline from ever
 * disagreeing: there is one fact and four views of it, rather than four
 * derivations of four events.
 *
 * Two things are held:
 *
 *   the current activity per agent, which is live state and is never
 *   persisted, because "currently reading package.json" is false the moment
 *   the app closes;
 *
 *   a bounded timeline, which is the record the activity panel shows.
 *
 * The timeline is deliberately *not* every report. An agent reading eleven
 * files in a row is one line of work and eleven runtime events, and a feed
 * that prints all eleven is a log rather than a story. A new entry is written
 * when the activity meaningfully changes; a repeat of the same activity only
 * moves the current state.
 */

/** Enough for the panel to show a task's worth of work. */
const TIMELINE_LIMIT = 120

/**
 * How long a finished agent keeps its last badge before going quiet.
 *
 * §21: COMPLETE has to be *visible* and then has to go away. Without a hold
 * the tick that writes it is the same tick that ends the execution, so the
 * user sees a character stop rather than a character finish. An error holds
 * longer because it is the one somebody may be walking back to the screen to
 * read.
 */
const TERMINAL_HOLD_MS: Record<string, number> = {
  completed: 2_600,
  stopped: 2_600,
  error: 6_000
}

const current = new Map<string, AgentActivity>()
const timeline: ActivityEvent[] = []

/** Pending clears for terminal activities, so a new task cancels the old one. */
const holds = new Map<string, NodeJS.Timeout>()

function cancelHold(agentId: string): void {
  const timer = holds.get(agentId)
  if (timer) {
    clearTimeout(timer)
    holds.delete(agentId)
  }
}

/**
 * Drop a terminal activity once it has been on screen long enough.
 *
 * Guarded on identity rather than on time alone: if the agent has started
 * something else in the meantime, the timer belongs to work that is over and
 * must not wipe the badge of work that is not.
 */
function holdThenClear(agentId: string, activity: AgentActivity): void {
  const ms = TERMINAL_HOLD_MS[activity.type]
  if (ms === undefined) return

  cancelHold(agentId)
  const timer = setTimeout(() => {
    holds.delete(agentId)
    if (current.get(agentId) === activity) clearActivity(agentId)
  }, ms)
  timer.unref?.()
  holds.set(agentId, timer)
}

/* -------------------------------------------------------------- reporting -- */

/** Everything a caller can say about an activity. The rest is derived. */
export interface ActivityReport {
  type: ActivityType
  /** Overrides the vocabulary's default label. */
  label?: string
  detail?: string | null
  detailFull?: string | null
  toolName?: string | null
  targetAgentId?: string | null
  targetAgentName?: string | null
  filePath?: string | null
  command?: string | null
  progress?: { done: number; total: number } | null
}

/**
 * Whether two activities are the same piece of work.
 *
 * Used to decide whether the timeline gets a new line. Type *and* detail,
 * because reading two different files is two things worth seeing and reading
 * the same file twice in a row is one.
 */
function sameWork(a: AgentActivity | undefined, b: AgentActivity): boolean {
  if (!a) return false
  return a.type === b.type && a.detailFull === b.detailFull
}

/**
 * Report what an agent is doing.
 *
 * Returns the activity it stored, so a caller that wants to put the same
 * words somewhere else — a status line, a log — uses the ones the interface
 * will show rather than composing its own.
 */
export function report(agentId: string, input: ActivityReport): AgentActivity {
  const projectId = getActiveProjectId()

  const activity: AgentActivity = {
    agentId,
    projectId,
    type: input.type,
    label: input.label ?? ACTIVITY_LABEL[input.type],
    detail: input.detail ?? null,
    detailFull: input.detailFull ?? input.detail ?? null,
    startedAt: Date.now(),
    status: statusForActivity(input.type),
    toolName: input.toolName ?? null,
    targetAgentId: input.targetAgentId ?? null,
    targetAgentName: input.targetAgentName ?? null,
    filePath: input.filePath ?? null,
    command: input.command ?? null,
    progress: input.progress ?? null
  }

  const previous = current.get(agentId)
  /*
   * A repeat keeps its original start time. An agent that reports "running
   * npm test" every second while the command runs is doing one thing that
   * started once, and resetting the clock would leave the elapsed time in the
   * activity card stuck at zero.
   */
  if (sameWork(previous, activity)) activity.startedAt = previous!.startedAt

  current.set(agentId, activity)
  cancelHold(agentId)
  holdThenClear(agentId, activity)

  /*
   * The registry is where every other surface already reads live state from,
   * so the activity is written there too rather than published on a channel
   * of its own. Anything that renders an `AgentRuntimeState` — the world, the
   * roster, the group summaries — gets this for free and cannot fall behind
   * it.
   */
  agentRegistry.setActivity(agentId, activity)

  if (!sameWork(previous, activity)) {
    const name = getAgent(agentId)?.name ?? agentId
    const entry: ActivityEvent = {
      id: makeId('act'),
      agentId,
      agentName: name,
      projectId,
      type: activity.type,
      label: activity.label,
      detail: activity.detail,
      detailFull: activity.detailFull,
      at: activity.startedAt,
      toolName: activity.toolName,
      targetAgentName: activity.targetAgentName
    }
    timeline.push(entry)
    if (timeline.length > TIMELINE_LIMIT) {
      timeline.splice(0, timeline.length - TIMELINE_LIMIT)
    }

    systemBus.emit({
      type: 'agent.activity',
      agentId,
      agentName: name,
      targetAgentId: activity.targetAgentId ?? undefined,
      targetAgentName: activity.targetAgentName ?? undefined,
      tool: activity.toolName ?? undefined,
      activity: `${activity.label.toLowerCase()}${activity.detail ? ` ${activity.detail}` : ''}`,
      agentActivity: activity
    })
  }

  return activity
}

/**
 * Report an activity for something that is not a configured agent.
 *
 * External CLI sessions have no roster entry, so `getAgent` cannot name them.
 * They supply their own name and are otherwise identical — the whole point of
 * the normalised model is that a Claude session and an OpenAI agent produce
 * the same activity through the same door.
 */
export function reportExternal(
  agentId: string,
  name: string,
  input: ActivityReport
): AgentActivity {
  const projectId = getActiveProjectId()
  const activity: AgentActivity = {
    agentId,
    projectId,
    type: input.type,
    label: input.label ?? ACTIVITY_LABEL[input.type],
    detail: input.detail ?? null,
    detailFull: input.detailFull ?? input.detail ?? null,
    startedAt: Date.now(),
    status: statusForActivity(input.type),
    toolName: input.toolName ?? null,
    targetAgentId: input.targetAgentId ?? null,
    targetAgentName: input.targetAgentName ?? null,
    filePath: input.filePath ?? null,
    command: input.command ?? null,
    progress: input.progress ?? null
  }

  const previous = current.get(agentId)
  if (sameWork(previous, activity)) activity.startedAt = previous!.startedAt
  current.set(agentId, activity)
  cancelHold(agentId)
  holdThenClear(agentId, activity)

  if (!sameWork(previous, activity)) {
    const entry: ActivityEvent = {
      id: makeId('act'),
      agentId,
      agentName: name,
      projectId,
      type: activity.type,
      label: activity.label,
      detail: activity.detail,
      detailFull: activity.detailFull,
      at: activity.startedAt,
      toolName: activity.toolName,
      targetAgentName: activity.targetAgentName
    }
    timeline.push(entry)
    if (timeline.length > TIMELINE_LIMIT) {
      timeline.splice(0, timeline.length - TIMELINE_LIMIT)
    }
    systemBus.emit({
      type: 'agent.activity',
      agentId,
      agentName: name,
      activity: `${activity.label.toLowerCase()}${activity.detail ? ` ${activity.detail}` : ''}`,
      agentActivity: activity
    })
  }

  return activity
}

/**
 * The agent has stopped doing whatever it was doing.
 *
 * Not the same as reporting `idle`: this removes the activity entirely, which
 * is what the world needs to drop a badge. Reporting idle would leave an
 * "IDLE" activity sitting on the character, which is the clutter §7 asks to
 * avoid.
 */
export function clearActivity(agentId: string): void {
  cancelHold(agentId)
  if (!current.has(agentId)) return
  current.delete(agentId)
  /*
   * Only for something the roster knows about. A CLI session has no registry
   * entry, and asking for one would mint a blank state for an id the roster
   * cannot resolve — a ghost agent, created by the code meant to prevent them.
   * A session's activity travels on its own `AgentSession` record instead.
   */
  if (getAgent(agentId)) agentRegistry.setActivity(agentId, null)
  systemBus.emit({
    type: 'agent.activity',
    agentId,
    agentName: getAgent(agentId)?.name,
    activity: 'went idle.'
  })
}

/* ---------------------------------------------------------------- reading -- */

export function activityFor(agentId: string): AgentActivity | null {
  return current.get(agentId) ?? null
}

/**
 * Every current activity in the open project.
 *
 * Filtered on the activity's own `projectId` rather than on the roster, so a
 * CLI session — which has no roster entry — is scoped by the same rule as
 * everything else.
 */
export function listActivities(): AgentActivity[] {
  const projectId = getActiveProjectId()
  if (!projectId) return []
  return [...current.values()].filter((a) => a.projectId === projectId)
}

/** The timeline for the open project, newest last. */
export function activityTimeline(limit = 40, agentId?: string): ActivityEvent[] {
  const projectId = getActiveProjectId()
  if (!projectId) return []
  return timeline
    .filter((e) => e.projectId === projectId && (!agentId || e.agentId === agentId))
    .slice(-limit)
}

/** How long the current activity has been running, in ms. */
export function elapsedFor(agentId: string): number | null {
  const activity = current.get(agentId)
  return activity ? Date.now() - activity.startedAt : null
}

/** Whether anything in this project is actively doing something. */
export function anyBusy(): boolean {
  return listActivities().some((a) => isBusyActivity(a.type))
}

/* --------------------------------------------------------------- clean-up -- */

/**
 * Forget everything belonging to one agent.
 *
 * Called when an agent is deleted, despawned, or its CLI session ends. A
 * character that has left the office must not leave a badge behind it, and an
 * activity keyed to an id nothing resolves is exactly the ghost §43 is about.
 */
export function forgetAgent(agentId: string): void {
  cancelHold(agentId)
  current.delete(agentId)
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].agentId === agentId) timeline.splice(i, 1)
  }
}

/**
 * Drop everything for a project.
 *
 * Called on project switch and on project delete. Both matter: switching must
 * not carry Project A's live activity into Project B's office, and deleting
 * must not leave a timeline referring to agents that no longer exist.
 */
export function removeProjectActivity(projectId: string): void {
  if (!projectId) return
  for (const [agentId, activity] of [...current.entries()]) {
    if (activity.projectId !== projectId) continue
    cancelHold(agentId)
    current.delete(agentId)
  }
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].projectId === projectId) timeline.splice(i, 1)
  }
}

/** Everything, for sign-out. */
export function clearAllActivity(): void {
  for (const agentId of [...holds.keys()]) cancelHold(agentId)
  current.clear()
  timeline.length = 0
}
