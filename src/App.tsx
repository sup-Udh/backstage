import { useBackstage, PROTECTED_VIEWS, PUBLIC_VIEWS } from './stores/backstageStore'
import { useAuth, useAuthBridge } from './stores/authStore'
import { useAppearanceBridge } from './stores/appearanceStore'
import { useAuthGuard } from './app/useAuthGuard'
import { StartScreen } from './pages/Start/StartScreen'
import { Login } from './pages/Login/Login'
import { AuthBoot } from './pages/Loading/AuthBoot'
import { EnteringWorkspace } from './pages/Loading/EnteringWorkspace'
import { ProviderOnboarding } from './pages/Onboarding/ProviderOnboarding'
import { ProjectPicker } from './pages/Setup/ProjectPicker'
import { ProjectSetup } from './pages/Setup/ProjectSetup'
import { AppShell } from './app/AppShell'

/**
 * Six surfaces, in the order you meet them.
 *
 * The start screen, signing in, the walk in, choosing which project, creating
 * one, and the project itself. They share one visual language, so moving between them reads
 * as walking between rooms rather than between products.
 *
 * The middle ones are view states rather than routes because there is nothing
 * to route to yet: until a project is open there is no workspace, no roster and
 * no theme for a page to render, and every scoped read in the main process
 * would correctly answer with nothing.
 *
 * ---------------------------------------------------------------------------
 *
 * This component is also the route guard, and it is worth being explicit about
 * what it does and does not promise.
 *
 * It promises that no protected surface is ever *rendered* without an account:
 * the check runs before the switch, so there is no path through this function
 * that reaches `AppShell` while the status is anything but `authenticated`.
 * That is what makes back-navigation to the dashboard after a sign-out land on
 * the login page.
 *
 * It promises the same in the other direction, and that half is new. A signed
 * in user never sees Home or the login page, not even for a frame — which is
 * the difference between requirement 41 being satisfied and being *nearly*
 * satisfied. `useAuthGuard` moves the view, but effects run after paint, so a
 * guard that lived only in the effect would let one frame of Home through on
 * every launch of an authenticated session. The check below happens during
 * render, so that frame does not exist.
 *
 * It does not promise that the data is safe, and it must not be relied on for
 * that. There are two layers underneath it that do:
 *
 *   the main process   every scoped read resolves through the open project,
 *                      which resolves through the signed-in account — so a
 *                      logged-out renderer that somehow asked for a roster
 *                      would be handed an empty list rather than a team
 *   row level security the database refuses rows belonging to another
 *                      `auth.uid()`, against a client it does not trust at all
 *
 * A guard in the renderer is a guard inside the thing being guarded. It exists
 * so the interface is coherent, not so the data is private.
 */
export default function App() {
  const view = useBackstage((s) => s.view)
  const status = useAuth((s) => s.status)

  // Subscribe to the main process's auth state, above every guard — so a
  // session that expires while the dashboard is open takes the user out of it.
  useAuthBridge()
  // And tear the previous account's state down when it does.
  useAuthGuard()
  // Light or dark, following the desktop unless the user has chosen.
  useAppearanceBridge()

  /*
   * Nothing renders until it is known who, if anyone, is signed in. Not Home
   * either: its primary action behaves differently for an authenticated user,
   * and showing it a frame early means showing a button that is about to
   * change what it does.
   */
  if (status === 'initialising') return <AuthBoot />

  if (status !== 'authenticated' && PROTECTED_VIEWS.includes(view)) {
    return <Login />
  }

  /*
   * The reverse guard, held for exactly as long as the effect takes to move
   * the view — a single tick. The startup screen is the honest thing to show
   * in that tick: the session has resolved and initialisation is what happens
   * next, so it is not a placeholder standing in for a decision, it is the
   * decision.
   */
  if (status === 'authenticated' && PUBLIC_VIEWS.includes(view)) {
    return <AuthBoot />
  }

  switch (view) {
    case 'landing':
      return <StartScreen />
    case 'login':
      return <Login />
    case 'loading':
      return <EnteringWorkspace />
    case 'onboarding':
      return <ProviderOnboarding />
    case 'projects':
      return <ProjectPicker />
    case 'setup':
      return <ProjectSetup />
    default:
      return <AppShell />
  }
}
