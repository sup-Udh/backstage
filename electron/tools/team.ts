import type { AgentTool } from './types'
import { getAgent, listAgents } from '../agents/agentStore'
import { agentRegistry } from '../agents/AgentRegistry'
import { systemBus } from '../agents/EventBus'
import { makeId } from '../agents/persist'
import { recordCollaboration } from '../agents/collaborationStore'
import { getSettings } from '../agents/settingsStore'

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
function checkSend(
  fromId: string,
  toId: string
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

  if (!from.canTalkTo.includes(to.id)) {
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

    const check = checkSend(ctx.agentId, targetId)
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

    const check = checkSend(ctx.agentId, targetId)
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

export const teamStatus: AgentTool = {
  name: 'team_status',
  label: 'Checking on the team',
  description:
    'See who else is on the team, what they are doing right now, and who you are allowed to contact. Use this before delegating.',
  inputSchema: { type: 'object', properties: {} },
  describe: () => 'Checked on the team',
  execute: async (_input, ctx) => {
    const me = getAgent(ctx.agentId)
    const others = listAgents().filter((a) => a.id !== ctx.agentId)

    if (others.length === 0) {
      return { success: true, output: 'You are the only agent on this team.' }
    }

    const lines = others.map((a) => {
      const state = agentRegistry.get(a.id)
      const may = me?.canTalkTo.includes(a.id) ? 'you may contact them' : 'off-limits to you'
      const doing = state.action ? ` — ${state.action}` : ''
      const presence = a.spawned ? state.status : 'not spawned'
      return `${a.id} (${a.name}, ${a.role}): ${presence}${doing}; ${may}`
    })

    return { success: true, output: lines.join('\n') }
  }
}

export const teamTools: AgentTool[] = [delegateTask, messageAgent, teamStatus]
