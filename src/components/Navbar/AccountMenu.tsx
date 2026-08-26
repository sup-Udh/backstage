import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../stores/authStore'
import { useBackstage } from '../../stores/backstageStore'
import { Avatar } from '../Auth/Avatar'

/**
 * Who is signed in, and the two things you can do about it.
 *
 * Replaces the old "Connections" button, which was a settings shortcut wearing
 * an avatar it had made up — the letter U was hard-coded. Now the face, the
 * name and the email all come from the authenticated profile, so the
 * navigation bar answers "whose Backstage is this?" honestly, which on a
 * shared machine is the question that matters most.
 *
 * Signing out is deliberately here rather than only buried in settings. It is
 * the control a user reaches for when they are about to hand the laptop to
 * somebody, and it should not take three clicks to find.
 */
export function AccountMenu() {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const setPage = useBackstage((s) => s.setPage)
  const page = useBackstage((s) => s.page)

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  /*
   * Dismiss on an outside click or on Escape.
   *
   * Both, because they are different gestures: the pointer user clicks away
   * and the keyboard user presses Escape, and a menu that only answers one of
   * them is a menu somebody cannot close. Focus returns to the trigger on
   * Escape so the tab order is not lost.
   */
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const go = (target: 'account') => {
    setOpen(false)
    setPage(target)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          'flex items-center gap-2 border-2 px-2.5 py-1.5 transition-colors',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep',
          open || page === 'account'
            ? 'border-ink bg-brand text-ink'
            : 'border-ink bg-paper text-ink-3 hover:bg-brand-pale hover:text-ink'
        ].join(' ')}
      >
        <Avatar user={user} size={22} />
        <span className="max-w-[140px] truncate font-pixel text-xs font-semibold uppercase tracking-[0.06em]">
          {user?.displayName ?? 'Account'}
        </span>
        <span aria-hidden className="text-[9px] leading-none">
          ▼
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] border-[3px] border-ink bg-paper shadow-[5px_5px_0_0_var(--color-ink)]"
        >
          {/*
            Identity first, and the email is shown in full rather than
            truncated to fit. On a machine two people share it is the only
            unambiguous way to tell whose account this is.
          */}
          <div className="flex items-start gap-3 border-b-[3px] border-ink bg-cream px-3 py-3">
            <Avatar user={user} size={36} />
            <div className="min-w-0">
              <p className="truncate font-ui text-[14px] font-bold leading-tight text-ink">
                {user?.displayName ?? 'Signed in'}
              </p>
              <p className="break-all font-mono text-[10px] leading-tight text-ink-3">
                {user?.email ?? 'No email on this account'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => go('account')}
            className="block w-full px-3 py-2.5 text-left font-ui text-[13px] font-semibold text-ink transition-colors hover:bg-brand-pale focus-visible:bg-brand-pale focus-visible:outline-none"
          >
            Settings
          </button>

          <div className="pixel-rule mx-3" />

          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              /*
               * No `finally` resetting `busy`, deliberately. A successful sign
               * out unmounts this whole tree — the guard swaps in the login
               * page — so there is nothing left to re-enable, and setting
               * state on the way out would be an update on an unmounted
               * component. The failure path is handled below.
               */
              try {
                await signOut()
              } catch {
                setBusy(false)
              }
            }}
            className="block w-full px-3 py-2.5 text-left font-ui text-[13px] font-semibold text-rust transition-colors hover:bg-brand-pale disabled:opacity-60 focus-visible:bg-brand-pale focus-visible:outline-none"
          >
            {busy ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  )
}
