import { useState } from 'react'
import { useProvider } from '../../providers/useProvider'
import { useBackstage } from '../../stores/backstageStore'

/**
 * The OpenAI connection card.
 *
 * The key is typed here and handed straight to the main process; it is never
 * stored in React state beyond the life of the input, never persisted on this
 * side, and never read back. A connected account shows only a masked hint.
 */
export function OpenAIPanel() {
  const { provider, busy, result, connect, test, disconnect, selectModel } =
    useProvider()
  const mode = useBackstage((s) => s.mode)
  const setMode = useBackstage((s) => s.setMode)

  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)

  const connected = provider?.connected ?? false
  const hasKey = provider?.hasKey ?? false

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    const res = await connect(draft)
    // Clear the field either way: it should not linger in the DOM.
    if (res.success) setDraft('')
  }

  return (
    <article className="max-w-[640px] border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)]">
      <header className="flex items-start justify-between gap-4 border-b-[3px] border-ink px-4 py-3">
        <div>
          <h2 className="font-pixel text-lg font-bold uppercase tracking-[0.04em] text-ink">
            OpenAI
          </h2>
          <p className="mt-1 font-ui text-xs text-ink-3">GPT models</p>
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
              htmlFor="openai-key"
              className="font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3"
            >
              API key
            </label>

            <div className="mt-2 flex items-stretch gap-2">
              <input
                id="openai-key"
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
              {busy === 'connect' ? 'Connecting…' : 'Connect OpenAI'}
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
                htmlFor="openai-model"
                className="font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3"
              >
                Default model
              </label>
              <select
                id="openai-model"
                value={provider?.selectedModel ?? ''}
                onChange={(e) => void selectModel(e.target.value)}
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
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void test()}
                disabled={busy !== null}
                className="border-[3px] border-ink bg-cream px-4 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-y-px enabled:hover:bg-brand-pale disabled:opacity-45"
              >
                {busy === 'test' ? 'Testing…' : 'Test connection'}
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={busy !== null}
                className="border-[3px] border-ink bg-cream px-4 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 shadow-[3px_3px_0_0_var(--color-ink)] transition-colors hover:text-ink disabled:opacity-45"
              >
                Disconnect
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

        {/* Execution mode. Kept here so the API-spending switch is beside the
            credential it spends against. */}
        <div className="mt-6 border-t-2 border-rule pt-4">
          <p className="font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Agent execution
          </p>
          <div className="mt-2 flex gap-2">
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
              ? 'Tasks call OpenAI and spend credit.'
              : 'Tasks replay a scripted timeline. No API calls, no cost.'}
          </p>
        </div>
      </div>
    </article>
  )
}
