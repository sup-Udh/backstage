import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseConfig } from './env'
import { supabaseSessionStorage } from './sessionStore'

/**
 * The one Supabase client.
 *
 * Main process only, and there is exactly one. Instantiating clients where
 * they happen to be needed would give each its own auth state and its own
 * refresh timer, so two of them would race to rotate the same refresh token
 * and one would lose — which presents to the user as being signed out at
 * random.
 *
 * The renderer has no client and no token. Everything it can do to an account
 * goes through `window.backstage.auth`, which is the same discipline the
 * provider keys are held to: the process that holds a credential is the
 * process that uses it.
 */

let client: SupabaseClient | null = null

/**
 * The client, or null when Supabase is not configured.
 *
 * Null rather than a client pointed at an empty URL: a misconfigured client
 * fails at the first request with a network error, which sends the user
 * looking for a connectivity problem instead of a missing `.env`. Every caller
 * checks, and the login page says plainly that credentials are missing.
 */
export function supabase(): SupabaseClient | null {
  if (client) return client

  const config = supabaseConfig()
  if (!config.configured) return null

  client = createClient(config.url, config.anonKey, {
    auth: {
      /*
       * PKCE, because this is a native application.
       *
       * The implicit flow returns tokens in a URL fragment, which would mean
       * the access and refresh tokens travelling through the operating
       * system's URL handling and appearing in the browser's history. PKCE
       * returns a single-use code that is worthless without the verifier held
       * in this process — which is what makes a loopback redirect safe from
       * anything else listening on the machine.
       */
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      /*
       * There is no URL to detect a session in. supabase-js would otherwise
       * reach for `window.location` on start-up, which does not exist here;
       * the callback is delivered to the loopback listener instead.
       */
      detectSessionInUrl: false,
      storage: supabaseSessionStorage,
      storageKey: 'backstage.auth'
    },
    global: {
      headers: { 'x-client-info': 'backstage-electron' }
    }
  })

  return client
}

/** Whether a URL and public key were found. Drives the login page's copy. */
export function isSupabaseConfigured(): boolean {
  return supabaseConfig().configured
}
