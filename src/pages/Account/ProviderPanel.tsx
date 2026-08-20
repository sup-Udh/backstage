import { useState } from 'react'
import type {
  ConnectionResult,
  ProviderDescriptor,
  ProviderStatus
} from '../../shared/providerApi'

interface Props {
  descriptor: ProviderDescriptor
  provider: ProviderStatus | undefined
  result: ConnectionResult | undefined
  /** How many agents are configured against this provider. */
  agentCount: number
  busy: string | null
  onConnect: (providerId: string, apiKey: string) => Promise<ConnectionResult>
  onTest: (providerId: string) => Promise<ConnectionResult>
  onDisconnect: (providerId: string) => Promise<void>
  onSelectModel: (providerId: string, modelId: string) => Promise<void>
}

/**
 * One provider's connection card.
 *
 * Rendered once per entry in the registry, so a new provider appears here with
 * no change to this file. The key is typed in and handed straight to the main
 * process: never kept in React state beyond the life of the input, never
 * persisted on this side, never read back.
 */
export function ProviderPanel({
  descriptor,
  provider,
  result,
  agentCount,
  busy,
  onConnect,
  onTest,
  onDisconnect,
  onSelectModel
}: Props) {
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)

  const id = descriptor.id
  const connected = provider?.connected ?? false
  const hasKey = provider?.hasKey ?? false

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    const res = await onConnect(id, draft)
    // Clear the field either way: it should not linger in the DOM.
    if (res.success) setDraft('')
  }

  return (
    <article className="max-w-[640px] border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)]">
      <header className="flex items-start justify-between gap-4 border-b-[3px] border-ink px-4 py-3">
        <div>
          <h2 className="font-pixel text-lg font-bold uppercase tracking-[0.04em] text-ink">
            {descriptor.name}
          </h2>
          <p className="mt-1 font-ui text-xs text-ink-3">{descriptor.blurb}</p>
        </div>

        <span
          className={`shrink-0 border-2 px-2 py-0.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] ${
            connected
              ? 'border-ink bg-brand text-ink'
              : 'border-rule text-ink-3'
          }`}
        >
          {connected ? '● Connected' : hasKey ? '○ Key saved' : '○ Not connected'}
        </span>
      </header>

      <div className="px-4 py-4">
        {!connected && (
          <form onSubmit={submit}>
            <label
              htmlFor={`key-${id}`}
              className="font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3"
            >
              API key
            </label>

            <div className="mt-2 flex items-stretch gap-2">
              <input
                {...{ id: `key-${id}` }}
                type={reveal ? 'text' : 'password'}
                value={draft}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={hasKey ? provider?.keyHint ?? '••••••••' : 'sk-…'}
                className="min-w-0 flex-1 border-[3px] border-ink bg-cream px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand-deep"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="shrink-0 border-[3px] border-ink bg-cream px-3 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:bg-brand-pale hover:text-ink"
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>

            <p className="mt-2 font-ui text-xs leading-snug text-ink-3">
              Stored encrypted by your operating system. It never reaches the
              interface — only this app&apos;s background process can read it.
            </p>

            <button
              type="submit"
              disabled={busy !== null || draft.trim().length === 0}
              className="mt-4 border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-x-px enabled:hover:-translate-y-px enabled:hover:bg-brand-lite disabled:cursor-default disabled:opacity-45"
            >
              {busy === `connect:${id}` ? 'Connecting…' : `Connect ${descriptor.name}`}
            </button>
          </form>
        )}

        {connected && (
          <>
            <p className="flex items-baseline gap-2 font-mono text-xs">
              <span className="uppercase tracking-[0.08em] text-ink-3">Key</span>
              <span className="text-ink">{provider?.keyHint ?? '••••'}</span>
            </p>

            <div className="mt-4">
              <label
                htmlFor={`model-${id}`}
                className="font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3"
              >
                Default model
              </label>
              <select
                {...{ id: `model-${id}` }}
                value={provider?.selectedModel ?? ''}
                onChange={(e) => void onSelectModel(id, e.target.value)}
                className="mt-2 w-full border-[3px] border-ink bg-cream px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brand-deep"
              >
                {(provider?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.id}
                  </option>
                ))}
              </select>
              <p className="mt-2 font-ui text-xs leading-snug text-ink-3">
                {provider?.models.find((m) => m.id === provider?.selectedModel)
                  ?.description ?? 'Fetched from your account.'}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                {provider?.models.length ?? 0} models available
                {agentCount > 0 && (
                  <>
                    <span className="mx-1.5 text-rule">·</span>
                    {agentCount} agent{agentCount === 1 ? '' : 's'} using it
                  </>
                )}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onTest(id)}
                disabled={busy !== null}
                className="border-[3px] border-ink bg-cream px-4 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-y-px enabled:hover:bg-brand-pale disabled:opacity-45"
              >
                {busy === `test:${id}` ? 'Testing…' : 'Test connection'}
              </button>
              <button
                type="button"
                onClick={() => void onDisconnect(id)}
                disabled={busy !== null}
                className="border-[3px] border-ink bg-cream px-4 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 shadow-[3px_3px_0_0_var(--color-ink)] transition-colors hover:text-ink disabled:opacity-45"
              >
                {agentCount > 0 ? `Remove (${agentCount} agents)` : 'Remove'}
              </button>
            </div>
          </>
        )}

        {result && (
          <p
            className={`mt-4 border-2 px-3 py-2 font-ui text-xs leading-snug ${
              result.success
                ? 'border-ink bg-brand-pale text-ink'
                : 'border-rust text-ink'
            }`}
            style={
              result.success ? undefined : { borderColor: 'var(--color-ink)' }
            }
          >
            {result.success
              ? 'Connection is working.'
              : `Connection failed. ${result.error ?? ''}`}
          </p>
        )}

      </div>
    </article>
  )
}
