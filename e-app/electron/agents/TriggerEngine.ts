import { getAgent } from '../agents/agentStore'
import { systemBus } from '../agents/EventBus'
import { AgentRuntime } from '../agents/AgentRuntime'
import { conversationStore } from '../agents/conversationStore'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'

import { listAgents } from '../agents/agentStore'

let runtimeInstance: AgentRuntime | null = null

// Simple debounce to prevent rapid consecutive triggers
const cooldowns = new Map<string, number>()
const MAX_DEPTH = 3

export function initTriggerEngine(runtime: AgentRuntime): void {
  runtimeInstance = runtime

  systemBus.onEvent((event) => {
    // Phase 12: Delegation Tool
    if (event.type === 'agent.delegated' && event.targetAgentId && event.message) {
      const depth = (event.depth ?? 0) + 1
      handleDelegation(event.agentId!, event.targetAgentId, event.message, depth, event.taskId)
    }

    // Phase 16: AUTO mode (Trigger on other agents completing tasks)
    if (event.type === 'task.completed' && event.agentId) {
      handleAutoModeTriggers(event.agentId)
    }
  })
}

function handleAutoModeTriggers(completedAgentId: string) {
  if (!runtimeInstance) return

  const allAgents = listAgents()
  
  for (const agent of allAgents) {
    if (!agent.enabled || !agent.autoMode) continue

    // Does this agent have a trigger for the completed agent?
    if (agent.triggers.includes(completedAgentId)) {
      
      // Cooldown check (Phase 17)
      const lastRun = cooldowns.get(agent.id) ?? 0
      if (Date.now() - lastRun < 10000) {
         console.warn(`[TriggerEngine] Rate limiting ${agent.name} from rapid consecutive triggers.`)
         continue
      }
      cooldowns.set(agent.id, Date.now())

      // Formulate the prompt
      const prompt = `[System]: The agent ${completedAgentId} has just completed a task. Please review their recent work or proceed with your next steps.`
      
      const workspaceRoot = getWorkspaceRoot() || 'default'
      conversationStore.append(workspaceRoot, agent.id, {
        id: Date.now().toString(),
        role: 'user',
        agentId: agent.id,
        text: prompt,
        timestamp: Date.now()
      })

      const history = conversationStore.load(workspaceRoot, agent.id).slice(-12).map(m => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text
      }))

      const taskId = `task_${Date.now().toString(36)}_auto`
      void runtimeInstance.runTask(taskId, prompt, [agent], history, 1)
    }
  }
}

function handleDelegation(fromAgentId: string, toAgentId: string, taskDescription: string, depth: number, parentTaskId?: string) {
  if (depth > MAX_DEPTH) {
    console.warn(`[TriggerEngine] Dropping delegation from ${fromAgentId} to ${toAgentId} because max depth of ${MAX_DEPTH} reached.`)
    return
  }

  if (!runtimeInstance) return

  const targetAgent = getAgent(toAgentId)
  if (!targetAgent || !targetAgent.enabled) return

  const workspaceRoot = getWorkspaceRoot() || 'default'

  // Persist the delegation prompt to the target's conversation store
  // So the target agent sees it as a user prompt
  const fromAgent = getAgent(fromAgentId)
  const prefix = fromAgent ? `[Delegated by ${fromAgent.name}]: ` : ''
  const fullPrompt = prefix + taskDescription

  conversationStore.append(workspaceRoot, toAgentId, {
    id: Date.now().toString(),
    role: 'user', // We treat delegation like a user prompt so the target agent answers it
    agentId: toAgentId,
    text: fullPrompt,
    timestamp: Date.now()
  })

  // Start the task for the target agent
      const taskId = `task_${Date.now().toString(36)}`
      
      const history = conversationStore.load(workspaceRoot, toAgentId).slice(-12).map(m => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text
      }))
    
      void runtimeInstance.runTask(taskId, fullPrompt, [targetAgent], history, depth, parentTaskId).then(() => {
        notifyDelegatorOfCompletion(workspaceRoot, fromAgentId, toAgentId, depth, taskId)
      })
    }
    
    function notifyDelegatorOfCompletion(workspaceRoot: string, delegatorId: string, delegateeId: string, depth: number, parentTaskId: string) {
      const delegator = getAgent(delegatorId)
      const delegatee = getAgent(delegateeId)
      if (!delegator || !delegatee) return
    
      const history = conversationStore.load(workspaceRoot, delegateeId)
      const lastResponse = history.filter(m => m.role === 'agent').pop()
      const resultText = lastResponse ? lastResponse.text : '(No response recorded)'
    
      const notification = `[System]: ${delegatee.name} has finished the task you delegated. Result:\n${resultText}`
    
      conversationStore.append(workspaceRoot, delegatorId, {
        id: Date.now().toString(),
        role: 'user',
        agentId: delegatorId,
        text: notification,
        timestamp: Date.now()
      })
    
      if (runtimeInstance) {
        const delegatorHistory = conversationStore.load(workspaceRoot, delegatorId).slice(-12).map(m => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.text
        }))
        
        const wakeupTaskId = `task_${Date.now().toString(36)}_wakeup`
        void runtimeInstance.runTask(wakeupTaskId, notification, [delegator], delegatorHistory, depth + 1, parentTaskId)
      }
    }
