import { useBackstage } from './stores/backstageStore'
import { Landing } from './pages/Landing/Landing'
import { AppShell } from './app/AppShell'

/**
 * Two surfaces: the landing page you arrive at, and the workspace you enter.
 * They share one team runtime and one theme, so walking between them is
 * walking between rooms rather than between products.
 */
export default function App() {
  const view = useBackstage((s) => s.view)
  return view === 'landing' ? <Landing /> : <AppShell />
}
