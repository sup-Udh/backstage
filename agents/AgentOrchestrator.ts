import type { AgentConfig, AgentTask, RuntimeEvent, TaskRequest } from './agent.types'
import type { Turn } from '../providers/provider.types'
import { getAgent, listAgents } from './agentStore'
import { agentRegistry } from './AgentRegistry'
import { systemBus } from './EventBus'
import { makeId } from './persist'
import { Execution, CancelledError } from './Executor'
import { conversationStore } from './conversationStore'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import {
  chainSize,
  isDuplicateInChain,
  listTasks,
  recordTask,
  setTaskStatus
} from './taskStore'
import { chainMessageCount, isRepeat, recordCollaboration } from './collaborationStore'
import { getSettings } from './settingsStore'
import { attachTask, caseForChain } from '../cases/caseStore'
import { clearActivity, report } from './activityStore'

/**
 * The orchestrator.
 *
 * One queue per agent, one execution at a time within an agent, and no
 * coordination between agents at all. That last part is the point: Jane
 * working does not touch Michael's queue, his state, his provider or his
 * conversation, so talking to Michael while Jane works cannot interrupt her.
 *
 * There is deliberately no global "current task", "current agent" or "busy"
 * flag anywhere in this file. Every piece of state is behind an agentId, and
 * every execution is identified by an executionId that is carried through
 * every event it produces — which is what keeps one agent's output out of
 * another's session.
 *
 * The UI never orchestrates. It submits requests and renders events.
 */

interface Queued {
  task: AgentTask
  history: Turn[]
}

/**
 * Why a submission was refused.
 *
 * A distinct field rather than `{ error }`: AgentTask carries an `error` of
 * its own for a task that ran and failed, so testing for that key could not
 * tell a rejected request apart from a completed-but-failed one.
 */
export interface Rejected {
  rejected: true
  error: string
}

export type SubmitResult = AgentTask | Rejected

export function wasRejected(result: SubmitResult): result is Rejected {
  return 'rejected' in result
}

interface Lane {
  queue: Queued[]
  current: Execution | null
  currentTask: AgentTask | null
}

export class AgentOrchestrator {
  private lanes = new Map<string, Lane>()
  private disposed = false

  constructor() {
    systemBus.on((event) => this.onBusEvent(event))
  }

  private lane(agentId: string): Lane {
    let lane = this.lanes.get(agentId)
    if (!lane) {
      lane = { queue: [], current: null, currentTask: null }
      this.lanes.set(agentId, lane)
    }
    return lane
  }

  /* ------------------------------------------------------------ submitting -- */

  /**
   * Queue work for one agent.
   *
   * Returns the task immediately. Nothing here waits for the model: the caller
   * gets an acknowledgement and follows the event stream, which is what lets
   * the world animate while an agent works rather than freezing on a promise.
   */
  submit(request: TaskRequest): SubmitResult {
    if (this.disposed) return { rejected: true, error: 'The runtime is shutting down.' }

    const agent = getAgent(request.agentId)
    if (!agent) return { rejected: true, error: 'That agent no longer exists.' }
    if (!agent.enabled) return { rejected: true, error: `${agent.name} is disabled.` }
    if (!agent.spawned) {
      return {
        rejected: true,
        error: `${agent.name} has not been spawned into the workspace.`
      }
    }

    const prompt = request.prompt.trim()
    if (!prompt) return { rejected: true, error: 'Empty prompt.' }

    const correlationId = request.correlationId ?? makeId('chain')
    const depth = request.depth ?? 0

    // Loop protection, applied before anything is queued rather than after
    // money has been spent on it.
    const guard = this.guardChain(agent, prompt, correlationId, depth, request.origin)
    if (guard) return { rejected: true, error: guard }

    const title = request.title?.trim() || headline(prompt)

    /*
     * Every task belongs to an investigation.
     *
     * The case is resolved from the correlation id, so a request broadcast to
     * three agents — and everything they then delegate — lands in one case
     * rather than three. It is opened on demand and named from the request
     * that began the chain, which is why the user never has to create a case
     * before asking a question.
     */
    const caseId = request.caseId ?? caseForChain(correlationId, title)

    const task: AgentTask = {
      id: makeId('task'),
      projectId: agent.projectId,
      caseId,
      agentId: agent.id,
      prompt,
      title,
      status: 'queued',
      origin: request.origin,
      originAgentId: request.originAgentId ?? null,
      correlationId,
      depth,
      parentTaskId: request.parentTaskId ?? null,
      executionId: null,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      result: null,
      error: null,
      part: request.part
    }
    recordTask(task)
    if (caseId) attachTask(caseId, task.id, agent.id)

    const lane = this.lane(agent.id)
    lane.queue.push({ task, history: request.history ?? this.historyFor(agent.id) })
    agentRegistry.setQueued(agent.id, lane.queue.length)

    systemBus.emit({
      type: 'task.created',
      agentId: agent.id,
      agentName: agent.name,
      taskId: task.id,
      parentTaskId: task.parentTaskId ?? undefined,
      correlationId,
      depth,
      task: task.title,
      activity: `New task: ${task.title}`
    })

    void this.pump(agent.id)
    return task
  }

