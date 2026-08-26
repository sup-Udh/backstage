import { useEffect } from 'react'
import { create } from 'zustand'
import type { AuthState, AuthUser, SyncState } from '../shared/providerApi'

/**
 * The account, mirrored from the main process.
 *
 * Nothing here is the source of truth — the same discipline `projectStore`
 * holds to. The main process owns the Supabase client, the session and the
 * tokens; this store holds a copy of *who is signed in* so React can render
 * against it, and every mutator round-trips and replaces the copy with what
 * came back. The renderer can therefore never claim a sign-in that did not
 * happen, or stay signed in after the main process has decided otherwise.
 *
 * There is deliberately one of these. Authentication state duplicated across
 * components is authentication state that disagrees with itself, and the
 * component holding the stale copy is invariably the one guarding something.
 */

interface AuthStoreState extends AuthState {
  sync: SyncState
  /** True until the first state has arrived from the main process. */
  hydrated: boolean

  signInWithGoogle: () => Promise<void>
  cancelSignIn: () => Promise<void>
  signOut: () => Promise<void>
  dismissError: () => void
  syncNow: () => Promise<void>
  /** Replace the mirror wholesale, from a push or a fetch. */
  apply: (state: AuthState) => void
  applySync: (state: SyncState) => void
}

const INITIAL_SYNC: SyncState = {
  enabled: false,
  pending: 0,
  lastSyncedAt: null,
  lastError: null
}

export const useAuth = create<AuthStoreState>((set) => ({
  /*
   * `initialising` until told otherwise, and that is the important default.
   * Starting at `unauthenticated` would mean the very first paint of a signed-in
   * session is the login page, replaced a frame later by the dashboard — the
   * flash the whole loading state exists to prevent.
   */
  status: 'initialising',
  user: null,
  signingIn: false,
  error: null,
  configured: true,
  sync: INITIAL_SYNC,
  hydrated: false,

  apply: (state) => set({ ...state, hydrated: true }),
  applySync: (sync) => set({ sync }),

  signInWithGoogle: async () => {
    const api = window.backstage?.auth
    if (!api) return
    /*
     * The main process is the one that refuses a duplicate — it owns the
     * loopback listener and the PKCE verifier, and two overlapping sign-ins
     * would overwrite one verifier with the other's. Setting `signingIn` here
     * as well is only so the button reacts on the same frame it was clicked.
     */
    set({ signingIn: true, error: null })
    set({ ...(await api.signInWithGoogle()), hydrated: true })
  },

  cancelSignIn: async () => {
    const api = window.backstage?.auth
    if (!api) return
    set({ ...(await api.cancelSignIn()), hydrated: true })
  },

  signOut: async () => {
    const api = window.backstage?.auth
    if (!api) return
    set({ ...(await api.signOut()), hydrated: true, sync: INITIAL_SYNC })
  },

  dismissError: () => set({ error: null }),

  syncNow: async () => {
    const api = window.backstage?.auth
    if (!api) return
    set({ sync: await api.sync.now() })
  }
}))

/* --------------------------------------------------------------- selectors -- */

export function useAuthUser(): AuthUser | null {
  return useAuth((s) => s.user)
}

export function useIsAuthenticated(): boolean {
  return useAuth((s) => s.status === 'authenticated')
}

/**
 * Initials for the avatar fallback.
 *
 * Google supplies a picture for most accounts but not all, and a broken image
 * in the account menu is worse than no image. Two letters from the display
 * name, or one from the email, or the wordmark's own initial.
 */
export function initialsFor(user: AuthUser | null): string {
  const source = user?.displayName?.trim() || user?.email?.trim() || ''
  if (!source) return 'B'

  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

/* ------------------------------------------------------------------- sync -- */

/**
 * Keep the mirror in step with the main process.
 *
 * Mounted once, at the root, above every guard — so the app is subscribed to
 * sign-outs even while it is showing the login page, and a session that
 * expires or is revoked while the user is looking at the dashboard takes them
 * out of it without needing a click to notice.
 *
 * The initial fetch matters as much as the subscription: the main process
 * resolves the stored session *before* the window is created, so by the time
 * this runs the answer already exists and the push that carried it has been
 * and gone.
 */
export function useAuthBridge(): void {
  useEffect(() => {
    const api = window.backstage?.auth
    if (!api) {
      // No preload — nothing can be authenticated, and pretending otherwise
      // would leave the app stuck on the initialising screen for ever.
      useAuth.setState({
        status: 'unauthenticated',
        configured: false,
        hydrated: true
      })
      return
    }

    const offAuth = api.onChanged((state) => useAuth.getState().apply(state))
    const offSync = api.sync.onChanged((state) => useAuth.getState().applySync(state))

    void api.state().then((state) => useAuth.getState().apply(state))
    void api.sync.state().then((state) => useAuth.getState().applySync(state))

    return () => {
      offAuth()
      offSync()
    }
  }, [])
}
