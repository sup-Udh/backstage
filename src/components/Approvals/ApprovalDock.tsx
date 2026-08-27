import { useBackstage } from '../../stores/backstageStore'

/**
 * Approval prompts for dangerous tools.
 *
 * An agent that wants to run a shell command, rewrite a file or make a commit
 * is genuinely blocked here — the main process is holding the tool call open
 * waiting for this answer, and denying is what happens if the prompt is
 * ignored. That is why the real arguments are shown rather than a summary: an
 * approval dialog that does not say what is being approved is decoration.
 *
 * It docks over whatever page is showing, because the agent that needs an
 * answer may not be the one the user is currently looking at.
 */
export function ApprovalDock() {
  const approvals = useBackstage((s) => s.approvals)
  const removeApproval = useBackstage((s) => s.removeApproval)

  if (approvals.length === 0) return null

  const answer = async (id: string, approved: boolean) => {
    await window.backstage.approvals.resolve(id, approved)
    removeApproval(id)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <ul className="pointer-events-auto flex w-full max-w-[560px] flex-col gap-2">
        {approvals.map((request) => (
          <li
            key={request.id}
            className="border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]"
          >
            <header className="flex items-baseline justify-between gap-3 border-b-2 border-ink bg-brand px-3 py-1.5">
              <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.1em] text-on-brand">
                {request.agentName} needs permission
              </p>
              <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-on-brand">
                {request.tool}
              </p>
            </header>

            <div className="px-3 py-2.5">
              <p className="font-ui text-[13px] leading-snug text-ink">
                {request.summary}
              </p>
              <pre className="mt-2 max-h-[140px] overflow-y-auto whitespace-pre-wrap break-words border-2 border-rule bg-cream px-2 py-1.5 font-mono text-[11px] leading-[1.5] text-ink-3">
                {request.detail}
              </pre>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void answer(request.id, true)}
                  className="border-[3px] border-ink bg-brand px-4 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-y-px hover:bg-brand-lite"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => void answer(request.id, false)}
                  className="border-[3px] border-ink bg-cream px-4 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 shadow-[3px_3px_0_0_var(--color-shadow)] transition-colors hover:text-ink"
                >
                  Deny
                </button>
                <p className="ml-auto font-ui text-[11px] leading-snug text-ink-3">
                  Ignoring this denies it.
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
