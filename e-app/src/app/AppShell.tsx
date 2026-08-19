import { useBackstage } from '../stores/backstageStore'
import { Navbar } from '../components/Navbar/Navbar'
import { Home } from '../pages/Home/Home'
import { Cases } from '../pages/Cases/Cases'
import { Agents } from '../pages/Agents/Agents'
import { Themes } from '../pages/Themes/Themes'
import { Account } from '../pages/Account/Account'


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
