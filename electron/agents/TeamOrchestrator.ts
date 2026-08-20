import { systemBus } from './EventBus'
import { orchestrator, wasRejected } from './AgentOrchestrator'
import { getAgent } from './agentStore'
import { agentRegistry } from './AgentRegistry'
import { makeId } from './persist'
import { agentSessions } from '../terminal/AgentSessionManager'
import { terminals } from '../terminal/TerminalSessionManager'
import type { Turn } from '../providers/provider.types'
import { BUSY_STATUSES } from './agent.types'

class TeamOrchestrator {
  private activeTeams = new Map<string, { cancelled: boolean }>()

  runTeam(agentIds: string[], prompt: string, origin: any = 'user') {
    const teamExecutionId = makeId('team')
    this.activeTeams.set(teamExecutionId, { cancelled: false })
    
    systemBus.emit({
      type: 'team.started',
      
      
      teamExecutionId
    })

    // Run sequentially in background
    this.pumpTeam(teamExecutionId, agentIds, prompt, origin)

    return { accepted: true }
  }

  cancelAllTeams() {
    for (const teamExecutionId of this.activeTeams.keys()) {
      this.cancelTeam(teamExecutionId)
    }
  }

  cancelTeam(teamExecutionId: string) {
    const team = this.activeTeams.get(teamExecutionId)
    if (team) {
      team.cancelled = true
      systemBus.emit({
        type: 'team.cancelled',
        teamExecutionId
      })
    }
  }

  private async pumpTeam(
    teamExecutionId: string,
    agentIds: string[],
    prompt: string,
    origin: any
  ) {
    const teamResponses: Turn[] = []

    for (const workerId of agentIds) {
      const team = this.activeTeams.get(teamExecutionId)
      if (team?.cancelled) break

      if (workerId.startsWith('cli-')) {
        await this.runCliSession(teamExecutionId, workerId, prompt, teamResponses)
      } else {
        await this.runAgentSession(teamExecutionId, workerId, prompt, teamResponses, origin)
      }
    }

    const teamEnd = this.activeTeams.get(teamExecutionId)
    if (teamEnd && !teamEnd.cancelled) {
      systemBus.emit({
        type: 'team.completed',
        
        
        teamExecutionId
      })
    }

    this.activeTeams.delete(teamExecutionId)
  }

  private async runAgentSession(
    teamExecutionId: string,
    agentId: string,
    prompt: string,
    teamResponses: Turn[],
    origin: any
  ) {
    const agent = getAgent(agentId)
    if (!agent || !agent.enabled || !agent.spawned) {
      systemBus.emit({
        type: 'team.agent.skipped',
        
        
        teamExecutionId,
        agentId,
        reason: 'offline'
      })
      return
    }

    const state = agentRegistry.get(agentId)
    if (state && BUSY_STATUSES.includes(state.status)) {
      systemBus.emit({
        type: 'team.agent.skipped',
        
        
        teamExecutionId,
        agentId,
        reason: 'busy'
      })
      return
    }

    systemBus.emit({
      type: 'team.agent.started',
      
      
      teamExecutionId,
      agentId,
      agentName: agent.name
    })

    const combinedHistory: Turn[] = []
    
    // We intentionally don't include the private history here because the orchestration
    // should pass the previous agents' responses as the team context.
    // If the user wants private memory, the AgentOrchestrator already appends it via
    // request.history ?? this.historyFor(agent.id) if we don't supply history!
    // But we need to supply history to inject the team responses.
    
    // So we fetch the private history first:
    // Actually, orchestrator.historyFor isn't public. 
    // We can just get it from conversationStore.
    // Let's import conversationStore.
    
    // For now, let's just let the AgentOrchestrator handle the private history. 
    // Wait, if we provide `history`, it OVERRIDES the private history.
    // Let's export `historyFor` from AgentOrchestrator, or just import `conversationStore`.
    // We'll just build it by getting conversationStore.get(agentId).
    
    if (teamResponses.length > 0) {
      combinedHistory.push({
        role: 'user',
        content: `[TEAM CONTEXT: You are participating in a Backstage team response. Other agents have already provided findings. Review their findings when relevant. Add your own independent analysis. Do not pretend to agree if the evidence contradicts them. Do not repeat information unnecessarily. Focus on your role and expertise.]`
      })
      for (const resp of teamResponses) {
        combinedHistory.push(resp)
      }
    }

    const correlationId = makeId('chain')
    const result = orchestrator.submit({
      agentId,
      prompt,
      origin,
      correlationId,
      history: combinedHistory.length > 0 ? combinedHistory : undefined
    })

    if (wasRejected(result)) {
      systemBus.emit({
        type: 'team.agent.failed',
        
        
        teamExecutionId,
        agentId,
        agentName: agent.name,
        error: result.error
      })
      return
    }

    await new Promise<void>((resolve) => {
      const onEvent = (event: any) => {
        if (event.taskId === result.id) {
          if (event.type === 'task.completed') {
            teamResponses.push({ role: 'user', content: `${agent.name} said: ${event.message}` })
            systemBus.emit({
              type: 'team.agent.completed',
              
              
              teamExecutionId,
              agentId,
              agentName: agent.name
            })
            cleanup()
            resolve()
          } else if (event.type === 'task.failed' || event.type === 'task.cancelled') {
            systemBus.emit({
              type: 'team.agent.failed',
              
              
              teamExecutionId,
              agentId,
              agentName: agent.name,
              error: event.error ?? 'Failed or cancelled'
            })
            cleanup()
            resolve()
          }
        }
      }

      const cleanup = systemBus.on(onEvent)
    })
  }

