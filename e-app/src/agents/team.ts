import { FakeAgentRuntime } from './fakeAgentRuntime'
import { useBackstage } from '../stores/backstageStore'

/**
 * The team.
 *
 * One runtime for the whole application, holding what each agent is *doing*.
 * Who each agent *is* lives in the main process and is persisted; this side is
 * told about them at startup and whenever the roster changes.
 *
 * It starts empty on purpose: the office fills up as agents are given work,
 * and they stay once they have arrived.
 */
export const teamRuntime = new FakeAgentRuntime([])

/**
 * Wire the runtime's events into the store exactly once. Every event lands in
 * the transcript, the activity feed and the task state through this single
 * path, so the command centre never has to listen to the runtime directly.
 */
teamRuntime.events.subscribe((event) => {
  useBackstage.getState().ingestEvent(event)
})
