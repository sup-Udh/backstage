import type {
  AgentConfig,
  AgentRuntimeState,
  AgentTask,
  ChatMessage
} from '../shared/providerApi'

/**
 * What actually happened when the user talked to the whole team.
 *
 * ALL AGENTS is not a broadcast any more — it goes to the project's team lead,
 * who splits it up, hands parts out and writes the final answer. The chat did
 * not know that. It merged every participant's messages into one time-ordered
 * list, so a request, three delegations, three sets of findings and a synthesis
 * arrived as one undifferentiated column of prose and the user was left to
 * reconstruct the chain of events by reading it.
 *
 * This rebuilds that chain from what the runtime recorded, so the interface
 * can show the shape of the work instead of its transcript.
 *
 * The backbone is the task ledger, not the messages. A delegated task carries
 * `parentTaskId` and a `depth` above zero, which is a structural fact the
 * orchestrator wrote down — where "who asked whom" inferred from chat lines is
 * a guess, and one that gets less reliable the more the team says to each
 * other. Everything here is derived from real runtime records; nothing is
 * simulated to make the picture look complete.
 */

/** Where a participant is in this run. Distinct from its lifecycle status. */
export type Phase = 'waiting' | 'working' | 'done' | 'failed' | 'stopped'

export interface Member {
  agentId: string
  name: string
  role: string
  /** "OpenAI · gpt-5-mini", already resolved. Empty when unknown. */
  model: string
  isLead: boolean
  phase: Phase
  /**
   * What the runtime says it is doing, in its own words: "Reading
   * package.json". Null when it is not mid-execution.
   */
  action: string | null
  /** The headline of the task it was given, if it was given one. */
  assignment: string | null
  /**
   * The lead is delegating rather than merely working.
   *
   * True only while its own task is running *and* it has already handed
   * something out — the one moment the word "delegating" is honest.
   */
  delegating: boolean
}

export interface Finding {
  taskId: string
  agentId: string
  name: string
  role: string
  assignment: string
  status: AgentTask['status']
  /** The worker's own answer, verbatim. Null if it did not finish. */
  result: string | null
  error: string | null
  at: number
}

export type TimelineKind =
  | 'received'
  | 'delegated'
  | 'started'
  | 'completed'
  | 'failed'
  | 'synthesising'
  | 'finished'

export interface TimelineEvent {
  id: string
  at: number
  kind: TimelineKind
  text: string
}

export interface TeamRun {
  correlationId: string
  /** The user's own words, from the root task. */
  request: string
  leadId: string | null
  leadName: string
  members: Member[]
  findings: Finding[]
  /** The lead's final answer, once it exists. */
  synthesis: ChatMessage | null
  /** True while anything in the run is still going. */
  running: boolean
  /** Set when the run produced no answer at all. */
  failed: boolean
  timeline: TimelineEvent[]
  startedAt: number
}

export interface RunInput {
  tasks: AgentTask[]
  agents: AgentConfig[]
  states: Record<string, AgentRuntimeState>
  messages: Record<string, ChatMessage[]>
  /** The project's configured team lead. Never inferred from a name or role. */
  leadId: string | null
  /** Display name for an agent, which is the character's, not the config's. */
  nameOf: (agentId: string) => string
  modelOf: (agentId: string) => string
}

/**
 * The most recent whole-team run, or null if there has not been one.
 *
 * "Most recent" is by the root task, and a run is identified by its
 * correlation id — the thing the orchestrator stamps on every task descended
 * from one request. That is what makes this robust to the team working on two
 * things at once: a second request opens a second chain, and the two never mix
 * however interleaved their messages are.
 */
export function latestTeamRun(input: RunInput): TeamRun | null {
  const { tasks, leadId } = input

  /*
   * A team run starts with a depth-0 task given to the lead by the user.
   * Anything else at depth 0 is an ordinary one-to-one request, and treating
   * those as team runs is what would put a private conversation into the team
   * view.
   */
  const roots = tasks
    .filter(
      (t) =>
        t.depth === 0 &&
        t.origin === 'user' &&
        t.part !== 'synthesis' &&
        (leadId === null || t.agentId === leadId)
    )
    .sort((a, b) => b.createdAt - a.createdAt)

  const root = roots[0]
  if (!root) return null

  const chain = tasks
    .filter((t) => t.correlationId === root.correlationId)
    .sort((a, b) => a.createdAt - b.createdAt)

  const delegated = chain.filter((t) => t.id !== root.id)

  /*
   * The synthesis is submitted as its own chain — deliberately, so it cannot
   * re-trigger the check that produced it — and is tied back by case rather
   * than by correlation id.
   */
  const synthesisTask = tasks
    .filter(
      (t) =>
        t.part === 'synthesis' &&
        t.createdAt >= root.createdAt &&
        (root.caseId === null || t.caseId === root.caseId)
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0]

  const synthesis = synthesisTask
    ? (input.messages[synthesisTask.agentId] ?? []).find(
        (m) => m.taskId === synthesisTask.id && m.kind === 'agent'
      ) ?? null
    : null

  const members = buildMembers(input, root, delegated, synthesisTask)
  const findings = buildFindings(input, delegated)

  const running =
    isLive(root.status) ||
    delegated.some((t) => isLive(t.status)) ||
    (synthesisTask ? isLive(synthesisTask.status) : false)

  return {
    correlationId: root.correlationId,
    request: root.prompt,
    leadId: root.agentId,
    leadName: input.nameOf(root.agentId),
    members,
    findings,
    synthesis,
    running,
    failed: !running && !synthesis && root.status !== 'completed',
    timeline: buildTimeline(input, root, delegated, synthesisTask),
    startedAt: root.createdAt
  }
}

