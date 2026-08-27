import { useEffect, useState } from 'react'
import { useAuth } from '../../stores/authStore'
import { Avatar } from '../../components/Auth/Avatar'

/**
 * Who you are.
 *
 * One editable field, and that is the design rather than a shortfall. The
 * display name is Backstage's own — it is what the account menu, the greeting
 * and the project picker render — so the user owns it. The email address and
 * the avatar arrive from Google through Supabase Auth and are *its* record of
 * the identity: letting the user type over them here would produce a profile
 * that disagrees with the account it belongs to, and would not survive the
 * next sign-in anyway.
 *
 * So the email is shown, clearly, and is not a text field.
 */
export function ProfileSection() {
  const user = useAuth((s) => s.user)

  const [draft, setDraft] = useState(user?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  /*
   * Follow the store when the account changes underneath — a sign-out and a
   * different sign-in, or the name being updated elsewhere. Without this the
   * field would keep the previous account's name in it.
   */
  useEffect(() => {
    setDraft(user?.displayName ?? '')
    setNote(null)
  }, [user?.id, user?.displayName])

  const dirty = draft.trim() !== (user?.displayName ?? '').trim()

  const save = async () => {
    if (!dirty || !draft.trim()) return
    setSaving(true)
    setNote(null)
    try {
      const result = await window.backstage.auth.updateProfile(draft)
      setNote(
        result.ok
          ? { ok: true, text: 'Saved.' }
          : { ok: false, text: result.error ?? "That name couldn't be saved." }
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="mb-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Profile
      </h2>
      <p className="mb-4 max-w-[620px] font-ui text-[13px] leading-snug text-ink-3">
        How you appear inside Backstage. Your email and picture come from the
        Google account you signed in with.
      </p>

      <div className="border-[3px] border-ink bg-paper">
        <div className="flex flex-wrap items-center gap-4 border-b-[3px] border-ink bg-cream px-4 py-4">
          <Avatar user={user} size={56} />
          <div className="min-w-0">
            <p className="truncate font-ui text-[16px] font-bold leading-tight text-ink">
              {user?.displayName ?? '—'}
            </p>
            <p className="break-all font-mono text-[11px] leading-tight text-ink-3">
              {user?.email ?? '—'}
            </p>
          </div>
        </div>

        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              Display name
            </span>
            <input
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
              }}
              className="w-full border-2 border-ink bg-cream px-2.5 py-1.5 font-ui text-[14px] text-ink outline-none focus:border-brand-deep focus-visible:ring-[3px] focus-visible:ring-brand-deep"
            />
          </label>

          <div className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              Email
            </span>
            {/*
              Deliberately not an input. Presenting a read-only field as a text
              box invites somebody to type in it and then wonder why nothing
              saved.
            */}
            <p className="break-all border-2 border-rule bg-cream px-2.5 py-1.5 font-mono text-[12px] text-ink-3">
              {user?.email ?? '—'}
            </p>
            <p className="mt-1 font-ui text-[11px] leading-snug text-ink-3">
              Managed by Google.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t-[3px] border-rule px-4 py-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving || !draft.trim()}
            className="border-2 border-ink bg-brand px-3 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 hover:bg-brand-lite active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-shadow)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
          >
            {saving ? 'Saving…' : 'Save name'}
          </button>

          <span aria-live="polite" className="font-ui text-[12px]">
            {note && (
              <span className={note.ok ? 'text-sage-dark' : 'text-rust'}>
                {note.text}
              </span>
            )}
          </span>
        </div>
      </div>
    </section>
  )
}
