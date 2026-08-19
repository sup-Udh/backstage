import type { AgentTool } from './types'
import { getAgent } from '../agents/agentStore'
import { systemBus } from '../agents/EventBus'

export const teamTools: AgentTool[] = [
  {
    name: 'delegate_task',
    label: 'Delegating work',
    description: 'Ask another agent on your team to do a specific task. You must wait for their results in your subsequent tool calls, or they will output the result to their own workspace chat where you and the user can see it.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'The ID of the agent to delegate to (e.g. "jane", "codex"). Check your system prompt to see who you are allowed to talk to.'
        },
        task: {
          type: 'string',
          description: 'The detailed task instructions or prompt for the other agent.'
        }
      },
      required: ['agentId', 'task']
    },
    describe: (input) => `Asking ${input.agentId} to help`,
    execute: async (input, ctx) => {
      const agentId = typeof input.agentId === 'string' ? input.agentId.toLowerCase() : ''
      const task = typeof input.task === 'string' ? input.task : ''

      if (!agentId || !task) {
        return { success: false, error: 'agentId and task are required.' }
      }

      // Check if the agent exists
      const targetAgent = getAgent(agentId)
      if (!targetAgent) {
        return { success: false, error: `Agent "${agentId}" not found in the workspace.` }
      }

      // Check permissions (Phase 13: Agent Relationships)
      const currentAgent = getAgent(ctx.agentId)
      if (!currentAgent) {
        return { success: false, error: 'Internal error: Cannot verify your permissions.' }
      }

      // Allow delegation if they have the target in their canTalkTo list, or if it's "all"
      if (!currentAgent.canTalkTo?.includes(agentId)) {
        return { 
          success: false, 
          error: `Permission denied. You are not allowed to assign tasks to "${agentId}". You can only talk to: ${currentAgent.canTalkTo?.join(', ') || 'no one'}.` 
        }
      }

      // Publish delegation event to the Central Event Bus (TriggerEngine will catch it)
      systemBus.emitEvent({
        type: 'agent.delegated',
        at: Date.now(),
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        agentName: currentAgent.name,
        targetAgentId: agentId,
        message: task
      } as any)

      return {
        success: true,
        output: `Task successfully delegated to ${targetAgent.name}. They will begin working on it immediately.`
      }
    }
  }
]