function isLive(status: AgentTask['status']): boolean {
  return status === 'queued' || status === 'running'
}

function phaseOf(status: AgentTask['status']): Phase {
  switch (status) {
    case 'queued':
      return 'waiting'
    case 'running':
      return 'working'
    case 'completed':
      return 'done'
    case 'failed':
      return 'failed'
    default:
      return 'stopped'
  }
}

function buildMembers(
  input: RunInput,
  root: AgentTask,
  delegated: AgentTask[],
  synthesisTask: AgentTask | undefined
): Member[] {
  const { agents, states, nameOf, modelOf } = input

  /*
   * Only agents that actually took part. A roster of eight where three were
   * given work would otherwise show five people permanently "waiting" for
   * something nobody ever intends to give them.
   */
  const order: string[] = [root.agentId]
  for (const task of delegated) {
    if (!order.includes(task.agentId)) order.push(task.agentId)
  }

  return order.map((agentId) => {
    const config = agents.find((a) => a.id === agentId)
    const state = states[agentId]
    const isLead = agentId === root.agentId

    /*
     * The lead's phase spans both of its tasks: the original request and the
     * synthesis that closes the run. Reporting it as "done" in the gap between
     * them would show the team finished while its final answer was still
     * being written.
     */
    const own = isLead
      ? [root, ...(synthesisTask ? [synthesisTask] : [])]
      : delegated.filter((t) => t.agentId === agentId)

    const latest = own[own.length - 1]
    const live = own.find((t) => isLive(t.status))
    const phase: Phase = live
      ? phaseOf(live.status)
      : latest
        ? phaseOf(latest.status)
        : 'waiting'

    return {
      agentId,
      name: nameOf(agentId),
      role: config?.role ?? '',
      model: modelOf(agentId),
      isLead,
      phase,
      action: phase === 'working' ? (state?.action ?? null) : null,
      assignment: isLead ? null : (own[0]?.title ?? null),
      delegating: isLead && root.status === 'running' && delegated.length > 0
    }
  })
}

function buildFindings(input: RunInput, delegated: AgentTask[]): Finding[] {
  return delegated
    .filter((t) => !isLive(t.status))
    .map((t) => {
      const config = input.agents.find((a) => a.id === t.agentId)
      return {
        taskId: t.id,
        agentId: t.agentId,
        name: input.nameOf(t.agentId),
        role: config?.role ?? '',
        assignment: t.title,
        status: t.status,
        result: t.result,
        error: t.error,
        at: t.endedAt ?? t.createdAt
      }
    })
    .sort((a, b) => a.at - b.at)
}

/**
 * The run as a list of moments, newest last.
 *
 * Built from task timestamps rather than from a separate event log, so it can
 * never disagree with the cards above it — the two are the same records read
 * two ways. A task that has not started yet contributes nothing rather than a
 * predicted line.
 */
function buildTimeline(
  input: RunInput,
  root: AgentTask,
  delegated: AgentTask[],
  synthesisTask: AgentTask | undefined
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const name = (id: string) => input.nameOf(id)

  events.push({
    id: `${root.id}:received`,
    at: root.createdAt,
    kind: 'received',
    text: `${name(root.agentId)} received the request`
  })

  for (const task of delegated) {
    events.push({
      id: `${task.id}:delegated`,
      at: task.createdAt,
      kind: 'delegated',
      text: `${name(root.agentId)} delegated → ${name(task.agentId)}`
    })
    if (task.startedAt) {
      events.push({
        id: `${task.id}:started`,
        at: task.startedAt,
        kind: 'started',
        text: `${name(task.agentId)} started`
      })
    }
    if (task.endedAt) {
      const failed = task.status === 'failed' || task.status === 'cancelled'
      events.push({
        id: `${task.id}:ended`,
        at: task.endedAt,
        kind: failed ? 'failed' : 'completed',
        text: `${name(task.agentId)} ${failed ? task.status : 'completed'}`
      })
    }
  }

  if (synthesisTask) {
    events.push({
      id: `${synthesisTask.id}:synthesising`,
      at: synthesisTask.createdAt,
      kind: 'synthesising',
      text: `${name(synthesisTask.agentId)} pulling the findings together`
    })
    if (synthesisTask.endedAt && synthesisTask.status === 'completed') {
      events.push({
        id: `${synthesisTask.id}:finished`,
        at: synthesisTask.endedAt,
        kind: 'finished',
        text: 'Team complete'
      })
    }
  }

  return events.sort((a, b) => a.at - b.at)
}

/** hh:mm:ss, as a timeline reads best. */
export function clockTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** One word for a participant's state, for the header roster. */
export function phaseLabel(member: Member): string {
  if (member.phase === 'working') {
    if (member.delegating) return 'delegating'
    return member.isLead ? 'coordinating' : 'working'
  }
  if (member.phase === 'waiting') return 'waiting'
  if (member.phase === 'done') return 'done'
  if (member.phase === 'failed') return 'failed'
  return 'stopped'
}
