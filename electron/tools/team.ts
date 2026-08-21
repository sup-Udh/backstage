import type { AgentTool } from './types'
import { getAgent, listAgents } from '../agents/agentStore'
import { agentRegistry } from '../agents/AgentRegistry'
import { systemBus } from '../agents/EventBus'
import { makeId } from '../agents/persist'
import { recordCollaboration } from '../agents/collaborationStore'
import { getSettings } from '../agents/settingsStore'
import { isTeamLead } from '../projects/projectStore'
import { getTask } from '../agents/taskStore'
import { agentSessions } from '../terminal/AgentSessionManager'
import { sessionTranscripts } from '../terminal/sessionTranscript'
import { terminals } from '../terminal/TerminalSessionManager'

/**
 * The team tools.
 *
 * Agent-to-agent communication is a permission, not a capability of the model:
 * an agent may only reach the teammates the user has explicitly listed, in the
 * direction the user listed them. That check happens here, before anything is
 * dispatched, and the failure is returned to the model as an ordinary tool
 * error so it adapts rather than retrying.
 *
 * None of these tools dispatch work themselves. They publish an event and the
 * orchestrator decides whether it may run — which is what keeps the depth
 * cap, the cooldown and the duplicate check in one place instead of being
 * re-implemented per tool.
 */

/** Both messaging tools share the same permission and safety checks. */
/**
 * Whether this agent is replying to whoever gave it its current task.
 *
 * A delegated agent could not answer the lead that had just delegated to it:
 * `canTalkTo` starts empty and is the user's to draw, so the reply was refused
 * as an unauthorised contact. The lead's exception is one-way, which left the
 * worker able to receive instructions and unable to ask a question about them.
 *
 * This is narrower than a general permission. It authorises exactly one edge —
 * back along a hand-off that already happened, for the task it happened on —
 * and it expires with the task. Nobody gains reach to an agent that has not
 * just contacted them.
 */
function isReplyingToSender(fromId: string, toId: string, taskId: string): boolean {
  const task = getTask(taskId)
  return task?.agentId === fromId && task.originAgentId === toId
}

function checkSend(
  fromId: string,
  toId: string,
  taskId: string
): { ok: false; error: string } | { ok: true; from: NonNullable<ReturnType<typeof getAgent>>; to: NonNullable<ReturnType<typeof getAgent>> } {
  const from = getAgent(fromId)
  if (!from) return { ok: false, error: 'Internal error: your own configuration is missing.' }

  const to = getAgent(toId)
  if (!to) {
    const known = listAgents()
      .map((a) => a.id)
      .join(', ')
    return { ok: false, error: `No agent with id "${toId}". The team is: ${known}.` }
  }

  /*
   * The team lead may reach anyone in its own project.
   *
   * Not an exception carved out of the permission model so much as what the
   * role *is*: the user nominated this agent to receive whole-team requests
   * and split them up, and a coordinator that can only reach two of five
   * agents cannot do that. It is still bounded — `getAgent` is project-scoped,
   * so "anyone" means anyone in this project and nobody outside it — and every
   * other agent still needs an explicit link the user drew.
   */
  if (
    !from.canTalkTo.includes(to.id) &&
    !isTeamLead(from.id) &&
    !isReplyingToSender(from.id, to.id, taskId)
  ) {
    const allowed = from.canTalkTo.length > 0 ? from.canTalkTo.join(', ') : 'nobody'
    return {
      ok: false,
      error: `Permission denied: you are not allowed to contact "${to.id}". You may contact: ${allowed}.`
    }
  }

  if (!to.enabled) {
    return { ok: false, error: `${to.name} is disabled and cannot take work.` }
  }
  if (!to.spawned) {
    return { ok: false, error: `${to.name} has not been spawned into the workspace.` }
  }

  return { ok: true, from, to }
}