  /**
   * Submit the same prompt to several agents at once.
   *
   * They share a correlation id and nothing else — separate tasks, separate
   * queues, separate executions, separate answers. Merging their replies into
   * one would be inventing a consensus none of them reached.
   */
  broadcast(
    agentIds: string[],
    prompt: string,
    origin: TaskRequest['origin'] = 'user'
  ): { tasks: AgentTask[]; errors: { agentId: string; error: string }[] } {
    const correlationId = makeId('chain')
    const tasks: AgentTask[] = []
    const errors: { agentId: string; error: string }[] = []

    for (const agentId of agentIds) {
      const result = this.submit({ agentId, prompt, origin, correlationId })
      if (wasRejected(result)) errors.push({ agentId, error: result.error })
      else tasks.push(result)
    }
    return { tasks, errors }
  }

  /* ------------------------------------------------------------- draining -- */

  private async pump(agentId: string): Promise<void> {
    const lane = this.lane(agentId)
    if (lane.current) return

    const next = lane.queue.shift()
    agentRegistry.setQueued(agentId, lane.queue.length)
    if (!next) return

    const agent = getAgent(agentId)
    if (!agent) return

    const { task, history } = next
    const executionId = makeId('exec')
    const execution = new Execution(executionId, agent, task, history)

    lane.current = execution
    lane.currentTask = task
    task.executionId = executionId
    setTaskStatus(task.id, 'running')

    agentRegistry.beginExecution(agentId, executionId, task.id, task.title)

    systemBus.emit({
      type: 'agent.activated',
      agentId,
      agentName: agent.name,
      taskId: task.id,
      executionId,
      correlationId: task.correlationId,
      depth: task.depth,
      activity: 'picked up the task.'
    })
    systemBus.emit({
      type: 'task.started',
      agentId,
      agentName: agent.name,
      taskId: task.id,
      executionId,
      correlationId: task.correlationId,
      task: task.title
    })

    let error: string | null = null

    try {
      const text = await execution.run()
      setTaskStatus(task.id, 'completed', { result: text })

      /*
       * The last thing the run says. Held on screen for a couple of seconds by
       * the activity store and then dropped, which is what makes COMPLETE →
       * IDLE something the user can actually see rather than a character that
       * abruptly stops.
       */
      report(agentId, { type: 'completed', detail: task.title })

      this.remember(agentId, {
        id: makeId('msg'),
        kind: 'agent',
        agentId,
        text,
        at: Date.now(),
        taskId: task.id,
        /*
         * Carried from the request onto the stored message, so which answer
         * was the team's final one survives a reload. Everything else about a
         * synthesis is an ordinary completed task, and the interface has no
         * other way to tell it apart.
         */
        part: task.part
      })

      systemBus.emit({
        type: 'agent.completed',
        agentId,
        agentName: agent.name,
        taskId: task.id,
        executionId,
        correlationId: task.correlationId,
        depth: task.depth,
        activity: 'finished.',
        message: text
      })
      systemBus.emit({
        type: 'task.completed',
        agentId,
        agentName: agent.name,
        taskId: task.id,
        executionId,
        correlationId: task.correlationId,
        depth: task.depth,
        task: task.title,
        message: text,
        activity: 'Task closed.'
      })
    } catch (err) {
      if (err instanceof CancelledError) {
        setTaskStatus(task.id, 'cancelled')
        report(agentId, { type: 'stopped', detail: task.title })
        systemBus.emit({
          type: 'agent.cancelled',
          agentId,
          agentName: agent.name,
          taskId: task.id,
          executionId,
          correlationId: task.correlationId,
          activity: 'was stopped.'
        })
        systemBus.emit({
          type: 'task.cancelled',
          agentId,
          agentName: agent.name,
          taskId: task.id,
          executionId,
          correlationId: task.correlationId,
          task: task.title
        })
      } else {
        error = err instanceof Error ? err.message : 'Something went wrong.'
        setTaskStatus(task.id, 'failed', { error })

        /*
         * The real reason, not the word ERROR on its own. §22: an error the
         * user cannot read is one they cannot act on, and the runtime already
         * knows what went wrong.
         */
        report(agentId, {
          type: 'error',
          detail: error.length > 60 ? `${error.slice(0, 59)}…` : error,
          detailFull: error
        })

        this.remember(agentId, {
          id: makeId('msg'),
          kind: 'system',
          agentId,
          text: error,
          at: Date.now(),
          taskId: task.id
        })

        /*
         * One agent failing is one agent failing. Nothing here touches another
         * lane, so a provider outage on Jane's side leaves Michael working.
         */
        systemBus.emit({
          type: 'agent.failed',
          agentId,
          agentName: agent.name,
          taskId: task.id,
          executionId,
          correlationId: task.correlationId,
          depth: task.depth,
          activity: 'could not finish.',
          message: error
        })
        systemBus.emit({
          type: 'task.failed',
          agentId,
          agentName: agent.name,
          taskId: task.id,
          executionId,
          correlationId: task.correlationId,
          task: task.title,
          reason: error
        })
      }
    } finally {
      lane.current = null
      lane.currentTask = null
      agentRegistry.endExecution(agentId, executionId, error)

      systemBus.emit({
        type: 'agent.idle',
        agentId,
        agentName: agent.name,
        taskId: task.id,
        executionId,
        correlationId: task.correlationId
      })

      // Straight on to whatever else this agent was asked for. Its own queue
      // only; no other lane is consulted.
      void this.pump(agentId)
    }
  }

