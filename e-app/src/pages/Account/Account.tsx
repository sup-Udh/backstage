import { useProviders } from '../../providers/useProviders'
import { useBackstage } from '../../stores/backstageStore'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import { ProviderPanel } from './ProviderPanel'

const SECTIONS = [
  { name: 'Profile', note: 'Who you are inside Backstage.' },
  { name: 'Preferences', note: 'Defaults for new cases and agents.' },
  { name: 'Appearance', note: 'World scale, motion and density.' },
  { name: 'Data', note: 'Local history, export and reset.' }
]

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

  const mode = useBackstage((s) => s.mode)
  const setMode = useBackstage((s) => s.setMode)

  return (
    <PagePlaceholder
      title="Account"
      lead="Your workspace, and the providers behind your team."
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

      {/* Providers, rendered from the registry. */}
      <h2 className="mb-4 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        AI Providers
      </h2>
      <div className="flex flex-col gap-6">
        {descriptors.map((d) => (
          <ProviderPanel
            key={d.id}
            descriptor={d}
            provider={statuses.find((s) => s.id === d.id)}
            result={results[d.id]}
            busy={busy}
            onConnect={connect}
            onTest={test}
            onDisconnect={disconnect}
            onSelectModel={selectModel}
          />
        ))}
      </div>

      {/* Execution mode: one setting for the team, not per provider. */}
      <h2 className="mb-4 mt-10 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Agent execution
      </h2>
      <article className="max-w-[640px] border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <div className="flex gap-2">
          {(['real', 'fake'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`border-2 px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                mode === m
                  ? 'border-ink bg-brand text-ink'
                  : 'border-rule text-ink-3 hover:border-ink hover:text-ink'
              }`}
            >
              {m === 'real' ? 'Real' : 'Simulated'}
            </button>
          ))}
        </div>
        <p className="mt-2 font-ui text-xs leading-snug text-ink-3">
          {mode === 'real'
            ? 'Tasks call a real provider, use tools against your workspace, and spend credit.'
            : 'Tasks replay a scripted timeline. No API calls, no file access, no cost.'}
        </p>
      </article>

      <h2 className="mb-4 mt-10 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Everything else
      </h2>
      <ul className="max-w-[640px] border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)]">
        {SECTIONS.map((s, i) => (
          <li
            key={s.name}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${
              i > 0 ? 'border-t-2 border-rule' : ''
            }`}
          >
            <div>
              <p className="font-ui text-sm font-semibold text-ink">{s.name}</p>
              <p className="mt-0.5 font-ui text-xs text-ink-3">{s.note}</p>
            </div>
            <span className="shrink-0 border-2 border-rule px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
              Soon
            </span>
          </li>
        ))}
      </ul>
    </PagePlaceholder>
  )
}
