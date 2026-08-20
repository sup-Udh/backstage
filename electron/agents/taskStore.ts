import type { AgentTask, TaskStatus } from './agent.types'

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

/** Newest first, so the UI shows the current work at the top. */
export function listTasks(limit = 60, agentId?: string): AgentTask[] {
  const all = order
    .map((id) => tasks.get(id))
    .filter((t): t is AgentTask => t !== undefined)
  const scoped = agentId ? all.filter((t) => t.agentId === agentId) : all
  return scoped.slice(-limit).reverse()
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
