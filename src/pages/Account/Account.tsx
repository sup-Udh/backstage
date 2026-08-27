import { useProviders } from '../../providers/useProviders'
import { useBackstage, type AccountSection } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import { ClaudeCard } from '../../claude/ClaudeCard'
import { AccountPanel } from './AccountPanel'
import { DangerZone } from './DangerZone'
import { ProfileSection } from './ProfileSection'
import { ProjectsSection } from './ProjectsSection'
import { ProviderPanel } from './ProviderPanel'
import { RosterSection } from './RosterSection'

/**
 * Settings.
 *
 * Five sections behind one nav, rather than the single scrolling column this
 * page used to be. That column had the account, the project, the world and
 * every provider stacked on it, and finding the thing you came for meant
 * scrolling past four things you did not.
 *
 * The split follows what each thing *belongs to*, which is also the data
 * model:
 *
 *   Profile       the account          — you
 *   AI Providers  the account          — your credentials, on this machine
 *   Agents        the open project     — this project's team
 *   Projects      the account, and     — everything you own, plus the settings
 *                 the open project       of the one you are in
 *   Account       the account          — sync, sign out, deletion
 *
 * Nothing here can show another user's anything, and not because this file is
 * careful: every read it makes is already scoped in the main process, through
 * the open project, through the signed-in account.
 */

/*
 * The section list, and the section itself, are now separate concerns.
 *
 * Which section is open lives in the application store rather than in this
 * component, because the account menu opens Settings *at* a section — "API
 * keys" has to land on the providers panel. The labels stay here, beside the
 * panels they name.
 */
const SECTIONS: { id: AccountSection; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'providers', label: 'AI Providers' },
  { id: 'agents', label: 'Agents' },
  { id: 'projects', label: 'Projects' },
  { id: 'account', label: 'Account' }
]

export function Account() {
  const section = useBackstage((s) => s.accountSection)
  const setSection = useBackstage((s) => s.setAccountSection)

  const {
    descriptors,
    statuses,
    busy,
    results,
    connect,
    test,
    disconnect,
    selectModel
  } = useProviders()

  const agents = useTeam((s) => s.agents)

  /** How many agents each provider is currently answering for. */
  const usedBy = (providerId: string) =>
    agents.filter((a) => a.providerId === providerId).length

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-cream px-6 py-8 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <h1 className="font-ui text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.04em] text-ink">
          Settings
        </h1>

        {/*
          The nav is a horizontal strip rather than a sidebar. Backstage runs
          in a window a user may make narrow, and a sidebar is the first thing
          to break when they do — this wraps instead of overflowing, and costs
          no horizontal space on a small window.
        */}
        <nav
          aria-label="Settings sections"
          className="mt-6 flex flex-wrap gap-1 border-b-[3px] border-ink"
        >
          {SECTIONS.map((item) => {
            const active = item.id === section
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setSection(item.id)}
                className={[
                  'relative px-3 py-2 font-ui text-sm font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep',
                  active ? 'text-ink' : 'text-ink-3 hover:text-ink'
                ].join(' ')}
              >
                {item.label}
                <span
                  aria-hidden
                  className={`absolute inset-x-2 -bottom-[3px] h-[3px] ${
                    active ? 'bg-brand' : 'bg-transparent'
                  }`}
                />
              </button>
            )
          })}
        </nav>

        <div className="mt-8 pb-4">
          {section === 'profile' && <ProfileSection />}

          {section === 'providers' && (
            <section>
              <h2 className="mb-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
                AI Providers
              </h2>
              <p className="mb-4 max-w-[620px] font-ui text-[13px] leading-snug text-ink-3">
                Your agents run on your own provider accounts. Keys are
                encrypted by your operating system, stored on this machine under
                your Backstage account, and never shown back to you in full —
                not even to you.
              </p>

              {/*
                Said plainly, because it is the thing a user on a shared
                machine most needs to know and would otherwise have to infer.
              */}
              <p className="mb-6 max-w-[620px] border-2 border-rule bg-paper px-3 py-2 font-ui text-[12px] leading-snug text-ink-3">
                These credentials belong to your account alone. Another person
                signing into Backstage on this computer gets their own, and
                neither of you can use the other&rsquo;s.
              </p>

              <div className="flex flex-col gap-6">
                {descriptors.map((descriptor) => (
                  <ProviderPanel
                    key={descriptor.id}
                    descriptor={descriptor}
                    provider={statuses.find((s) => s.id === descriptor.id)}
                    result={results[descriptor.id]}
                    agentCount={usedBy(descriptor.id)}
                    busy={busy}
                    onConnect={connect}
                    onTest={test}
                    onDisconnect={disconnect}
                    onSelectModel={selectModel}
                  />
                ))}

                <ClaudeCard />
              </div>
            </section>
          )}

          {section === 'agents' && <RosterSection />}
          {section === 'projects' && <ProjectsSection />}

          {section === 'account' && (
            <div className="flex flex-col gap-10">
              <AccountPanel />
              <DangerZone />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
