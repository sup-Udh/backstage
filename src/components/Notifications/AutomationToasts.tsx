import { useEffect, useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import type { RuntimeEvent } from '../../shared/providerApi'

/**
 * "Daily Code Review completed. Walter found 2 potential issues."
 *
 * Deliberately small, deliberately corner-parked, and deliberately temporary.
 * An automation finishing is worth telling somebody about — that is the whole
 * reason for running one unattended — but it is never worth taking the screen
 * away from them for, so nothing here is modal and nothing waits to be
 * dismissed. It fades on its own after ten seconds and the run is still in the
 * history afterwards.
 *
 * It listens to the runtime stream directly rather than reading the store,
 * because a toast is about a *moment* rather than a state. Deriving it from
 * the run list would mean re-announcing every completed run each time that
 * list was re-read, which for a page that re-reads on every task completion is
 * a notification every few seconds for work that finished this morning.
 */

interface Toast {
  id: string
  runId: string | null
  title: string
  detail: string
  tone: 'ok' | 'bad'
}

/** Long enough to read a sentence and reach for it, short enough to ignore. */
const LIFETIME_MS = 10_000

const MAX_VISIBLE = 3

export function AutomationToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const openAutomationRun = useBackstage((s) => s.openAutomationRun)

  useEffect(() => {
    if (!window.backstage?.agents) return

    return window.backstage.agents.onEvent((event: RuntimeEvent) => {
      if (event.type !== 'automation.completed' && event.type !== 'automation.failed') {
        return
      }

      const ok = event.type === 'automation.completed'
      const toast: Toast = {
        id: event.id,
        runId: event.runId ?? null,
        title: event.triggerName ?? 'Automation',
        detail: ok
          ? firstLine(event.message ?? 'Finished.')
          : /*
             * The real reason, not "something went wrong". A failed automation
             * the user cannot diagnose is one they will turn off rather than
             * fix, and the runtime already knows why.
             */
            (event.reason ?? 'It could not finish.'),
        tone: ok ? 'ok' : 'bad'
      }

      setToasts((current) => [...current, toast].slice(-MAX_VISIBLE))
      window.setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== toast.id))
      }, LIFETIME_MS)
    })
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-40 flex w-[300px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto rise border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]"
        >
          <div className="flex items-start gap-2 px-2.5 py-2">
            <span
              aria-hidden
              className={`mt-px shrink-0 font-pixel text-[12px] ${
                toast.tone === 'ok' ? 'text-sage' : 'text-rust'
              }`}
            >
              {toast.tone === 'ok' ? '✓' : '!'}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-ink">
                {toast.title}
              </p>
              <p className="mt-0.5 line-clamp-2 font-ui text-[11px] leading-snug text-ink-3">
                {toast.detail}
              </p>

              {toast.runId && (
                <button
                  type="button"
                  onClick={() => {
                    openAutomationRun(toast.runId)
                    setToasts((current) => current.filter((t) => t.id !== toast.id))
                  }}
                  className="mt-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-deep underline decoration-brand underline-offset-2 hover:text-ink"
                >
                  Open result →
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setToasts((current) => current.filter((t) => t.id !== toast.id))
              }
              aria-label="Dismiss"
              className="shrink-0 font-mono text-[11px] text-ink-3 hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The headline of an agent's answer, for a two-line card. */
function firstLine(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!line) return 'Finished.'
  return line.length > 160 ? `${line.slice(0, 159)}…` : line
}