  /* ---------------------------------------------------------- controlling -- */

  /** Stop one agent. Everyone else keeps working. */
  cancel(agentId: string): boolean {
    const lane = this.lanes.get(agentId)
    if (!lane) return false

    for (const queued of lane.queue) setTaskStatus(queued.task.id, 'cancelled')
    lane.queue = []
    agentRegistry.setQueued(agentId, 0)

    if (lane.current) {
      // The execution reports `stopped` when it actually unwinds; until then
      // the badge stays on whatever it was genuinely doing.

      lane.current.cancel()
      /*
       * Say so immediately. The execution unwinds at the next step or tool
       * boundary, which can be a few seconds away, and a button that appears
       * to do nothing gets pressed again — so the agent reports `stopping`
       * from here until it actually stops.
       */
      agentRegistry.beginStop(agentId, lane.current.id)
      return true
    }
    /*
     * Nothing was running, so there is nothing to unwind and nothing will
     * report `stopped`. Drop the badge here instead, or a cancelled queue
     * leaves the character wearing the activity of work that never began.
     */
    clearActivity(agentId)
    agentRegistry.refresh(agentId)
    return false
  }

  /**
   * The emergency stop.
   *
   * Cancels every Backstage-managed execution. It deliberately does not touch
   * external terminal sessions: a `claude` process the user started in a PTY
   * is their process, and killing it because an agent misbehaved would be
   * destroying work this system does not own.
   */
  stopAll(): number {
    let stopped = 0
    for (const agentId of this.lanes.keys()) {
      if (this.cancel(agentId)) stopped++
    }
    return stopped
  }

