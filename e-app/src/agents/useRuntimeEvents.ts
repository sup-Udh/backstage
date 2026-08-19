import { useEffect } from 'react'
import { teamRuntime } from './team'
import { useBackstage } from '../stores/backstageStore'
import type { AgentRuntimeEvent } from '../shared/providerApi'

/**
 * The bridge from the main-process agent runtime into the renderer.
 *
 * Main owns the provider and the tool loop; this side owns bodies in a room
 * and text on a screen. Every event goes to both:
 *
 *   - the team runtime, which spawns, moves and despawns characters
 *   - the store, which appends to the transcript and the activity feed
 *
 * Because both react to the same event stream, a task run by OpenAI, by Gemini
 * or by the simulation produces identical behaviour in the world.
 */
export function useRuntimeEvents(): void {
  const ingestEvent = useBackstage((s) => s.ingestEvent)

  useEffect(() => {
    if (!window.backstage?.agents) return

    return window.backstage.agents.onEvent((event: AgentRuntimeEvent) => {
      teamRuntime.applyRuntimeEvent(event)

      // The store speaks the fake runtime's event shape, which is a superset
      // of what main emits; ids only need to be unique within the session.
      ingestEvent({
        id: nextId++,
        type: event.type as never,
        at: event.at,
        agentId: event.agentId,
        // The runtime already knows the configured name, so the feed does not
        // have to resolve it and cannot disagree with the transcript.
        agentName: event.agentName,
        activity: event.activity,
        message: event.message,
        task: event.task
      })
    })
  }, [ingestEvent])
}

let nextId = 1_000_000
