import { CLAUDE_COPY, CLAUDE_INSTALL_URL, useClaude } from './useClaude'

/**
 * Claude Code's status, as a provider card.
 *
 * It sits alongside OpenAI and Gemini in settings because that is where a user
 * looks for "which AI can Backstage use", but it is a genuinely different
 * kind of thing and the card says so: there is no API key, nothing is stored,
 * and Backstage neither manages nor authenticates it. It is a CLI on the
 * machine, driven through a real terminal the user can watch and interrupt.
 *
 * The version is only ever one that was actually reported. Requirement 22 is
 * explicit about not fabricating it, and the detection returns null rather
 * than guessing when the CLI prints something unfamiliar — so the line simply
 * disappears instead of showing a number nobody can act on.
 */
export function ClaudeCard() {
  const { detection, checking, recheck } = useClaude()

  const state = detection?.state ?? 'not_installed'
  const copy = CLAUDE_COPY[state]

  const toneClass =
    copy.tone === 'ok'
      ? 'text-sage-dark'
      : copy.tone === 'warn'
        ? 'text-brand-deep'
        : 'text-rust'

  return (
    <div className="border-[3px] border-ink bg-paper">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-ink bg-cream px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-pixel text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
            Claude Code
          </h3>
          <p className="mt-0.5 font-ui text-[12px] leading-snug text-ink-3">
            The local CLI, run in a real terminal. No API key is stored by
            Backstage.
          </p>
        </div>

        <span
          className={`flex shrink-0 items-center gap-1.5 border-2 border-ink bg-paper px-2 py-1 font-pixel text-[10px] font-bold uppercase tracking-[0.08em] ${toneClass}`}
        >
          <span aria-hidden>{checking ? '◌' : copy.glyph}</span>
          {checking ? 'Checking…' : copy.label}
        </span>
      </div>

      <div className="px-4 py-3">
        {state === 'available' && (
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
            {detection?.version && (
              <>
                <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  Version
                </dt>
                <dd className="font-mono text-[11px] text-ink">
                  {detection.version}
                </dd>
              </>
            )}
            {detection?.path && (
              <>
                <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  Path
                </dt>
                <dd className="break-all font-mono text-[11px] text-ink-3">
                  {detection.path}
                </dd>
              </>
            )}
          </dl>
        )}

        {state === 'not_installed' && (
          <p className="font-ui text-[13px] leading-snug text-ink">
            Claude Code isn&rsquo;t on this computer&rsquo;s PATH. Install it and
            Backstage will pick it up — nothing else needs configuring.
          </p>
        )}

        {state === 'failed_to_start' && (
          <>
            <p className="font-ui text-[13px] leading-snug text-ink">
              Claude Code is installed, but it wouldn&rsquo;t run when Backstage
              asked it for its version. That usually means a broken install or a
              Node version it can&rsquo;t use — reinstalling is not the answer,
              because it is already there.
            </p>
            {detection?.path && (
              <p className="mt-1.5 break-all font-mono text-[10px] text-ink-3">
                {detection.path}
              </p>
            )}
            {detection?.detail && (
              <pre className="mt-2 max-h-24 overflow-auto border-2 border-rule bg-cream px-2 py-1.5 font-mono text-[10px] leading-snug text-ink-3">
                {detection.detail}
              </pre>
            )}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void recheck()}
            disabled={checking}
            className="border-2 border-ink bg-paper px-3 py-1 font-pixel text-[10px] font-bold uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 hover:bg-brand-pale active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-shadow)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
          >
            {checking ? 'Testing…' : 'Test connection'}
          </button>

          {state !== 'available' && (
            <a
              href={CLAUDE_INSTALL_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="border-2 border-rule px-3 py-1 font-pixel text-[10px] font-bold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
            >
              How to install
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
