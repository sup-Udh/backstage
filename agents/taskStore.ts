import type { AgentTask, TaskStatus } from './agent.types'
import { getActiveProjectId } from '../projects/projectStore'

/**
 * The task ledger.
 *
 * In memory and bounded. Tasks are a record of a session's work, not a
 * database — persisting them would mean reopening the app to a list of jobs
 * that are no longer running, which is worse than an empty list.
 *
 * Every task belongs to exactly one agent. A request addressed to three agents
 * becomes three tasks sharing a correlation id, because "the team is working
 * on it" is three independent pieces of work and has to be cancellable,
 * retryable and reportable as three.
 */

const LIMIT = 300

const tasks = new Map<string, AgentTask>()
const order: string[] = []

export function recordTask(task: AgentTask): AgentTask {
  tasks.set(task.id, task)
  order.push(task.id)
  while (order.length > LIMIT) {
    const oldest = order.shift()
    if (oldest) tasks.delete(oldest)
  }
  return task
}

export function getTask(id: string): AgentTask | undefined {
  return tasks.get(id)
}

export function updateTask(id: string, patch: Partial<AgentTask>): AgentTask | undefined {
  const task = tasks.get(id)
  if (!task) return undefined
  Object.assign(task, patch)
  return task
}

export function setTaskStatus(
  id: string,
  status: TaskStatus,
  extra: Partial<AgentTask> = {}
): AgentTask | undefined {
  const task = tasks.get(id)
  if (!task) return undefined
  task.status = status
  if (status === 'running' && task.startedAt === null) task.startedAt = Date.now()
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    task.endedAt = Date.now()
  }
  Object.assign(task, extra)
  return task
}

/**
 * Newest first, so the UI shows the current work at the top.
 *
 * Scoped to the open project. Tasks are keyed by agent and agents are already
 * project-scoped, so this is belt-and-braces — but the ledger is one flat map
 * shared by every project, and "the roster happens to filter it" is not the
 * same guarantee as filtering it.
 */
export function listTasks(limit = 60, agentId?: string): AgentTask[] {
  const projectId = getActiveProjectId()
  if (!projectId) return []

  const all = order
    .map((id) => tasks.get(id))
    .filter((t): t is AgentTask => t !== undefined && t.projectId === projectId)
  const scoped = agentId ? all.filter((t) => t.agentId === agentId) : all
  return scoped.slice(-limit).reverse()
}

/** Every task in one case, oldest first. */
export function tasksInCase(caseId: string): AgentTask[] {
  return order
    .map((id) => tasks.get(id))
    .filter((t): t is AgentTask => t !== undefined && t.caseId === caseId)
}

/**
 * The tasks one task handed out, oldest first.
 *
 * This is the task tree: a delegation becomes a child task carrying its
 * parent's id, so a coordinator can ask what it is still waiting on without
 * anything having to track that separately.
 */
export function listChildren(parentTaskId: string): AgentTask[] {
  return order
    .map((id) => tasks.get(id))
    .filter((t): t is AgentTask => t !== undefined && t.parentTaskId === parentTaskId)
}

/** Whether every task handed out by this one has finished, one way or another. */
export function childrenSettled(parentTaskId: string): boolean {
  const children = listChildren(parentTaskId)
  if (children.length === 0) return true
  return children.every(
    (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
  )
}

export function activeTasks(): AgentTask[] {
  return [...tasks.values()].filter(
    (t) => t.status === 'running' || t.status === 'queued'
  )
}

/** How many tasks in a chain exist, however far it has branched. */
export function chainSize(correlationId: string): number {
  let n = 0
  for (const t of tasks.values()) if (t.correlationId === correlationId) n++
  return n
}

/** Every task descended from one originating request, oldest first. */
export function chainTasks(correlationId: string): AgentTask[] {
  return order
    .map((id) => tasks.get(id))
    .filter((t): t is AgentTask => t !== undefined && t.correlationId === correlationId)
}

/**
 * Whether everything descended from one request has finished.
 *
 * Measured on the correlation id rather than by walking parent links, because
 * a delegate can itself delegate — the tree can be three deep — and the
 * correlation id is the one thing every task in it shares however far it
 * branched.
 */
export function chainSettled(correlationId: string): boolean {
  return chainTasks(correlationId).every(
    (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
  )
}

/**
 * Whether this exact prompt has already been sent to this agent in this chain.
 *
 * The cheapest loop protection there is, and the one that catches the case the
 * depth counter misses: two agents that keep asking each other the same
 * question at the same depth on separate branches.
 */
export function isDuplicateInChain(
  correlationId: string,
  agentId: string,
  prompt: string
): boolean {
  const needle = prompt.trim().slice(0, 400).toLowerCase()
  for (const t of tasks.values()) {
    if (t.correlationId !== correlationId || t.agentId !== agentId) continue
    if (t.prompt.trim().slice(0, 400).toLowerCase() === needle) return true
  }
  return false
}
