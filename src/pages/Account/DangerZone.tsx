import { useState } from 'react'
import { useAuth } from '../../stores/authStore'

/**
 * Deleting the account.
 *
 * Two gates, and both are deliberate. The first is a button that only arms the
 * second; the second requires typing the account's own email address. A single
 * "are you sure?" is not a confirmation — it is a reflex, and people click
 * through it. Typing the address means the user has read which account they
 * are about to destroy, which matters most in exactly the situation this is
 * riskiest: two accounts used on one machine.
 *
 * What actually happens is stated before the button, not after. Requirement 18
 * asks for a confirmation step; a confirmation step that does not say what is
 * being confirmed is theatre.
 */
export function DangerZone() {
  const user = useAuth((s) => s.user)

  const [armed, setArmed] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const email = user?.email ?? ''
  const confirmed = email.length > 0 && typed.trim().toLowerCase() === email.toLowerCase()

  const destroy = async () => {
    if (!confirmed) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.backstage.auth.deleteAccount()
      if (!result.ok) {
        setError(result.error ?? "Your account couldn't be deleted.")
        setBusy(false)
        return
      }
      /*
       * No success state to render. A successful delete signs the user out,
       * and the guard replaces this whole tree with the login page — setting
       * state here would be an update on an unmounted component.
       */
    } catch {
      setError('Something went wrong. Nothing was deleted.')
      setBusy(false)
    }
  }

  return (
    <div className="border-[3px] border-rust bg-paper">
      <div className="border-b-[3px] border-rust bg-cream px-4 py-3">
        <h3 className="font-pixel text-[13px] font-bold uppercase tracking-[0.08em] text-rust">
          Delete account
        </h3>
      </div>

      <div className="px-4 py-4">
        <p className="max-w-[620px] font-ui text-[13px] leading-snug text-ink">
          This removes your Backstage account and everything stored under it:
          your profile, your projects, their agents, every conversation and
          every case. It also deletes the API keys saved on this computer for
          your account.
        </p>
        <p className="mt-2 max-w-[620px] font-ui text-[13px] leading-snug text-ink-3">
          Your source code is not touched. Backstage forgets your project
          folders; it never deletes them.
        </p>
        <p className="mt-2 font-ui text-[13px] font-semibold text-rust">
          This cannot be undone.
        </p>

        {!armed ? (
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="mt-4 border-2 border-rust bg-paper px-3 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-rust transition-colors hover:bg-cream focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-rust"
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-4 border-2 border-rust bg-cream px-3 py-3">
            <label className="block">
              <span className="mb-1 block font-ui text-[12px] leading-snug text-ink">
                Type <strong className="font-mono">{email || 'your email'}</strong>{' '}
                to confirm.
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full max-w-[360px] border-2 border-ink bg-paper px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-rust focus-visible:ring-[3px] focus-visible:ring-rust"
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void destroy()}
                disabled={!confirmed || busy}
                className="border-2 border-rust bg-rust px-3 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-rust"
              >
                {busy ? 'Deleting…' : 'Permanently delete'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setArmed(false)
                  setTyped('')
                  setError(null)
                }}
                disabled={busy}
                className="border-2 border-ink bg-paper px-3 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
              >
                Cancel
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-2 font-ui text-[12px] text-rust">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
