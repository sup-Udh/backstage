import { useBackstage } from '../stores/backstageStore'
import { Navbar } from '../components/Navbar/Navbar'
import { Home } from '../pages/Home/Home'
import { Cases } from '../pages/Cases/Cases'
import { Agents } from '../pages/Agents/Agents'
import { Themes } from '../pages/Themes/Themes'
import { Account } from '../pages/Account/Account'

/**
 * The workspace shell: a fixed navigation bar over a single page region.
 *
 * Routing is store state rather than a router library. This is a single-window
 * desktop app with five destinations and no URLs to honour, so a router would
 * add a dependency and a history model nothing here needs.
 */
const PAGES = {
  home: Home,
  cases: Cases,
  agents: Agents,
  themes: Themes,
  account: Account
} as const

export function AppShell() {
  const page = useBackstage((s) => s.page)
  const Page = PAGES[page]

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      <Navbar />
      <Page />
    </div>
  )
}
