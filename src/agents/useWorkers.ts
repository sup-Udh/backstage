import { useMemo } from 'react'
import { useBackstage } from '../stores/backstageStore'
import { useTeam } from '../stores/teamStore'
import { getTheme } from '../themes'
import { buildWorkers, type Worker } from './workers'

/**
 * Everything that can do work, right now.
 *
 * One hook, one projection, every surface. The alternative — each panel
 * deriving its own list — is what previously left the selector unaware of CLI
 * sessions while the world was already drawing them, and it is the kind of
 * disagreement that cannot be fixed by fixing one component.
 *
 * Every input is already a store mirrored from the main process, so this adds
 * no state and cannot go stale: when a session starts or an agent finishes,
 * the store updates and this recomputes.
 */
export function useWorkers(): Worker[] {
  const agents = useTeam((s) => s.agents)
  const states = useBackstage((s) => s.agentStates)
  const sessions = useBackstage((s) => s.agentSessions)
  const providers = useBackstage((s) => s.providers)
  const themeId = useBackstage((s) => s.themeId)

  return useMemo(
    () =>
      buildWorkers({
        agents,
        states,
        sessions,
        providers,
        theme: getTheme(themeId)
      }),
    [agents, states, sessions, providers, themeId]
  )
}
