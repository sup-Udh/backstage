import { shell } from 'electron'
import type { Session, User } from '@supabase/supabase-js'
import type { AuthErrorKind, AuthState, AuthUser } from '../src/shared/auth'
import { supabase, isSupabaseConfigured } from './client'
import { callbackUrl } from './env'
import { clearStoredSession } from './sessionStore'
import { awaitCallback, cancelCallback, callbackIsOpen } from './oauthCallback'

/**
 * Authentication, and the only place that knows who is signed in.
 *
 * Everything downstream — which projects exist, which agents can be listed,
 * which cases are readable — resolves ownership through `currentUserId()`, so
 * this module is the root of the whole data hierarchy:
 *
 *     auth.users.id  →  project.userId  →  agents, conversations, cases
 *
 * The id is the Supabase UUID and nothing else. Email addresses change, Google
 * display names change, and two people can pick the same project name; none of
 * them is an identity, and keying ownership on one would mean a user renaming
 * themselves loses their work or inherits somebody else's.
 *
 * State is kept in memory and mirrored to the renderer by push. `currentUserId`
 * has to be synchronous because it is called from inside every scoped read in
 * the main process, and making the roster load `await` an auth lookup would put
 * an async hop in the middle of code that has none.
 */

/** Listeners get every transition, including the first one on launch. */
type Listener = (state: AuthState) => void

const listeners = new Set<Listener>()

let state: AuthState = {
  status: 'initialising',
  user: null,
  signingIn: false,
  error: null,
  configured: isSupabaseConfigured()
}

/** Set once `initAuth` has resolved the stored session, one way or the other. */
let initialised = false

function emit(): void {
  const snapshot = getAuthState()
  for (const listener of listeners) {
    try {
      listener(snapshot)
    } catch (err) {
      console.error('[auth] a state listener threw:', err)
    }
  }
}

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch }
  emit()
}

export function onAuthChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAuthState(): AuthState {
  // A copy, so a listener cannot mutate the state it was handed.
  return { ...state, user: state.user ? { ...state.user } : null }
}

/**
 * The signed-in account's id, or the empty string.
 *
 * The empty string is load-bearing and matches what `getActiveProjectId` does
 * with an absent project: a record stamped `''` is owned by nobody and is
 * therefore invisible to every scoped read. So "signed out" and "signed in as
 * someone with no data" produce the same, safe answer — nothing — without any
 * caller needing a null check that it could forget.
 */
export function currentUserId(): string {
  return state.status === 'authenticated' ? (state.user?.id ?? '') : ''
}

export function isAuthenticated(): boolean {
  return state.status === 'authenticated' && Boolean(state.user?.id)
}

/**
 * Turn a Supabase user into the shape the interface renders.
 *
 * Google puts the display name and picture in different metadata keys
 * depending on which provider and which grant produced the session, so all the
 * documented spellings are tried before falling back to the local part of the
 * email. "Signed in as `null`" is not an acceptable thing to render.
 */
function toAuthUser(user: User): AuthUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const str = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return null
  }

  const email = user.email ?? str('email')

  return {
    id: user.id,
    email,
    displayName:
      str('full_name', 'name', 'preferred_username', 'user_name') ??
      email?.split('@')[0] ??
      'Backstage user',
    avatarUrl: str('avatar_url', 'picture')
  }
}

/* --------------------------------------------------------------- errors -- */

/**
 * Map a failure onto something worth showing.
 *
 * The raw text is logged and never surfaced. Supabase and Google errors name
 * grant types, endpoints and provider internals: they are useless to the
 * person trying to sign in, and a screenshot of one tells a reader more about
 * the deployment than it should.
 */
function classify(err: unknown): { kind: AuthErrorKind; message: string } {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const text = raw.toLowerCase()

  console.error('[auth] sign-in failed:', raw)

  if (text.includes('access_denied') || text.includes('cancel')) {
    return {
      kind: 'cancelled',
      message: 'Sign-in was cancelled before it finished.'
    }
  }
  if (
    text.includes('fetch failed') ||
    text.includes('network') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('timed out')
  ) {
    return {
      kind: 'network',
      message: "Backstage couldn't reach the sign-in service. Check your connection and try again."
    }
  }
  if (text.includes('provider') || text.includes('not enabled')) {
    return {
      kind: 'provider',
      message: 'Google sign-in is not enabled for this Backstage installation yet.'
    }
  }
  if (text.includes('port') || text.includes('callback') || text.includes('verifier')) {
    return {
      kind: 'callback',
      message: "Backstage couldn't receive the response from Google. Try signing in again."
    }
  }
  return {
    kind: 'unknown',
    message: "We couldn't complete your Google sign-in."
  }
}

/* --------------------------------------------------------------- profile -- */

/**
 * Keep the `profiles` row in step with Google.
 *
 * The row itself is created by a database trigger on `auth.users`, so it
 * exists whether or not this ever runs — a profile that depends on the client
 * remembering to write it is a profile that is missing for anyone who signed
 * in while offline. This is the refresh: a user who changes their Google
 * avatar sees it change in Backstage on their next sign-in.
 *
 * Best effort, deliberately. A failure here must not fail the sign-in: the
 * account is authenticated either way, and the profile is display data.
 */
async function syncProfile(user: AuthUser): Promise<void> {
  const client = supabase()
  if (!client) return

  const { error } = await client.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  )

  if (error) console.error('[auth] could not update the profile row:', error.message)
}

/* ------------------------------------------------------------- lifecycle -- */

/**
 * Apply a session, from any source: restore, sign-in, refresh or sign-out.
 *
 * One function so the four paths cannot disagree about what "signed in" means.
 */
