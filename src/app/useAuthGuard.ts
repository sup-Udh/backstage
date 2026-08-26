import { useEffect } from 'react'
import { useAuth } from '../stores/authStore'
import { useBackstage } from '../stores/backstageStore'
import { useProject } from '../stores/projectStore'
import { useTeam } from '../stores/teamStore'

/**
 * Keep the application's view in step with who is signed in.
 *
 * Route protection has two halves and this is the active one. `App` refuses to
 * *render* a protected view without an account, which handles the frame the
 * user is looking at; this handles the transition, so the state behind that
 * frame is torn down rather than left sitting in memory behind a guard.
 *
 * The distinction matters for the back-navigation test in requirement 16. A
 * guard that only chooses a component leaves the previous account's
 * transcripts, roster and open project in the stores — one bug in a future
 * guard, and they are on screen again. Clearing them means there is nothing
 * left to leak even if the guard is wrong.
 *
 * It lives outside `authStore` because it reaches into three other stores, and
 * a store that drives the whole application's navigation on a state change is
 * no longer a mirror of the main process — which is the one thing `authStore`
 * is meant to be.
 */
export function useAuthGuard(): void {
  const status = useAuth((s) => s.status)

  useEffect(() => {
    /*
     * Signing in from the login page carries straight on into the app, rather
     * than leaving the user looking at the button they just used. The walk-in
     * screen is the next step for the same reason it always was: the project
     * registry still has to be read and a project still has to be chosen.
     */
    if (status === 'authenticated') {
      if (useBackstage.getState().view === 'login') {
        useBackstage.setState({ view: 'loading' })
      }
      return
    }

    if (status !== 'unauthenticated') return

    const { view, resetForSignOut } = useBackstage.getState()

    /*
     * Only act on a *departure* from an authenticated surface. Without this,
     * a user sitting on the landing page while signed out would be shoved to
     * the login page on every re-render of this effect — the landing page is
     * public, and requirement 14 keeps it that way.
     */
    if (view === 'landing' || view === 'login') return

    resetForSignOut()

    /*
     * The project and roster mirrors, which are the two stores holding actual
     * account data. The main process has already closed the project and
     * cleared the workspace on its side; these are the renderer's copies, and
     * a copy nobody clears is a copy that is still readable.
     */
    useProject.setState({
      project: null,
      projects: [],
      legacy: null,
      loaded: false,
      switching: false
    })
    useTeam.setState({
      agents: [],
      triggers: [],
      validations: {},
      tasks: [],
      busy: null,
      loaded: false
    })
  }, [status])
}