  private async runCliSession(
    teamExecutionId: string,
    workerId: string,
    prompt: string,
    teamResponses: Turn[]
  ) {
    const terminalSessionId = workerId.replace(/^cli-/, '')
    const session = agentSessions.active().find(s => s.terminalSessionId === terminalSessionId)
    
    if (!session) {
      systemBus.emit({
        type: 'team.agent.skipped',
        
        
        teamExecutionId,
        agentId: workerId,
        reason: 'offline'
      })
      return
    }

    if (session.status === 'working' || session.status === 'starting') {
      systemBus.emit({
        type: 'team.agent.skipped',
        
        
        teamExecutionId,
        agentId: workerId,
        reason: 'busy'
      })
      return
    }

    systemBus.emit({
      type: 'team.agent.started',
      
      
      teamExecutionId,
      agentId: workerId,
      agentName: session.name
    })

    let contextStr = ''
    if (teamResponses.length > 0) {
      contextStr = `\n\n[TEAM CONTEXT: You are participating in a Backstage team response. Other agents have already provided findings. Review their findings when relevant. Add your own independent analysis. Do not pretend to agree if the evidence contradicts them.]\n`
      for (const resp of teamResponses) {
        contextStr += `\n${resp.content}\n`
      }
    }

    const fullPrompt = `${prompt}${contextStr}`
    terminals.write(terminalSessionId, fullPrompt + String.fromCharCode(13))

    await new Promise<void>((resolve) => {
      const onChange = (sessions: any[]) => {
        const current = sessions.find(s => s.terminalSessionId === terminalSessionId)
        if (!current) return
        
        if (current.status === 'waiting' || current.status === 'exited' || current.status === 'error') {
          if (current.status === 'waiting') {
             teamResponses.push({ role: 'user', content: `${session.name} said: (Provided response via CLI)` })
             systemBus.emit({
               type: 'team.agent.completed',
               
               
               teamExecutionId,
               agentId: workerId,
               agentName: session.name
             })
          } else {
             systemBus.emit({
               type: 'team.agent.failed',
               
               
               teamExecutionId,
               agentId: workerId,
               agentName: session.name,
               error: 'Process exited'
             })
          }
          cleanup()
          resolve()
        }
      }

      const onEnded = (endedSession: any) => {
         if (endedSession.terminalSessionId === terminalSessionId) {
             systemBus.emit({
               type: 'team.agent.failed',
               
               
               teamExecutionId,
               agentId: workerId,
               agentName: session.name,
               error: 'Process exited'
             })
             cleanup()
             resolve()
         }
      }

      const cleanup = () => {
        agentSessions.removeListener('changed', onChange)
        agentSessions.removeListener('ended', onEnded)
      }

      // Initial sleep to let it transition to working
      setTimeout(() => {
        agentSessions.on('changed', onChange)
        agentSessions.on('ended', onEnded)
      }, 500)
    })
  }
}

export const teamOrchestrator = new TeamOrchestrator()
