import { useBackstage } from './stores/backstageStore'
import { Landing } from './pages/Landing/Landing'
import { EnteringWorkspace } from './pages/Loading/EnteringWorkspace'
import { ProjectSetup } from './pages/Setup/ProjectSetup'
import { AppShell } from './app/AppShell'

/**
 * Four surfaces, in the order you meet them.
 *
 * The landing page you arrive at, the walk in, choosing a project, and the
 * project itself. They share one visual language, so moving between them reads
 * as walking between rooms rather than between products.
 *
 * The middle two are view states rather than routes because there is nothing
 * to route to yet: until a project exists there is no workspace, no roster and
 * no theme for a page to render, and every scoped read in the main process
 * would correctly answer with nothing.
 */
export default function App() {
  const view = useBackstage((s) => s.view)

  switch (view) {
    case 'landing':
      return <Landing />
    case 'loading':
      return <EnteringWorkspace />
    case 'setup':
      return <ProjectSetup />
    default:
      return <AppShell />
  }
}