export const delegateTask: AgentTool = {
  name: 'delegate_task',
  label: 'Delegating work',
  description:
    'Ask another agent on your team to carry out a specific task. They work independently and report in their own session; you do not wait for them. Only use this for work that genuinely belongs to their role.',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description:
          'The id of the agent to delegate to. Your system prompt lists who you may contact.'
      },
      task: {
        type: 'string',
        description: 'Complete, self-contained instructions. They cannot see your conversation.'
      },
      reason: {
        type: 'string',
        description: 'Why this belongs to them rather than to you.'
      }
    },
    required: ['agentId', 'task']
  },
  describe: (i) => `Asked ${String(i.agentId ?? 'a teammate')} for help`,
  execute: async (input, ctx) => {
    const targetId = typeof input.agentId === 'string' ? input.agentId.trim() : ''
    const task = typeof input.task === 'string' ? input.task.trim() : ''
    const reason = typeof input.reason === 'string' ? input.reason.trim() : ''

    if (!targetId || !task) {
      return { success: false, error: 'agentId and task are both required.' }
    }

    const check = checkSend(ctx.agentId, targetId, ctx.taskId)
    if (!check.ok) return { success: false, error: check.error }

    const settings = getSettings()
    const depth = ctx.depth + 1
    if (depth > settings.maxChainDepth) {
      return {
        success: false,
        error: `Delegation refused: this chain is already ${ctx.depth} agents deep and the limit is ${settings.maxChainDepth}. Finish this yourself and report what you found.`
      }
    }

    recordCollaboration({
      id: makeId('collab'),
      senderAgentId: check.from.id,
      senderName: check.from.name,
      receiverAgentId: check.to.id,
      receiverName: check.to.name,
      message: task,
      reason: reason || 'Delegated during a task.',
      taskId: ctx.taskId,
      correlationId: ctx.correlationId,
      depth,
      kind: 'delegation',
      at: Date.now()
    })

    systemBus.emit({
      type: 'agent.delegated',
      agentId: check.from.id,
      agentName: check.from.name,
      targetAgentId: check.to.id,
      targetAgentName: check.to.name,
      taskId: ctx.taskId,
      executionId: ctx.executionId,
      correlationId: ctx.correlationId,
      depth,
      message: task,
      reason,
      activity: `asked ${check.to.name} to ${task.slice(0, 60)}`
    })

    return {
      success: true,
      output: `Delegated to ${check.to.name}. They are working on it independently and will report in their own session. Do not wait for them — continue with your own part of the task and say what you have handed over.`
    }
  }
}

export const messageAgent: AgentTool = {
  name: 'agent_message',
  label: 'Messaging a teammate',
  description:
    'Send a short message to another agent without giving them a task — context, a finding, or an answer to something they asked. They see it in their session.',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'The id of the agent to message.' },
      message: { type: 'string', description: 'What you want to tell them.' }
    },
    required: ['agentId', 'message']
  },
  describe: (i) => `Messaged ${String(i.agentId ?? 'a teammate')}`,
  execute: async (input, ctx) => {
    const targetId = typeof input.agentId === 'string' ? input.agentId.trim() : ''
    const message = typeof input.message === 'string' ? input.message.trim() : ''

    if (!targetId || !message) {
      return { success: false, error: 'agentId and message are both required.' }
    }

    const check = checkSend(ctx.agentId, targetId, ctx.taskId)
    if (!check.ok) return { success: false, error: check.error }

    recordCollaboration({
      id: makeId('collab'),
      senderAgentId: check.from.id,
      senderName: check.from.name,
      receiverAgentId: check.to.id,
      receiverName: check.to.name,
      message,
      reason: 'Direct message.',
      taskId: ctx.taskId,
      correlationId: ctx.correlationId,
      depth: ctx.depth,
      kind: 'message',
      at: Date.now()
    })

    systemBus.emit({
      type: 'agent.message.sent',
      agentId: check.from.id,
      agentName: check.from.name,
      targetAgentId: check.to.id,
      targetAgentName: check.to.name,
      taskId: ctx.taskId,
      executionId: ctx.executionId,
      correlationId: ctx.correlationId,
      depth: ctx.depth,
      message,
      activity: `messaged ${check.to.name}`
    })

    return {
      success: true,
      output: `Message delivered to ${check.to.name}. It will be in their session; it does not interrupt what they are doing.`
    }
  }
}

/**
 * Hand work to a running CLI session.
 *
 * A Claude Code session is a real process the user started, doing real work in
 * the same workspace, and the point of this tool is that it is not a
 * second-class worker: the team lead can give it a task the same way it gives
 * one to an API agent.
 *
 * Deliberately fire-and-forget. The session's answer arrives in its own
 * transcript, reconstructed from the PTY, on its own schedule — and a paid
 * model execution must never sit blocked waiting on a terminal that might be
 * mid-prompt, waiting for a permission answer, or simply slow.
 *
 * It also never *starts* a session. Only ones the user has already opened can
 * be addressed; spawning processes on a model's say-so is a different and much
 * louder decision than routing work to one that is already running.
 */
