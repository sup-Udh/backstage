import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import type { ApprovalAnswer, ApprovalRequest } from '../../shared/providerApi'

/**
 * Approval prompts for actions the project's rules say to ask about.
 *
 * An agent waiting here is genuinely blocked — the main process is holding the
 * tool call open waiting for this answer, and denying is what happens if the
 * prompt is ignored. That is why the real arguments are shown rather than a
 * summary: an approval dialog that does not say what is being approved is
 * decoration.
 *
 * It docks over whatever page is showing, because the agent that needs an
 * answer may not be the one the user is currently looking at.
 *
 * Three answers, and the middle one is the reason this is a card rather than a
 * confirm dialog: "allow for this session" grants the whole *category* until
 * the app closes, which is the difference between approving twenty identical
 * `npm test` runs and approving one.
 */
export function ApprovalDock() {
  const approvals = useBackstage((s) => s.approvals)
  const removeApproval = useBackstage((s) => s.removeApproval)
  const refreshPermissions = useTeam((s) => s.refreshPermissions)
  const categories = useTeam((s) => s.permissionCategories)

  if (approvals.length === 0) return null

  const answer = async (id: string, choice: ApprovalAnswer) => {
    await window.backstage.approvals.resolve(id, choice)
    removeApproval(id)
    // The decision is now in the project's history, and a session grant has
    // changed what will be asked next. Both live in the team store.
    void refreshPermissions()
  }

  const categoryLabel = (request: ApprovalRequest) =>
    categories.find((c) => c.id === request.category)?.label ?? request.category

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <ul className="pointer-events-auto flex w-full max-w-[560px] flex-col gap-2">
        {approvals.map((request) => (
          <li
            key={request.id}
            className="border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b-2 border-ink bg-brand px-3 py-1.5">
              {/*
                Who is asking, and on whose behalf.

                "Walter wants Jesse to run npm install" is a different sentence
                from "Jesse wants to run npm install", and the person being
                asked should never have to work out which one it is.
              */}
              <p className="min-w-0 font-pixel text-[11px] font-bold uppercase tracking-[0.08em] text-on-brand">
                {request.requestedByName
                  ? `${request.requestedByName} wants ${request.agentName} to:`
                  : `${request.agentName} wants to:`}
              </p>
              <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-on-brand">
                {categoryLabel(request)}
              </p>
            </header>

            <div className="px-3 py-2.5">
              <p className="font-ui text-[13px] font-semibold leading-snug text-ink">
                {request.summary}
              </p>

              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                {request.tool}
                {request.workspaceName && (
                  <>
                    <span className="mx-1.5 text-rule">·</span>
                    {request.workspaceName}
                  </>
                )}
                {request.automationName && (
                  <>
                    <span className="mx-1.5 text-rule">·</span>
                    <span className="text-brand-deep">
                      automation: {request.automationName}
                    </span>
                  </>
                )}
              </p>

              <pre className="mt-2 max-h-[140px] overflow-y-auto whitespace-pre-wrap break-words border-2 border-rule bg-cream px-2 py-1.5 font-mono text-[11px] leading-[1.5] text-ink-3">
                {request.detail}
              </pre>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void answer(request.id, 'allow')}
                  className="border-[3px] border-ink bg-brand px-4 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-y-px hover:bg-brand-lite"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => void answer(request.id, 'deny')}
                  className="border-[3px] border-ink bg-cream px-4 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 shadow-[3px_3px_0_0_var(--color-shadow)] transition-colors hover:text-ink"
                >
                  Deny
                </button>
                <button
                  type="button"
                  onClick={() => void answer(request.id, 'session')}
                  title={`Stop asking about ${categoryLabel(request).toLowerCase()} until Backstage is closed`}
                  className="border-2 border-rule px-2.5 py-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
                >
                  Allow this session
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
