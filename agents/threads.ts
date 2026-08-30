import type { ChatMessage, RuntimeEvent } from './agent.types'
import { getAgent, groupOf, listAgents, threadIdFor, workersOf } from './agentStore'
import { conversationStore } from './conversationStore'
import { systemBus } from './EventBus'
import { makeId } from './persist'
import { orchestrator } from './AgentOrchestrator'
import { markGroupRead } from './groupChats'
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
 * Nothing in a thread is simulated. A user message is submitted to real
 * agents as real tasks on their own queues; agent replies land here because
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

/**
 * Tie a chain of work to a group conversation.
 *
 * Exported because the automation runner needs it too: an automation running
 * on three agents is one chain whose replies belong in their shared thread,
 * and without this they would each land only in a private session the user has
 * no reason to be looking at.
 */
export function rememberChainThread(correlationId: string, threadId: string): void {
  if (!correlationId || !threadId) return
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
  /**
   * The member who leads the others, if any.
   *
   * Carried so the composer can offer "the lead decides who handles this" as a
   * recipient without re-deriving direction in the renderer — and so it offers
   * it only when there genuinely is a lead.
   */
  leadId: string | null
}

/** The group this agent collaborates with, or null if it has no connections. */
export function threadFor(agentId: string): ThreadInfo | null {
  const members = groupOf(agentId)
  if (members.length < 2) return null
  return {
    id: threadIdFor(members),
    members,
    names: members.map((id) => getAgent(id)?.name ?? id),
    leadId: leadWithin(members)
  }
}

/**
 * Who leads this group, if anybody does.
 *
 * Only an agent that leads *every* other member counts. In a chain A→B→C,
 * B leads C but cannot speak for A, so handing B a whole-group message would
 * quietly drop one member — and a recipient control that silently reaches two
 * of three people is worse than not offering the option.
 */
function leadWithin(members: string[]): string | null {
  for (const id of members) {
    const led = new Set(workersOf(id))
    const others = members.filter((m) => m !== id)
    if (others.length > 0 && others.every((m) => led.has(m))) return id
  }
  return null
}

/**
 * Whether this thread id names a real group in the open project.
 *
 * A thread id is derived from its members, so it is guessable by anyone who
 * knows a pair of agent ids — and `loadThread` is reachable over IPC with any
 * string at all. That was harmless while every transcript on the machine
 * belonged to the same person. With accounts it is not: two users who happen
 * to point projects at the same folder share a workspace hash, and without
 * this check one could read the other's group conversation by naming it.
 *
 * The roster it checks against is already scoped to the open project, which is
 * scoped to the signed-in account, so this inherits both filters rather than
 * restating either.
 */
function isKnownThread(threadId: string): boolean {
  if (!threadId) return false
  return listAgents().some((agent) => threadFor(agent.id)?.id === threadId)
}

/** The group a thread id names, or null if it does not name one here. */
export function threadById(threadId: string): ThreadInfo | null {
  if (!threadId) return null
  for (const agent of listAgents()) {
    const thread = threadFor(agent.id)
    if (thread?.id === threadId) return thread
  }
  return null
}

export function loadThread(threadId: string): ChatMessage[] {
  if (!isKnownThread(threadId)) return []
  /*
   * Opening a conversation is reading it. Marking here rather than in a
   * separate call the renderer has to remember to make is what keeps the
   * unread badge honest — there is no path that shows the messages and leaves
   * them counted as unseen.
   */
  markGroupRead(threadId)
  return conversationStore.load(workspaceId(), threadId)
}

export function clearThread(threadId: string): void {
  if (!isKnownThread(threadId)) return
  conversationStore.clear(workspaceId(), threadId)
}

/** Append a line to a group transcript. Used here and by the automation runner. */
export function appendToThread(threadId: string, message: ChatMessage): void {
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
 * The message goes to the chosen recipients as real tasks, sharing one
 * correlation id so their replies can be recognised as part of this
 * conversation. Each agent answers on its own queue with its own model — three
 * agents in a thread is three pieces of work, and merging them into a single
 * reply would be inventing a consensus none of them reached.
 *
 * `recipient` is what the composer's ALL / WALTER / JESSE control sends:
 *
 *   'all'      every spawned member answers, independently  (the default)
 *   'lead'     only the member who leads the rest, who may then delegate
 *   <agentId>  one member, in the group's own conversation rather than in DM
 *
 * The last of those is the one worth being precise about: it is still a group
 * message. Everyone in the thread sees it and sees the answer — it just says
 * who it is for, which is how a person addresses one member of a group chat.
 */
export function postToThread(
  agentId: string,
  prompt: string,
  recipient: string = 'all'
): PostResult {
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

  let addressed = spawned
  if (recipient === 'lead') {
    if (!thread.leadId || !spawned.includes(thread.leadId)) {
      return { accepted: false, error: 'This group has no lead who can take it on.' }
    }
    addressed = [thread.leadId]
  } else if (recipient !== 'all') {
    if (!thread.members.includes(recipient)) {
      return { accepted: false, error: 'That agent is not in this group.' }
    }
    if (!spawned.includes(recipient)) {
      const name = getAgent(recipient)?.name ?? 'That agent'
      return { accepted: false, error: `${name} is not spawned.` }
    }
    addressed = [recipient]
  }

  const { tasks, errors } = orchestrator.broadcast(addressed, text, 'user')
  if (tasks.length === 0) {
    return {
      accepted: false,
      error: errors[0]?.error ?? 'Could not start that.',
      rejected: errors
    }
  }

  rememberChainThread(tasks[0].correlationId, thread.id)

  const to =
    recipient === 'all'
      ? null
      : (getAgent(addressed[0])?.name ?? null)

  appendToThread(thread.id, {
    id: makeId('msg'),
    kind: 'user',
    agentId: thread.id,
    // Addressed messages carry who they were for, so the transcript reads the
    // way the conversation actually went rather than as an unattributed line.
    text: to ? `@${to} ${text}` : text,
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
      appendToThread(threadId, {
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

    /*
     * A failure belongs in the thread too.
     *
     * The conversation is the record of what the team did, and "Jesse could
     * not finish" is part of that record. Leaving it out was what made a
     * failed member look like a member who had simply not answered yet — and
     * the group would sit at WORKING with nothing coming.
     */
    if (event.type === 'agent.failed' && event.message) {
      const threadId = event.correlationId
        ? chainThreads.get(event.correlationId)
        : undefined
      if (!threadId) return
      appendToThread(threadId, {
        id: event.id,
        kind: 'system',
        agentId,
        fromAgentId: agentId,
        fromName: event.agentName ?? getAgent(agentId)?.name ?? agentId,
        text: `Could not finish: ${event.message}`,
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
      appendToThread(thread.id, {
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
