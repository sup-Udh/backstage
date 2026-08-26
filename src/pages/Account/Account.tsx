import { useProviders } from '../../providers/useProviders'
import { useTeam } from '../../stores/teamStore'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import { AccountPanel } from './AccountPanel'
import { ProviderPanel } from './ProviderPanel'
import { ProjectPanel } from './ProjectPanel'
import { ThemePanel } from '../Themes/ThemePanel'

/**
 * Settings: this project, and the providers behind it.
 *
 * The split matters. Everything above the rule belongs to *this* project — its
 * name, folder, world, cast and team lead — and changes nothing about any
 * other. Provider connections below it are genuinely global, because a key is
 * a credential on this machine rather than a property of a project; which
 * agents use it is still decided per project, by each agent.
 *
 * No key ever comes back out. The renderer learns two things: whether one
 * exists, and its last four characters.
 */
export function Account() {
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
    <PagePlaceholder
      title="Settings"
      lead="Your account, this project — its folder, its world and its team — and the AI providers behind them. Keys are encrypted by your operating system and never reach this interface."
    >
      {/*
        The account comes first because it is what everything below it belongs
        to: the project is owned by it, and so is every agent, conversation and
        case inside the project.
      */}
      <AccountPanel />

      <div className="pixel-rule mb-8" />

      <ProjectPanel />

      {/* The world, which is project configuration rather than a global switch. */}
      <div className="mb-10 mt-10">
        <ThemePanel />
      </div>

      <div className="pixel-rule mb-8" />

      {/* Providers, rendered from the registry rather than a hard-coded list. */}
      <h2 className="mb-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        AI Providers
      </h2>
      <p className="mb-4 max-w-[640px] font-ui text-[13px] leading-snug text-ink-3">
        Connections are shared across every project on this machine, but which
        agents use them is not: each agent picks its own provider and model, so
        connecting more than one lets a team run on several at once.
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
      </div>
    </PagePlaceholder>
  )
}