  /** Re-run a task that failed, as a new execution. */
  retry(taskId: string): SubmitResult {
    const task = listTasks(200).find((t) => t.id === taskId)
    if (!task) return { rejected: true, error: 'That task is no longer in the log.' }
    if (task.status === 'running' || task.status === 'queued') {
      return { rejected: true, error: 'That task has not finished yet.' }
    }
    agentRegistry.clearError(task.agentId)
    return this.submit({
      agentId: task.agentId,
      prompt: task.prompt,
      title: task.title,
      origin: task.origin,
      originAgentId: task.originAgentId,
      correlationId: task.correlationId,
      depth: task.depth,
      parentTaskId: task.parentTaskId
    })
  }

  /** What each agent is working on, for the tasks surface. */
  snapshot(): { agentId: string; current: AgentTask | null; queued: AgentTask[] }[] {
    return listAgents().map((a) => {
      const lane = this.lanes.get(a.id)
      return {
        agentId: a.id,
        current: lane?.currentTask ?? null,
        queued: (lane?.queue ?? []).map((q) => q.task)
      }
    })
  }

  dispose(): void {
    this.disposed = true
    this.stopAll()
  }

  /* ------------------------------------------------------ agent to agent -- */

  /**
   * Deliver what one agent sent another.
   *
   * A delegation becomes a task on the receiver's own queue; a plain message
   * becomes a line in their session without starting any work. Both are
   * subject to the same chain limits, checked again here rather than trusted
   * from the tool — the tool checks so the model gets a useful error, this
   * checks so the limit is actually enforced.
   */
  private onBusEvent(event: RuntimeEvent): void {
    if (event.type === 'agent.delegated') this.onDelegated(event)
    if (event.type === 'agent.message.sent') this.onAgentMessage(event)
  }

  private onDelegated(event: RuntimeEvent): void {
    const from = event.agentId ? getAgent(event.agentId) : undefined
    const to = event.targetAgentId ? getAgent(event.targetAgentId) : undefined
    const message = event.message?.trim()
    if (!from || !to || !message) return

    const correlationId = event.correlationId ?? makeId('chain')
    const depth = event.depth ?? 1

    const result = this.submit({
      agentId: to.id,
      prompt: message,
      title: headline(message),
      origin: 'agent',
      originAgentId: from.id,
      correlationId,
      depth,
      parentTaskId: event.taskId ?? null
    })

    if (wasRejected(result)) {
      systemBus.emit({
        type: 'trigger.blocked',
        agentId: from.id,
        agentName: from.name,
        targetAgentId: to.id,
        targetAgentName: to.name,
        correlationId,
        depth,
        reason: result.error,
        activity: `could not hand work to ${to.name}: ${result.error}`
      })
      return
    }

    /*
     * Both ends, said out loud.
     *
     * §17: the office has to show a hand-off as a hand-off. The sender is
     * delegating *to somebody named*, and the receiver is taking work in
     * rather than having independently decided to start something. Two
     * characters both drawn as "working" is the office failing to report the
     * one thing that makes it a team.
     */
    report(from.id, {
      type: 'delegating',
      detail: to.name,
      detailFull: to.name,
      targetAgentId: to.id,
      targetAgentName: to.name
    })
    report(to.id, {
      type: 'receiving_task',
      detail: from.name,
      detailFull: from.name,
      targetAgentId: from.id,
      targetAgentName: from.name
    })

    // Both sides see it. The receiver reads it as an incoming request; the
    // sender's session records what they handed over.
    this.remember(to.id, {
      id: makeId('msg'),
      kind: 'collaboration',
      agentId: to.id,
      fromAgentId: from.id,
      fromName: from.name,
      text: message,
      at: Date.now(),
      taskId: result.id
    })

    systemBus.emit({
      type: 'agent.message.received',
      agentId: to.id,
      agentName: to.name,
      targetAgentId: from.id,
      targetAgentName: from.name,
      taskId: result.id,
      correlationId,
      depth,
      message,
      activity: `received work from ${from.name}.`
    })
  }

