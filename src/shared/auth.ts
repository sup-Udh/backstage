/**
 * The account domain.
 *
 * Types only, like ./agents and ./projects, so both processes import it
 * without either pulling the other's runtime in.
 *
 * Nothing here carries a token. The Supabase client lives entirely in the main
 * process — beside the provider keys, and for the same reason — so the
 * renderer is told who is signed in and never how to prove it. An access token
 * that reached the renderer would be a bearer credential sitting in a window
 * that also renders model output, which is precisely the arrangement
 * `secureStore` exists to avoid.
 */

/**
 * Where authentication has got to.
 *
 * `initialising` is a real state rather than a convenience: on launch the app
 * has an encrypted session file it has not read yet, and rendering either the
 * workspace or the login page before that answer arrives would show the user a
 * surface that is about to be replaced. Nothing protected renders until this
 * leaves `initialising`.
 */
export type AuthStatus = 'initialising' | 'authenticated' | 'unauthenticated'

/**
 * The signed-in account, as the interface needs it.
 *
 * `id` is the Supabase `auth.users.id` UUID and is the only ownership key in
 * the system. Email and display name are Google profile data: they change when
 * the user changes them, so nothing is ever keyed by either.
 */
export interface AuthUser {
  /** The stable Supabase UUID. Every owned record points at this. */
  id: string
  email: string | null
  displayName: string
  avatarUrl: string | null
}

/**
 * Why a sign-in failed, in categories the interface can speak about.
 *
 * The raw Supabase or Google error is logged in the main process and never
 * shown: those messages name endpoints, grant types and provider internals,
 * which tell the user nothing and tell anyone reading a screenshot rather more
 * than they should know.
 */
export type AuthErrorKind =
  | 'not_configured'
  | 'cancelled'
  | 'network'
  | 'provider'
  | 'callback'
  | 'unknown'

export interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  /**
   * True from the moment the browser is opened until the callback resolves.
   *
   * Held in the main process rather than in the button, because the main
   * process is what owns the loopback listener — a second click while one
   * round trip is open would race two callbacks onto one code verifier.
   */
  signingIn: boolean
  error: { kind: AuthErrorKind; message: string } | null
  /**
   * Whether Supabase credentials were found at all.
   *
   * False on a checkout with no `.env`. The login page says so plainly instead
   * of offering a Google button that cannot work.
   */
  configured: boolean
}

/** What cloud mirroring is doing, for the account panel. */
export interface SyncState {
  /** False when Supabase is not configured, or nobody is signed in. */
  enabled: boolean
  pending: number
  lastSyncedAt: number | null
  lastError: string | null
}

export interface AuthApi {
  /** The current state. Safe to call at any point, including before init. */
  state(): Promise<AuthState>
  /**
   * Begin Google sign-in.
   *
   * Opens the system browser — never an embedded window. An in-app browser
   * would be Backstage rendering Google's password field, which is both what
   * RFC 8252 tells native apps not to do and something Google itself blocks.
   */
  signInWithGoogle(): Promise<AuthState>
  /** Abandon a sign-in that is still waiting on the browser. */
  cancelSignIn(): Promise<AuthState>
  signOut(): Promise<AuthState>
  /** Push: session restored, refreshed, signed in or signed out. */
  onChanged(handler: (state: AuthState) => void): () => void

  sync: {
    state(): Promise<SyncState>
    /** Push anything queued and pull the account's cloud records. */
    now(): Promise<SyncState>
    onChanged(handler: (state: SyncState) => void): () => void
  }
}
