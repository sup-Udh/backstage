import type { CollaborationMessage } from './agent.types'

/**
 * The agent-to-agent message log.
 *
 * Separate from conversation memory on purpose. What Jane said to Michael is
 * shared team activity: both of them see it, and so does the user. What Jane
 * said to the user is Jane's private conversation, and Michael has no business
 * reading it. Keeping the two in different stores is what makes that
 * distinction enforceable rather than merely intended.
 *
 * In memory and bounded, like the task ledger — this is a record of a session,
 * not an archive.
 */

const LIMIT = 400

const messages: CollaborationMessage[] = []

export function recordCollaboration(message: CollaborationMessage): CollaborationMessage {
  messages.push(message)
  if (messages.length > LIMIT) messages.splice(0, messages.length - LIMIT)
  return message
}

/** Newest last. Filtered to one agent's side of the conversation when asked. */
export function listCollaboration(limit = 60, agentId?: string): CollaborationMessage[] {
  const scoped = agentId
    ? messages.filter(
        (m) => m.senderAgentId === agentId || m.receiverAgentId === agentId
      )
    : messages
  return scoped.slice(-limit)
}

/** How many automatic messages one originating request has produced so far. */
export function chainMessageCount(correlationId: string): number {
  let n = 0
  for (const m of messages) if (m.correlationId === correlationId) n++
  return n
}

/**
 * Whether this exact message has already gone from this sender to this
 * receiver within this chain. Catches the ping-pong the depth counter misses.
 */
export function isRepeat(
  correlationId: string,
  senderAgentId: string,
  receiverAgentId: string,
  message: string
): boolean {
  const needle = message.trim().slice(0, 400).toLowerCase()
  return messages.some(
    (m) =>
      m.correlationId === correlationId &&
      m.senderAgentId === senderAgentId &&
      m.receiverAgentId === receiverAgentId &&
      m.message.trim().slice(0, 400).toLowerCase() === needle
  )
}
