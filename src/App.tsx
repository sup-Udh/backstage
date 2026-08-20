import { useBackstage } from './stores/backstageStore'
import { Landing } from './pages/Landing/Landing'
import { EnteringWorkspace } from './pages/Loading/EnteringWorkspace'
import { ProjectPicker } from './pages/Setup/ProjectPicker'
import { ProjectSetup } from './pages/Setup/ProjectSetup'
import { AppShell } from './app/AppShell'

/**
 * Five surfaces, in the order you meet them.
 *
 * The landing page you arrive at, the walk in, choosing which project, creating
 * one, and the project itself. They share one visual language, so moving
 * between them reads as walking between rooms rather than between products.
 *
 * The middle three are view states rather than routes because there is nothing
 * to route to yet: until a project is open there is no workspace, no roster and
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
    case 'projects':
      return <ProjectPicker />
    case 'setup':
      return <ProjectSetup />
    default:
      return <AppShell />
  }
}
