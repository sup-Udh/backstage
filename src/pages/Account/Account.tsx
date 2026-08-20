import { useProviders } from '../../providers/useProviders'
import { useTeam } from '../../stores/teamStore'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import { ProviderPanel } from './ProviderPanel'

/**
 * Connections.
 *
 * The single source of truth for which providers are usable. An agent cannot
 * be created against a provider that has no connection here, and the roster
 * reads its "can this agent run?" answer from the same place — so a key added
 * on this page immediately unblocks every agent waiting on it.
 *
 * No key ever comes back out. The renderer learns two things: whether one
 * exists, and its last four characters.
 */
export function Account() {
  const {
    descriptors,
    statuses,
    workspace,
    busy,
    results,
    connect,
    test,
    disconnect,
    selectModel,
    chooseWorkspace,
    clearWorkspace
  } = useProviders()

  const agents = useTeam((s) => s.agents)

  /** How many agents each provider is currently answering for. */
  const usedBy = (providerId: string) =>
    agents.filter((a) => a.providerId === providerId).length

  return (
    <PagePlaceholder
      title="Connections"
      lead="Your project folder, and the AI providers behind your team. Keys are encrypted by your operating system and never reach this interface."
    >
      {/* Workspace: the boundary every local tool operates inside. */}
      <h2 className="mb-4 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Workspace
      </h2>
      <article className="mb-10 max-w-[640px] border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        {workspace?.root ? (
          <>
            <p className="font-pixel text-base font-bold uppercase tracking-[0.04em] text-ink">
              {workspace.name}
            </p>
            <p className="mt-1.5 break-all font-mono text-xs text-ink-3">
              {workspace.root}
            </p>
            {!workspace.exists && (
              <p className="mt-2 font-ui text-xs text-ink">
                That folder no longer exists. Choose another.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-pixel text-base font-bold uppercase tracking-[0.04em] text-ink">
              No project open
            </p>
            <p className="mt-1.5 font-ui text-xs leading-snug text-ink-3">
              Agents can only read, edit and run commands inside the folder you
              open here. Without one they have no access to your machine.
            </p>
          </>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void chooseWorkspace()}
            disabled={busy === 'workspace'}
            className="border-[3px] border-ink bg-brand px-4 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-y-px enabled:hover:bg-brand-lite disabled:opacity-45"
          >
            {busy === 'workspace'
              ? 'Choosing…'
              : workspace?.root
                ? 'Change folder'
                : 'Open project folder'}
          </button>
          {workspace?.root && (
            <button
              type="button"
              onClick={() => void clearWorkspace()}
              className="border-[3px] border-ink bg-cream px-4 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 shadow-[3px_3px_0_0_var(--color-ink)] transition-colors hover:text-ink"
            >
              Close
            </button>
          )}
        </div>
      </article>

      {/* Providers, rendered from the registry rather than a hard-coded list. */}
      <h2 className="mb-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        AI Providers
      </h2>
      <p className="mb-4 max-w-[640px] font-ui text-[13px] leading-snug text-ink-3">
        Every agent picks its own provider and model, so connecting more than
        one lets a team run on several at once.
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
