import { FakeAgentRuntime } from './fakeAgentRuntime'
import { roster } from './roster'
import { useBackstage } from '../stores/backstageStore'

/**
 * The team.
 *
 * A single runtime for the whole application: the landing page and the
 * workspace look into the same office, and the agents keep working while the
 * user moves between them. It also means the runtime survives every theme
 * change, which is what lets an agent keep its model and its current task
 * while the world around it is replaced.
 */
export const teamRuntime = new FakeAgentRuntime(roster)

/**
 * Wire the runtime's events into the store exactly once. Every event lands in
 * the transcript, the activity feed and the task state through this single
 * path, so the command centre never has to listen to the runtime directly.
 */
teamRuntime.events.subscribe((event) => {
  useBackstage.getState().ingestEvent(event)
})
