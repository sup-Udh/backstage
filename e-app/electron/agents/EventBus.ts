import type { RuntimeEvent, RuntimeEventType } from './agent.types'
import { makeId } from './persist'

/**
 * The central event bus.
 *
 * Everything that happens in the workspace passes through here exactly once:
 * task lifecycle, tool calls, file changes, terminal sessions, agent-to-agent
 * messages. The IPC bridge, the trigger engine and the awareness layer are all
 * subscribers, which is what keeps them from having to know about each other.
 *
 * It also keeps a bounded tail of recent events. That tail is what makes
 * shared awareness possible without asking agents to store history themselves,
 * and the bound is what stops a long session turning the bus into a memory
 * leak.
 */

const HISTORY_LIMIT = 400

type Handler = (event: RuntimeEvent) => void

class EventBus {
  private handlers = new Set<Handler>()
  private history: RuntimeEvent[] = []

  /**
   * Publish. The id and timestamp are stamped here rather than by callers, so
   * every event is uniquely identifiable and no two consumers can disagree
   * about when something happened.
   */
  emit(event: Omit<RuntimeEvent, 'id' | 'at'> & { at?: number }): RuntimeEvent {
    const full: RuntimeEvent = {
      ...event,
      id: makeId('evt'),
      at: event.at ?? Date.now()
    }

    this.history.push(full)
    if (this.history.length > HISTORY_LIMIT) {
      this.history.splice(0, this.history.length - HISTORY_LIMIT)
    }

    for (const handler of this.handlers) {
      try {
        handler(full)
      } catch {
        // One bad subscriber must not stop the others from being told.
      }
    }
    return full
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /** Recent events, newest last. Optionally filtered. */
  recent(
    limit = 40,
    filter?: { agentId?: string; types?: RuntimeEventType[] }
  ): RuntimeEvent[] {
    let list = this.history
    if (filter?.agentId) {
      const id = filter.agentId
      list = list.filter((e) => e.agentId === id || e.targetAgentId === id)
    }
    if (filter?.types && filter.types.length > 0) {
      const wanted = new Set(filter.types)
      list = list.filter((e) => wanted.has(e.type))
    }
    return list.slice(-limit)
  }

  /** How many events of a type share a correlation id. Used for loop caps. */
  countInChain(correlationId: string, types: RuntimeEventType[]): number {
    const wanted = new Set(types)
    let n = 0
    for (const e of this.history) {
      if (e.correlationId === correlationId && wanted.has(e.type)) n++
    }
    return n
  }
}

export const systemBus = new EventBus()

/** Kept for the existing call sites that used the older method names. */
export type { RuntimeEvent }