function applySession(session: Session | null): void {
  if (!session?.user) {
    setState({ status: 'unauthenticated', user: null })
    return
  }

  const user = toAuthUser(session.user)
  setState({ status: 'authenticated', user, error: null })
}

/**
 * Read whatever is on disk and decide the launch state.
 *
 * Called once, before any window exists, for a reason the user would notice
 * immediately otherwise: `App` refuses to render protected content while the
 * status is `initialising`, so resolving this before the window opens is what
 * stops the dashboard appearing for a frame and being replaced by the login
 * page — the flash requirement 11 rules out.
 *
 * A restored session is refreshed by supabase-js on its own if the access
 * token has expired; only a refresh token the server rejects lands the user
 * back on the login page.
 */
export async function initAuth(): Promise<AuthState> {
  if (initialised) return getAuthState()
  initialised = true

  const client = supabase()
  if (!client) {
    setState({ status: 'unauthenticated', user: null, configured: false })
    return getAuthState()
  }

  /*
   * Subscribed before the first read, so a refresh that happens during
   * start-up is not missed. The callback also covers every later transition:
   * token rotation, sign-out from another surface, and the user record
   * changing.
   */
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      applySession(null)
      return
    }
    if (session) applySession(session)
  })

  try {
    const { data, error } = await client.auth.getSession()
    if (error) throw error
    applySession(data.session)

    if (data.session?.user) {
      // Not awaited: the app must not wait on a display-data write to open.
      void syncProfile(toAuthUser(data.session.user))
    }
  } catch (err) {
    console.error('[auth] could not restore the stored session:', err)
    applySession(null)
  }

  return getAuthState()
}

/* ---------------------------------------------------------------- signin -- */

/**
 * Sign in with Google.
 *
 * The whole round trip, in order:
 *
 *   1. open the loopback listener, so nothing can arrive before it is ready
 *   2. ask Supabase for the authorisation URL — `skipBrowserRedirect`,
 *      because there is no browser in this process to redirect
 *   3. open it in the user's real browser
 *   4. wait for Supabase to redirect back with a single-use code
 *   5. exchange the code, using the PKCE verifier held in this process
 *
 * Step 1 comes first deliberately. Opening the browser and then binding the
 * port is a race that a warm OAuth session — one where Google does not need to
 * ask anything and redirects straight through — loses often enough to matter.
 */
export async function signInWithGoogle(): Promise<AuthState> {
  const client = supabase()
  if (!client) {
    setState({
      error: {
        kind: 'not_configured',
        message:
          'Backstage has no Supabase credentials yet. See SUPABASE_GOOGLE_AUTH_SETUP.md.'
      }
    })
    return getAuthState()
  }

  // One at a time. Two sign-ins share one code verifier, and the second
  // overwrites the first's — so both would then fail to exchange.
  if (state.signingIn || callbackIsOpen()) return getAuthState()

  setState({ signingIn: true, error: null })

  try {
    const waiting = awaitCallback()

    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl(),
        skipBrowserRedirect: true,
        /*
         * `offline` asks Google for a refresh token, which is what lets the
         * session survive the app being closed. `consent` is not forced: it
         * would re-prompt a returning user who has already granted access,
         * for no benefit.
         */
        queryParams: { access_type: 'offline' }
      }
    })

    if (error) throw error
    if (!data?.url) throw new Error('Supabase returned no authorisation URL')

    await shell.openExternal(data.url)

    const result = await waiting

    if (result.kind === 'cancelled') {
      setState({ signingIn: false })
      return getAuthState()
    }
    if (result.kind === 'timeout') {
      setState({
        signingIn: false,
        error: {
          kind: 'cancelled',
          message: 'The sign-in took too long and was cancelled. Try again.'
        }
      })
      return getAuthState()
    }
    if (result.kind === 'denied') {
      const classified = classify(result.description || 'access_denied')
      setState({ signingIn: false, error: classified })
      return getAuthState()
    }

    const exchanged = await client.auth.exchangeCodeForSession(result.code)
    if (exchanged.error) throw exchanged.error

    applySession(exchanged.data.session)
    setState({ signingIn: false })

    if (exchanged.data.session?.user) {
      await syncProfile(toAuthUser(exchanged.data.session.user))
    }
  } catch (err) {
    cancelCallback()
    setState({ signingIn: false, error: classify(err) })
  }

  return getAuthState()
}

/** Abandon a sign-in that is still waiting on the browser. */
export function cancelSignIn(): AuthState {
  cancelCallback()
  setState({ signingIn: false, error: null })
  return getAuthState()
}

/* --------------------------------------------------------------- signout -- */

/**
 * Sign out, and leave nothing behind.
 *
 * The order matters. Supabase is asked to revoke the refresh token first, so a
 * token that has already been copied off the machine stops working; only then
 * is local state cleared. Doing it the other way round would delete the token
 * this process needs in order to revoke it, leaving a live credential on the
 * server that nothing can now cancel.
 *
 * Local removal happens even when the revoke fails — offline, or a server
 * error. A machine the user has signed out of must not still hold their
 * session, and a refresh token that outlives the sign-out is a smaller problem
 * than one sitting on disk under a signed-out account.
 */
export async function signOut(): Promise<AuthState> {
  const client = supabase()

  cancelCallback()

  try {
    if (client) {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throw error
    }
  } catch (err) {
    console.error('[auth] the sign-out request failed; clearing locally anyway:', err)
  }

  clearStoredSession()
  setState({ status: 'unauthenticated', user: null, signingIn: false, error: null })

  return getAuthState()
}
