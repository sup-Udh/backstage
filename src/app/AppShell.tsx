import { useBackstage } from '../stores/backstageStore'
import { useTeamSync } from '../agents/useTeamSync'
import { Navbar } from '../components/Navbar/Navbar'
import { ApprovalDock } from '../components/Approvals/ApprovalDock'
import { Home } from '../pages/Home/Home'
import { Agents } from '../pages/Agents/Agents'
import { Automations } from '../pages/Automations/Automations'
import { Account } from '../pages/Account/Account'

const PAGES = {
  home: Home,
  agents: Agents,
  automations: Automations,
  account: Account
} as const

/**
 * The workspace shell.
 *
 * The team's event subscription lives here rather than in a panel, because an
 * agent that is working must keep working — and keep being reported — while
 * the user is on any page. A subscription inside the command centre would go
 * quiet the moment somebody opened the roster.
 */
export function AppShell() {
  const page = useBackstage((s) => s.page)
  const Page = PAGES[page]

  useTeamSync()

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      <Navbar />
      <Page />
      {/* Dangerous tool calls wait here, over whatever page is showing. */}
      <ApprovalDock />
    </div>
  )
}
