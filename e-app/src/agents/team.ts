import { LiveTeamRuntime } from './LiveTeamRuntime'

/**
 * The team.
 *
 * One runtime for the whole workspace, holding what each agent is *doing*.
 * Who each agent *is* lives in the main process and is persisted; this side is
 * told about them at startup and whenever the roster or a runtime state
 * changes.
 *
 * It starts empty on purpose. The office fills up when the user spawns
 * agents — presence is a decision, not a side effect of opening the app.
 */
export const teamRuntime = new LiveTeamRuntime()
