import { useEffect } from 'react'
import { useTeam } from '../../stores/teamStore'
import { useProject } from '../../stores/projectStore'
import type {
  PermissionCategory,
  PermissionDecision,
  PermissionRecord
} from '../../shared/providerApi'

/**
 * What agents may do in this project.
 *
 * Two controls, and keeping them apart is the whole design. The rules say what
 * kind of answer each sort of action gets — ASK, ALLOW, DENY — and Auto Allow
 * says whether the ALLOWs are acted on silently. That separation is what makes
 * Auto Allow safe to offer: turning it on stops the prompts for things the
 * user has already permitted and changes nothing at all about the things they
 * marked ASK or DENY.
 *
 * Per project, like everything else below a project. "Agents may write freely
 * in my scratch repo and must ask before touching the one that deploys on
 * merge" is a normal thing to want, and an account-wide switch could not
 * express it.
 */

const DECISIONS: { id: PermissionDecision; label: string }[] = [
  { id: 'ask', label: 'Ask' },
  { id: 'allow', label: 'Allow' },
  { id: 'deny', label: 'Deny' }
]

const OUTCOME_LABEL: Record<PermissionRecord['outcome'], string> = {
  allowed: 'Allowed',
  session: 'Allowed (session)',
  auto: 'Auto-allowed',
  denied: 'Denied',
  blocked: 'Blocked by rule'
}

