import { useBackstage, PROTECTED_VIEWS } from './stores/backstageStore'
import { useAuth, useAuthBridge } from './stores/authStore'
import { useAuthGuard } from './app/useAuthGuard'
import { Landing } from './pages/Landing/Landing'
import { Login } from './pages/Login/Login'
import { AuthBoot } from './pages/Loading/AuthBoot'
import { EnteringWorkspace } from './pages/Loading/EnteringWorkspace'
import { ProjectPicker } from './pages/Setup/ProjectPicker'
import { ProjectSetup } from './pages/Setup/ProjectSetup'
import { AppShell } from './app/AppShell'

/**
 * Six surfaces, in the order you meet them.
 *
 * The landing page you arrive at, signing in, the walk in, choosing which
 * project, creating one, and the project itself. They share one visual
 * language, so moving between them reads as walking between rooms rather than
 * between products.
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

  /*
   * Nothing renders until it is known who, if anyone, is signed in. Not the
   * landing page either: `Landing`'s Get Started button behaves differently
   * for an authenticated user, and showing it a frame early means showing a
   * button that is about to change what it does.
   */
  if (status === 'initialising') return <AuthBoot />

  if (status !== 'authenticated' && PROTECTED_VIEWS.includes(view)) {
    return <Login />
  }

  switch (view) {
    case 'landing':
      return <Landing />
    case 'login':
      /*
       * Someone already signed in has no business on the sign-in page —
       * requirement 14. `useAuthGuard` moves them on the moment the session
       * resolves, so this only ever renders for a frame, and only for a user
       * who genuinely has no account yet.
       */
      return <Login />
    case 'loading':
      return <EnteringWorkspace />
    case 'projects':
      return <ProjectPicker />
    case 'setup':
      return <ProjectSetup />
    default:
      return <AppShell />
  }
}
