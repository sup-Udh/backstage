import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where the Supabase session lives on disk.
 *
 * supabase-js expects a `localStorage`-shaped object. In a browser that is
 * plaintext in the profile directory; here it is a file encrypted with
 * Electron's `safeStorage`, which is the same OS-held key `secureStore` uses
 * for provider API keys — DPAPI on Windows, the Keychain on macOS,
 * libsecret/kwallet on Linux.
 *
 * This is the reason the Supabase client is in the main process at all. The
 * refresh token is a long-lived bearer credential: whoever holds it can mint
 * access tokens for this account until it is revoked. Keeping it here means it
 * is encrypted at rest, never crosses IPC, and is not sitting in the storage
 * of a window that also renders model output and remote avatars.
 *
 * Two keys are kept, and both matter:
 *
 *   the session       access token, refresh token, expiry, user
 *   the code verifier the PKCE secret, written when sign-in starts and read
 *                     when the callback comes back
 *
 * They are held together because supabase-js writes both through this one
 * interface, and because both must survive the app being closed mid-sign-in.
 */

const DIR = 'auth'
const FILE = 'supabase-session.enc'
/** Written only when the OS refuses to encrypt. See `write`. */
const PLAIN_FILE = 'supabase-session.json'

type Bag = Record<string, string>

let cache: Bag | null = null

function dir(): string {
  const d = join(app.getPath('userData'), DIR)
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function encPath(): string {
  return join(dir(), FILE)
}

function plainPath(): string {
  return join(dir(), PLAIN_FILE)
}

function read(): Bag {
  if (cache) return cache

  try {
    if (existsSync(encPath())) {
      const decrypted = safeStorage.decryptString(readFileSync(encPath()))
      cache = JSON.parse(decrypted) as Bag
      return cache
    }
  } catch {
    /*
     * Unreadable rather than absent: the file was written under a different OS
     * user or profile, or the platform key has been rotated. There is nothing
     * to recover — the correct outcome is an empty bag, which reads as "signed
     * out" and sends the user through Google once more.
     */
  }

  try {
    if (existsSync(plainPath())) {
      cache = JSON.parse(readFileSync(plainPath(), 'utf8')) as Bag
      return cache
    }
  } catch {
    // Same reasoning.
  }

  cache = {}
  return cache
}

/**
 * Persist the bag.
 *
 * Encryption is not optional here, with one deliberate exception. `safeStorage`
 * is unavailable on a Linux desktop with no keyring service running, and
 * `secureStore` refuses outright in that case because writing an API key in
 * plaintext is worse than failing. A session is a slightly different trade:
 * refusing would make the app unusable rather than degraded, and the token
 * expires. So it falls back, loudly, and the account panel says the session is
 * unencrypted so the user can decide whether that is acceptable on that
 * machine.
 */
function write(bag: Bag): void {
  cache = bag

  const json = JSON.stringify(bag)

  try {
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(encPath(), safeStorage.encryptString(json))
      // Never leave an older plaintext copy behind once encryption works.
      rmSync(plainPath(), { force: true })
      return
    }
  } catch (err) {
    console.error('[auth] failed to write the encrypted session:', err)
  }

  console.warn(
    '[auth] OS secure storage is unavailable; the Supabase session will be ' +
      'stored unencrypted. On Linux, install and run a keyring service ' +
      '(gnome-keyring or kwallet) to fix this.'
  )
  try {
    writeFileSync(plainPath(), json, 'utf8')
  } catch (err) {
    console.error('[auth] failed to persist the session at all:', err)
  }
}

/** Whether the stored session is protected by the OS key. */
export function sessionIsEncrypted(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * The storage adapter handed to supabase-js.
 *
 * Synchronous, which the interface permits — the whole bag is one small JSON
 * object and it is cached in memory after the first read, so the client is
 * never blocked on disk during a token refresh.
 */
export const supabaseSessionStorage = {
  getItem(key: string): string | null {
    return read()[key] ?? null
  },

  setItem(key: string, value: string): void {
    const bag = { ...read(), [key]: value }
    write(bag)
  },

  removeItem(key: string): void {
    const bag = { ...read() }
    delete bag[key]
    write(bag)
  }
}

/**
 * Destroy every stored credential.
 *
 * Called on sign-out, after Supabase has revoked the refresh token. Removing
 * the keys one at a time would leave the file behind holding whatever
 * supabase-js had not thought to clear; a signed-out machine should have no
 * artefact of the session left on it at all.
 */
export function clearStoredSession(): void {
  cache = {}
  try {
    rmSync(encPath(), { force: true })
    rmSync(plainPath(), { force: true })
  } catch (err) {
    console.error('[auth] failed to remove the stored session:', err)
  }
}