export function PermissionsSection() {
  const permissions = useTeam((s) => s.permissions)
  const categories = useTeam((s) => s.permissionCategories)
  const history = useTeam((s) => s.permissionHistory)
  const setPermissions = useTeam((s) => s.setPermissions)
  const clearHistory = useTeam((s) => s.clearPermissionHistory)
  const refreshPermissions = useTeam((s) => s.refreshPermissions)
  const project = useProject((s) => s.project)

  useEffect(() => {
    void refreshPermissions()
  }, [refreshPermissions])

  const groups = [...new Set(categories.map((c) => c.group))]

  /** How many impactful categories would stop asking if Auto Allow went on. */
  const wouldStopAsking = categories.filter(
    (c) => c.impactful && permissions.rules[c.id] === 'allow'
  )
  const denied = categories.filter((c) => permissions.rules[c.id] === 'deny')

  if (!project) {
    return (
      <p className="max-w-[560px] font-ui text-sm leading-[1.6] text-ink-3">
        Permissions belong to a project. Open one to set them.
      </p>
    )
  }

  return (
    <section className="flex flex-col gap-10">
      {/* ------------------------------------------------------ auto allow -- */}
      <div>
        <h2 className="mb-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          Agent permissions
        </h2>
        <p className="mb-4 max-w-[620px] font-ui text-[13px] leading-snug text-ink-3">
          These apply to every agent in <strong className="text-ink">{project.name}</strong>,
          however the work reached them — you asked, another agent delegated, or
          an automation fired at three in the morning.
        </p>

        <div className="max-w-[680px] border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-ink px-4 py-3">
            <div className="min-w-0">
              <h3 className="font-pixel text-base font-bold uppercase tracking-[0.04em] text-ink">
                Auto allow
              </h3>
              <p className="mt-1 max-w-[420px] font-ui text-[13px] leading-snug text-ink-3">
                {permissions.autoAllow
                  ? 'Agents may carry out the actions you marked Allow without waiting for you.'
                  : 'Agents ask before anything that changes or costs something, even where you marked it Allow.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void setPermissions({ autoAllow: !permissions.autoAllow })}
              aria-pressed={permissions.autoAllow}
              className={`shrink-0 border-[3px] border-ink px-4 py-2 font-pixel text-sm font-bold uppercase tracking-[0.06em] shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-y-px ${
                permissions.autoAllow
                  ? 'bg-brand text-on-brand'
                  : 'bg-cream text-ink-3'
              }`}
            >
              {permissions.autoAllow ? '● On' : '○ Off'}
            </button>
          </div>

          {/*
            What being on actually means, said plainly and without theatre.

            Not a warning banner: Auto Allow is a reasonable thing to turn on
            and frightening somebody out of a feature they chose is its own
            kind of dishonesty. It states the scope, names what is still
            protected, and points at the list below.
          */}
          {permissions.autoAllow && (
            <div className="border-b-2 border-rule bg-brand-pale px-4 py-2.5">
              <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.1em] text-ink">
                Auto allow enabled
              </p>
              <p className="mt-1 font-ui text-[12px] leading-snug text-ink-3">
                {wouldStopAsking.length === 0
                  ? 'Nothing is currently set to Allow, so you will still be asked about everything below.'
                  : `${wouldStopAsking
                      .map((c) => c.label.toLowerCase())
                      .join(', ')} will proceed without asking.`}{' '}
                Anything marked Ask still asks
                {denied.length > 0
                  ? `, and ${denied.map((c) => c.label.toLowerCase()).join(', ')} can never run.`
                  : '.'}
              </p>
            </div>
          )}

          {/* -------------------------------------------------- the rules -- */}
          <div className="px-4 py-3">
            {groups.map((group) => (
              <div key={group} className="mb-4 last:mb-0">
                <h4 className="mb-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                  {group}
                </h4>
                <ul className="flex flex-col gap-1.5">
                  {categories
                    .filter((c) => c.group === group)
                    .map((category) => {
                      const current = permissions.rules[category.id] ?? 'ask'
                      return (
                        <li
                          key={category.id}
                          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-2 border-rule bg-cream px-2.5 py-1.5"
                        >
                          <div className="min-w-[200px] flex-1">
                            <p className="font-ui text-[13px] font-semibold leading-snug text-ink">
                              {category.label}
                              {!category.impactful && (
                                <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
                                  read only
                                </span>
                              )}
                            </p>
                            <p className="font-ui text-[11px] leading-snug text-ink-3">
                              {category.blurb}
                            </p>
                          </div>

                          <div className="flex shrink-0 gap-1">
                            {DECISIONS.map((decision) => {
                              const on = current === decision.id
                              return (
                                <button
                                  key={decision.id}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() =>
                                    void setPermissions({
                                      rules: {
                                        [category.id]: decision.id
                                      } as Partial<
                                        Record<PermissionCategory, PermissionDecision>
                                      >
                                    })
                                  }
                                  className={[
                                    'border-2 px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors',
                                    on
                                      ? decision.id === 'deny'
                                        ? 'border-ink bg-rust text-on-slate'
                                        : 'border-ink bg-brand text-on-brand'
                                      : 'border-rule text-ink-3 hover:border-ink hover:text-ink'
                                  ].join(' ')}
                                >
                                  {decision.label}
                                </button>
                              )
                            })}
                          </div>
                        </li>
                      )
                    })}
                </ul>
              </div>
            ))}

            <p className="mt-1 border-2 border-rule bg-paper px-3 py-2 font-ui text-[12px] leading-snug text-ink-3">
              Deny is absolute. Auto Allow does not reach it, an automation
              cannot ask its way past it, and an agent that tries is told no and
              asked to carry on without it.
            </p>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------- history -- */}
      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
            What was asked
          </h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => void clearHistory()}
              className="border-2 border-rule px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        <div className="max-w-[760px] border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]">
          {history.length === 0 ? (
            <p className="px-4 py-4 font-ui text-[13px] leading-[1.6] text-ink-3">
              Nothing yet. Every action that changes or costs something is
              recorded here — including the ones Auto Allow let through, which
              is the point of keeping a record at all.
            </p>
          ) : (
            <ol className="max-h-[420px] overflow-y-auto">
              {history.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b-2 border-rule px-3 py-1.5 last:border-b-0"
                >
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-3">
                    {new Date(record.at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  <span className="shrink-0 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                    {record.requestedByName
                      ? `${record.requestedByName} → ${record.agentName}`
                      : record.agentName}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-ui text-[12px] text-ink-3">
                    {record.summary}
                    {record.automationName && (
                      <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.08em] text-brand-deep">
                        {record.automationName}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] ${
                      record.outcome === 'denied' || record.outcome === 'blocked'
                        ? 'text-rust'
                        : 'text-sage'
                    }`}
                  >
                    {OUTCOME_LABEL[record.outcome]}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