export const delegateToSession: AgentTool = {
  name: 'delegate_to_session',
  label: 'Delegating to a CLI session',
  description:
    'Give a task to a running CLI session, such as Claude Code, working in this project. Use team_status to see which sessions exist. They work independently in their own terminal and report there; you do not wait for them.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The id of the session, exactly as team_status listed it.'
      },
      task: {
        type: 'string',
        description:
          'Complete, self-contained instructions. The session cannot see your conversation.'
      },
      reason: { type: 'string', description: 'Why this belongs to that session.' }
    },
    required: ['sessionId', 'task']
  },
  describe: (i) => `Asked ${String(i.sessionId ?? 'a CLI session')} to help`,
  execute: async (input, ctx) => {
    const wanted = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
    const task = typeof input.task === 'string' ? input.task.trim() : ''
    const reason = typeof input.reason === 'string' ? input.reason.trim() : ''

    if (!wanted || !task) {
      return { success: false, error: 'sessionId and task are both required.' }
    }

    const me = getAgent(ctx.agentId)
    if (!me) {
      return { success: false, error: 'Internal error: your own configuration is missing.' }
    }
    if (!isTeamLead(me.id)) {
      return {
        success: false,
        error:
          'Permission denied: only the project team lead may hand work to a CLI session. Report what you found and let them route it.'
      }
    }

    /*
     * Sessions are addressed by their own id, but the rest of the app calls
     * them `cli-<terminalSessionId>`. Both are accepted: the model was shown a
     * list and should not have to know which of two identifiers the list used.
     */
    const live = agentSessions.active()
    const session =
      live.find((s) => s.id === wanted) ??
      live.find((s) => `cli-${s.terminalSessionId}` === wanted) ??
      live.find((s) => s.terminalSessionId === wanted) ??
      live.find((s) => s.name.toLowerCase() === wanted.toLowerCase())

    if (!session) {
      const known = live.map((s) => `${s.id} (${s.name})`).join(', ') || 'none'
      return {
        success: false,
        error: `No running session "${wanted}". Live sessions: ${known}.`
      }
    }

    if (session.status === 'working' || session.status === 'starting') {
      return {
        success: false,
        error: `${session.name} is busy with something else. Do this yourself or wait for it to finish.`
      }
    }

    recordCollaboration({
      id: makeId('collab'),
      senderAgentId: me.id,
      senderName: me.name,
      receiverAgentId: `cli-${session.terminalSessionId}`,
      receiverName: session.name,
      message: task,
      reason: reason || 'Delegated to a CLI session.',
      taskId: ctx.taskId,
      correlationId: ctx.correlationId,
      depth: ctx.depth + 1,
      kind: 'delegation',
      at: Date.now()
    })

    // Recorded before the write, so the hand-off is in the session's readable
    // transcript even if the PTY refuses it.
    sessionTranscripts.recordInput(session.id, task)

    const sent = terminals.write(
      session.terminalSessionId,
      `${task}${String.fromCharCode(13)}`
    )
    if (!sent) {
      return { success: false, error: `Could not reach ${session.name}.` }
    }

    systemBus.emit({
      type: 'agent.delegated',
      agentId: me.id,
      agentName: me.name,
      targetAgentId: `cli-${session.terminalSessionId}`,
      targetAgentName: session.name,
      taskId: ctx.taskId,
      executionId: ctx.executionId,
      correlationId: ctx.correlationId,
      depth: ctx.depth + 1,
      message: task,
      reason,
      activity: `asked ${session.name} to ${task.slice(0, 60)}`
    })

    return {
      success: true,
      output: `Sent to ${session.name}. It is working in its own terminal and its answer appears there — you will not receive it as a tool result. Continue with your own part and say what you handed over.`
    }
  }
}

export const teamStatus: AgentTool = {
  name: 'team_status',
  label: 'Checking on the team',
  description:
    'See who else is on the team, what they are doing right now, and who you are allowed to contact. Use this before delegating.',
  inputSchema: { type: 'object', properties: {} },
  describe: () => 'Checked on the team',
  execute: async (_input, ctx) => {
    const me = getAgent(ctx.agentId)
    const lead = isTeamLead(ctx.agentId)
    const others = listAgents().filter((a) => a.id !== ctx.agentId)

    const lines = others.map((a) => {
      const state = agentRegistry.get(a.id)
      const may =
        lead || me?.canTalkTo.includes(a.id)
          ? 'you may contact them'
          : 'off-limits to you'
      const doing = state.action ? ` — ${state.action}` : ''
      const presence = a.spawned ? state.status : 'not spawned'
      const queued = state.queued > 0 ? `, ${state.queued} queued` : ''
      return `${a.id} (${a.name}, ${a.role}): ${presence}${doing}${queued}; ${may}`
    })

    /*
     * CLI sessions are listed too, for whoever may reach them. They are real
     * workers in the same workspace, and a coordinator that cannot see them
     * cannot route anything to them.
     */
    if (lead) {
      for (const s of agentSessions.active()) {
        lines.push(
          `${s.id} (${s.name}, ${s.provider ?? 'cli'} session): ${s.status}; use delegate_to_session`
        )
      }
    }

    if (lines.length === 0) {
      return { success: true, output: 'You are the only agent on this team.' }
    }
    return { success: true, output: lines.join('\n') }
  }
}

export const teamTools: AgentTool[] = [
  delegateTask,
  delegateToSession,
  messageAgent,
  teamStatus
]
