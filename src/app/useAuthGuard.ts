import { useEffect } from 'react'
import { useAuth } from '../stores/authStore'
import { useBackstage, PUBLIC_VIEWS } from '../stores/backstageStore'
import { useProject } from '../stores/projectStore'
import { useTeam } from '../stores/teamStore'

/**
 * Keep the application's view in step with who is signed in.
 *
 * Route protection has two halves and this is the active one. `App` refuses to
 * *render* the wrong surface for the current session, which handles the frame
 * the user is looking at; this handles the transition, so the state behind that
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
  /*
   * The view is a dependency, not just a read.
   *
   * Without it this only fired when the session changed, which was enough for
   * "signing in carries on into the app" and not enough for anything else: an
   * authenticated user who arrived at Home by any route other than a fresh
   * launch simply stayed there, because nothing about the session had changed
   * to wake the effect up. Watching the view is what makes the rule a rule
   * rather than a one-off redirect.
   */
  const view = useBackstage((s) => s.view)

  useEffect(() => {
    /*
     * Signed in, and looking at a surface for people who are not.
     *
     * Home explains the product and offers a way in; the login page is that
     * way in. Neither has anything to say to somebody who already has a
     * session, so both hand straight over to initialisation, which reads the
     * project registry and leaves the user at their projects. That is
     * requirement 18's "launch, splash, projects" and requirement 36's "a
     * signed-in user who visits Home is redirected", and they are the same
     * rule seen from two directions.
     *
     * `loading` is the destination rather than `projects` because the project
     * registry has not been read yet. Jumping straight to the picker would
     * show an empty list to a user who has five projects, for as long as the
     * disk takes to answer.
     */
    if (status === 'authenticated') {
      if (PUBLIC_VIEWS.includes(view)) {
        useBackstage.setState({ view: 'loading' })
      }
      return
    }

    if (status !== 'unauthenticated') return

    const { resetForSignOut } = useBackstage.getState()

    /*
     * Only act on a *departure* from an authenticated surface. Without this,
     * a user sitting on Home while signed out would be shoved to the login
     * page on every re-render of this effect — Home is public, and
     * requirement 14 keeps it that way.
     */
    if (PUBLIC_VIEWS.includes(view)) return

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
  }, [status, view])
}
