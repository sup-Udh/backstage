import type { ChatMessage, RuntimeEvent } from './agent.types'
import { getAgent, groupOf, threadIdFor } from './agentStore'
import { conversationStore } from './conversationStore'
import { systemBus } from './EventBus'
import { makeId } from './persist'
import { orchestrator } from './AgentOrchestrator'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'

/**
 * Shared conversations between connected agents.
 *
 * A thread belongs to a *group* — the set of agents reachable through
 * connections — and is entirely separate from any of their private
 * conversations with the user. That separation is the point: Jane's own
 * session is Jane's, and nothing said there leaks into the thread she shares
 * with Lisbon unless the user deliberately posts it there.
 *
 * There is no second storage system here. A thread is stored through the same
 * conversation store every agent uses, under a synthetic id derived from its
 * members, so it gets the same per-workspace scoping, trimming and
 * persistence for free.
 *
 * Nothing in a thread is simulated. A user message is submitted to every
 * member as a real task on their own queue; agent replies land here because
 * the runtime reported them; agent-to-agent lines land here because those
 * agents genuinely messaged each other.
 */

/**
 * Which thread a chain of work belongs to.
 *
 * The orchestrator gives every task descended from one request a shared
 * correlation id, which is exactly the thing needed to recognise a reply as
 * belonging to a thread rather than to the agent's private session. Held in
 * memory only: a chain does not outlive the run that started it.
 */
const chainThreads = new Map<string, string>()

/** Cap, so a long session cannot grow this map without bound. */
const MAX_CHAINS = 500

function remember(correlationId: string, threadId: string): void {
  if (chainThreads.size >= MAX_CHAINS) {
    const oldest = chainThreads.keys().next().value
    if (oldest !== undefined) chainThreads.delete(oldest)
  }
  chainThreads.set(correlationId, threadId)
}

function workspaceId(): string {
  return getWorkspaceRoot() ?? 'no-workspace'
}

export interface ThreadInfo {
  id: string
  members: string[]
  /** Display names, resolved so the renderer does not have to. */
  names: string[]
}

/** The group this agent collaborates with, or null if it has no connections. */
export function threadFor(agentId: string): ThreadInfo | null {
  const members = groupOf(agentId)
  if (members.length < 2) return null
  return {
    id: threadIdFor(members),
    members,
    names: members.map((id) => getAgent(id)?.name ?? id)
  }
}

export function loadThread(threadId: string): ChatMessage[] {
  return conversationStore.load(workspaceId(), threadId)
}

export function clearThread(threadId: string): void {
  conversationStore.clear(workspaceId(), threadId)
}

function append(threadId: string, message: ChatMessage): void {
  conversationStore.append(workspaceId(), threadId, message)
}

export interface PostResult {
  accepted: boolean
  error?: string
  rejected?: { agentId: string; error: string }[]
}

/**
 * Post into a group thread.
 *
 * The message goes to every member as a real task, sharing one correlation id
 * so their replies can be recognised as part of this conversation. Each agent
 * answers on its own queue with its own model — three agents in a thread is
 * three pieces of work, and merging them into a single reply would be
 * inventing a consensus none of them reached.
 */
export function postToThread(agentId: string, prompt: string): PostResult {
  const thread = threadFor(agentId)
  if (!thread) {
    return { accepted: false, error: 'That agent is not connected to anyone.' }
  }

  const text = prompt.trim()
  if (!text) return { accepted: false, error: 'Empty message.' }

  const spawned = thread.members.filter((id) => {
    const agent = getAgent(id)
    return agent?.enabled && agent.spawned
  })
  if (spawned.length === 0) {
    return { accepted: false, error: 'Nobody in this group is spawned.' }
  }

  const { tasks, errors } = orchestrator.broadcast(spawned, text, 'user')
  if (tasks.length === 0) {
    return {
      accepted: false,
      error: errors[0]?.error ?? 'Could not start that.',
      rejected: errors
    }
  }

  remember(tasks[0].correlationId, thread.id)

  append(thread.id, {
    id: makeId('msg'),
    kind: 'user',
    agentId: thread.id,
    text,
    at: Date.now()
  })

  return { accepted: true, rejected: errors }
}

/**
 * Fold runtime events into thread transcripts.
 *
 * Two kinds of line belong in a thread: an answer to something posted here,
 * recognised by its correlation id; and a message one member sent another,
 * which belongs here whatever prompted it — that is the collaboration the
 * thread exists to show.
 *
 * A reply to a private question the user asked Jane directly is deliberately
 * not included. It shares no correlation id with this thread, and Jane's
 * private session staying private is the guarantee the whole separation
 * rests on.
 */
export function initThreads(): void {
  systemBus.on((event: RuntimeEvent) => {
    const agentId = event.agentId
    if (!agentId) return

    if (event.type === 'agent.completed' && event.message) {
      const threadId = event.correlationId
        ? chainThreads.get(event.correlationId)
        : undefined
      if (!threadId) return
      append(threadId, {
        id: event.id,
        kind: 'agent',
        agentId,
        fromAgentId: agentId,
        fromName: event.agentName ?? getAgent(agentId)?.name ?? agentId,
        text: event.message,
        at: event.at,
        taskId: event.taskId
      })
      return
    }

    if (
      (event.type === 'agent.delegated' || event.type === 'agent.message.sent') &&
      event.targetAgentId &&
      event.message
    ) {
      /*
       * Only when both ends are actually in the same group. Two agents can be
       * permitted to talk without being a group — a one-way trigger route,
       * for instance — and that exchange is team activity, not this thread's
       * conversation.
       */
      const thread = threadFor(agentId)
      if (!thread || !thread.members.includes(event.targetAgentId)) return

      /*
       * Stored against the *receiver*, with the sender in `fromName`. That is
       * the shape the transcript renders as "Jane → Lisbon", and it means a
       * collaboration line resolves to two real agents rather than to the
       * thread itself, which has no character and no name of its own.
       */
      append(thread.id, {
        id: event.id,
        kind: 'collaboration',
        agentId: event.targetAgentId,
        fromAgentId: agentId,
        fromName: event.agentName ?? getAgent(agentId)?.name ?? agentId,
        text: event.message,
        at: event.at,
        taskId: event.taskId
      })
    }
  })
}
