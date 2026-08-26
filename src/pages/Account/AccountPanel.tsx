import { useState } from 'react'
import { useAuth } from '../../stores/authStore'
import { Avatar } from '../../components/Auth/Avatar'

/**
 * The account, in settings.
 *
 * Three things, in the order somebody looking for them would expect: who is
 * signed in, what of theirs has left the machine, and how to leave.
 *
 * The middle one is not filler. Backstage runs agents against a real folder on
 * a real disk and now also keeps a copy of some of that in a database — the
 * user is entitled to a plain statement of which is which, on the page where
 * they would go looking for it, rather than only in a README they will never
 * open.
 */
export function AccountPanel() {
  const user = useAuth((s) => s.user)
  const sync = useAuth((s) => s.sync)
  const syncNow = useAuth((s) => s.syncNow)
  const signOut = useAuth((s) => s.signOut)

  const [busy, setBusy] = useState<'sync' | 'out' | null>(null)

  return (
    <section className="mb-10">
      <h2 className="mb-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Your account
      </h2>
      <p className="mb-4 max-w-[640px] font-ui text-[13px] leading-snug text-ink-3">
        Everything in Backstage — every project, agent, conversation and case —
        belongs to this account and is invisible to any other.
      </p>

      <div className="border-[3px] border-ink bg-paper">
        {/* ------------------------------------------------- identity -- */}
        <div className="flex flex-wrap items-center gap-4 border-b-[3px] border-ink bg-cream px-4 py-4">
          <Avatar user={user} size={48} />

          <div className="min-w-0 flex-1">
            <p className="truncate font-ui text-[16px] font-bold leading-tight text-ink">
              {user?.displayName ?? 'Not signed in'}
            </p>
            <p className="break-all font-mono text-[11px] leading-tight text-ink-3">
              {user?.email ?? '—'}
            </p>
          </div>

          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('out')
              try {
                await signOut()
              } catch {
                setBusy(null)
              }
            }}
            className="border-2 border-ink bg-paper px-3 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-rust shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 hover:bg-brand-pale active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
          >
            {busy === 'out' ? 'Signing out…' : 'Log out'}
          </button>
        </div>

        {/* ----------------------------------------------------- sync -- */}
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
          <div className="min-w-0 max-w-[440px]">
            <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
              Cloud backup
            </p>
            <p className="mt-1 font-ui text-[13px] leading-snug text-ink-3">
              {sync.enabled
                ? 'Your project metadata, agent configuration, conversations and cases are backed up to your account as you work.'
                : 'Not connected. Backstage is running entirely from this machine.'}
            </p>

            {/*
              Said plainly, because the difference between backup and restore
              is exactly the thing a user will assume the wrong way round. The
              copy is here rather than only in the setup guide, since this is
              the panel somebody reads before trusting it with a week of work.
            */}
            {sync.enabled && (
              <p className="mt-1 font-ui text-[12px] leading-snug text-ink-3">
                This is a backup, not a sync. A project is tied to a folder on
                this machine, so on a new one you re-create it against the same
                folder rather than it appearing on its own.
              </p>
            )}

            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              {sync.lastError
                ? 'Last attempt failed — it will retry'
                : sync.pending > 0
                  ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting`
                  : sync.lastSyncedAt
                    ? `Up to date · ${new Date(sync.lastSyncedAt).toLocaleTimeString()}`
                    : 'Nothing sent yet'}
            </p>
          </div>

          <button
            type="button"
            disabled={busy !== null || !sync.enabled}
            onClick={async () => {
              setBusy('sync')
              try {
                await syncNow()
              } finally {
                setBusy(null)
              }
            }}
            className="border-2 border-ink bg-paper px-3 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 hover:bg-brand-pale active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
          >
            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>
        </div>

        {/* -------------------------------------- what goes where ----- */}
        <div className="border-t-[3px] border-rule bg-cream px-4 py-4">
          <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
            What leaves this machine
          </p>

          <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-sage-dark">
                Mirrored to your account
              </dt>
              <dd className="font-ui text-[12px] leading-snug text-ink-3">
                Project names and settings, agent configuration, chat history,
                cases, orchestration limits.
              </dd>
            </div>

            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-rust">
                Never leaves this machine
              </dt>
              <dd className="font-ui text-[12px] leading-snug text-ink-3">
                Your source files, terminal output, git history, and your
                provider API keys — those stay encrypted in the operating
                system&rsquo;s keychain.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}
