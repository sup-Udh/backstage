/**
 * The agent event bus.
 *
 * This is the seam the whole application hangs off. The runtime emits events;
 * the world reacts by moving characters, and the command centre reacts by
 * appending to the transcript and the activity feed. Neither side knows the
 * other exists, which is what stops the chat panel from ever driving an
 * animation directly.
 *
 * When real providers arrive they emit the same events and nothing above
 * this file changes.
 */

export type AgentEventType =
  | 'task.created'
  | 'task.completed'
  | 'task.failed'
  | 'agent.started'
  | 'agent.walking'
  | 'agent.working'
  | 'agent.thinking'
  | 'agent.talking'
  | 'agent.waiting'
  | 'agent.completed'
  | 'agent.failed'
  | 'message.sent'
  | 'message.received'

export interface AgentEvent {
  id: number
  type: AgentEventType
  /** Wall-clock time, so the feed can show a real timestamp. */
  at: number
  agentId?: string
  /** Human-readable line for the activity feed. */
  activity?: string
  /** Spoken line for the transcript, when the agent is saying something. */
  message?: string
  /** Task headline, on task.* events. */
  task?: string
}

export type AgentEventListener = (event: AgentEvent) => void

export class EventBus {
  private listeners = new Set<AgentEventListener>()
  private nextId = 1

  emit(event: Omit<AgentEvent, 'id' | 'at'>): AgentEvent {
    const full: AgentEvent = { ...event, id: this.nextId++, at: Date.now() }
    for (const fn of this.listeners) fn(full)
    return full
  }

  subscribe(fn: AgentEventListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}
