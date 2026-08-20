import type { Agent, AgentStatus } from './agent.types'
import type { AgentEventType } from './agentEvents'

/**
 * The demo timeline.
 *
 * A submitted prompt plays out as a fixed sequence of beats rather than as
 * random activity, so the user can watch a task actually progress: someone
 * takes it, thinks, sits down and works, a second agent joins, they confer,
 * and a result comes back.
 *
 * Walking is deliberately absent from this list. The director produces it on
 * its own whenever a status change implies a new destination, so a beat only
 * has to say *what* an agent is doing and the walk to get there is free.
 */
export interface Beat {
  /** Seconds from task start. */
  at: number
  type: AgentEventType
  agentId?: string
  status?: AgentStatus
  /** Task line shown on the agent's own hover card. */
  agentTask?: string
  /** Line for the activity feed. */
  activity?: string
  /** Line for the transcript, spoken by `agentId`. */
  message?: string
  /** Task headline, on task.* events. */
  task?: string
}

/** Trim a prompt down to something that reads as a case title. */
function toTitle(prompt: string): string {
  const clean = prompt.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/, '')
  if (clean.length <= 46) return clean
  return clean.slice(0, 45).trimEnd() + '…'
}

/**
 * Build the timeline for a prompt. The cast is whoever the runtime has, so
 * this works for any roster without knowing who the agents are.
 */
export function buildTaskScript(prompt: string, agents: Agent[]): Beat[] {
  const lead = agents[0]?.id
  // The newest arrival takes the second seat, so the agent who just walked in
  // is the one the user sees joining the case.
  const second = agents.length > 1 ? agents[agents.length - 1].id : undefined
  const title = toTitle(prompt)

  const beats: Beat[] = [
    {
      at: 0,
      type: 'task.created',
      task: title,
      activity: `Task received: ${title}`
    },
    {
      at: 0.5,
      type: 'agent.thinking',
      agentId: lead,
      status: 'thinking',
      agentTask: 'Framing the problem',
      activity: 'Started reading the brief.',
      message: 'Taking this one. Let me see what we are dealing with.'
    },
    {
      at: 2.2,
      type: 'agent.working',
      agentId: lead,
      status: 'working',
      agentTask: title,
      activity: 'Opened the project files.'
    },
    {
      at: 4.2,
      type: 'agent.started',
      agentId: second,
      status: 'working',
      agentTask: 'Cross-checking the call graph',
      activity: 'Joined the investigation.'
    },
    {
      at: 5.4,
      type: 'message.sent',
      agentId: second,
      message: 'I am seeing the same pattern in the API layer.'
    },
    {
      at: 7,
      type: 'agent.talking',
      agentId: lead,
      status: 'talking',
      agentTask: 'Comparing findings',
      activity: 'Comparing findings.',
      message: 'Then it is not local. Let us trace it back to the source.'
    },
    {
      at: 7.2,
      type: 'agent.talking',
      agentId: second,
      status: 'talking',
      agentTask: 'Comparing findings'
    },
    {
      at: 9,
      type: 'agent.completed',
      agentId: lead,
      status: 'success',
      agentTask: 'Done',
      activity: 'Investigation complete.',
      message:
        'Found it. The authentication flow refreshes the token after it validates it, so an expired session passes once before it fails.'
    },
    {
      at: 10.4,
      type: 'task.completed',
      task: title,
      activity: 'Task closed.'
    }
  ]

  // A one-agent roster would otherwise emit beats for an undefined partner.
  return beats.filter((b) => b.agentId !== undefined || b.type.startsWith('task.'))
}