  private onAgentMessage(event: RuntimeEvent): void {
    const from = event.agentId ? getAgent(event.agentId) : undefined
    const to = event.targetAgentId ? getAgent(event.targetAgentId) : undefined
    const message = event.message?.trim()
    if (!from || !to || !message) return

    /*
     * Talking, not delegating. The distinction is visible: a message changes
     * nothing about what the receiver is doing, so only the sender's activity
     * moves. Marking the receiver as busy for a note they have not read yet
     * would be the office claiming work that has not started.
     */
    report(from.id, {
      type: 'talking_to_agent',
      detail: to.name,
      detailFull: to.name,
      targetAgentId: to.id,
      targetAgentName: to.name
    })

    /*
     * A message is context, not work. It lands in the receiver's memory and
     * will be there on their next turn, but it does not start a task — which
     * is what stops two agents chatting each other into an unbounded bill.
     */
    this.remember(to.id, {
      id: makeId('msg'),
      kind: 'collaboration',
      agentId: to.id,
      fromAgentId: from.id,
      fromName: from.name,
      text: message,
      at: Date.now()
    })

    systemBus.emit({
      type: 'agent.message.received',
      agentId: to.id,
      agentName: to.name,
      targetAgentId: from.id,
      targetAgentName: from.name,
      correlationId: event.correlationId,
      depth: event.depth,
      message,
      activity: `heard from ${from.name}.`
    })
  }

  /* ------------------------------------------------------------ guarding -- */

  /**
   * Whether this task may join its chain.
   *
   * User-initiated work is never blocked — the user is allowed to ask for the
   * same thing twice. Everything automatic is checked four ways, because each
   * catches a loop the others miss: depth catches a straight chain, chain size
   * catches a fan-out, message count catches chatter, and the duplicate check
   * catches two agents asking each other the same question forever.
   */
  private guardChain(
    agent: AgentConfig,
    prompt: string,
    correlationId: string,
    depth: number,
    origin: TaskRequest['origin']
  ): string | null {
    if (origin === 'user') return null

    const settings = getSettings()

    if (depth > settings.maxChainDepth) {
      return `Chain depth limit reached (${settings.maxChainDepth}).`
    }
    if (chainSize(correlationId) >= settings.maxMessagesPerChain) {
      return `This chain has already produced ${settings.maxMessagesPerChain} tasks.`
    }
    if (chainMessageCount(correlationId) >= settings.maxMessagesPerChain) {
      return `This chain has already produced ${settings.maxMessagesPerChain} messages.`
    }
    if (isDuplicateInChain(correlationId, agent.id, prompt)) {
      return `${agent.name} has already been asked this in the same chain.`
    }
    return null
  }

  /* ------------------------------------------------------------- helpers -- */

  private workspaceId(): string {
    return getWorkspaceRoot() ?? 'no-workspace'
  }

  private historyFor(agentId: string): Turn[] {
    return conversationStore.history(this.workspaceId(), agentId, 12)
  }

  private remember(agentId: string, message: Parameters<typeof conversationStore.append>[2]): void {
    conversationStore.append(this.workspaceId(), agentId, message)
  }
}

/** A short, single-line headline for a task list. */
function headline(prompt: string): string {
  const flat = prompt.trim().replace(/\s+/g, ' ')
  return flat.length > 64 ? `${flat.slice(0, 63)}…` : flat
}

/**
 * Record an agent-to-agent exchange that the trigger engine originated, so a
 * trigger's message shows up in the collaboration log alongside the ones the
 * agents sent themselves.
 */
export function recordTriggerMessage(input: {
  senderAgentId: string
  senderName: string
  receiverAgentId: string
  receiverName: string
  message: string
  reason: string
  taskId: string | null
  correlationId: string
  depth: number
}): boolean {
  if (
    isRepeat(
      input.correlationId,
      input.senderAgentId,
      input.receiverAgentId,
      input.message
    )
  ) {
    return false
  }
  recordCollaboration({
    id: makeId('collab'),
    kind: 'trigger',
    at: Date.now(),
    ...input
  })
  return true
}

export const orchestrator = new AgentOrchestrator()
