import { EventEmitter } from 'node:events'
import type { RuntimeEvent } from './agent.types'

/**
 * Central Event Bus (Phase 11)
 *
 * Routes all runtime events between components. The UI IPC bridge,
 * Trigger Engine, and other system components can subscribe here.
 */
class EventBus extends EventEmitter {
  emitEvent(event: RuntimeEvent): void {
    this.emit('event', event)
  }

  onEvent(handler: (event: RuntimeEvent) => void): void {
    this.on('event', handler)
  }
}

export const systemBus = new EventBus()
