import { readJson, writeJson } from '../agents/persist'
import { currentUserId } from './authService'

/**
 * Small per-account preferences that are not worth a cloud table.
 *
 * Exactly one thing lives here so far: whether this account has been through
 * provider onboarding on this machine. That is deliberately *local* rather
 * than mirrored — it answers "has this person been shown the setup screen
 * here", and the honest answer on a new machine is no, because their keys are
 * not on it either. Syncing it would mean a user signing in on a second
 * laptop being dropped straight into a dashboard with no provider connected
 * and no explanation of how to connect one.
 *
 * Keyed by Supabase user id, like everything else that belongs to somebody.
 */

const FILE = 'user-prefs.json'

interface Prefs {
  /** Set once the user has either connected a provider or chosen to skip. */
  onboardedAt?: number
}

type Store = Record<string, Prefs>

function load(): Store {
  const raw = readJson<Store>(FILE, {})
  return raw && typeof raw === 'object' ? raw : {}
}

function prefsFor(userId: string): Prefs {
  return load()[userId] ?? {}
}

/**
 * Whether the provider setup screen still needs showing.
 *
 * Signed out is `false`: there is nobody to onboard, and answering `true`
 * would put the onboarding screen in front of the login page.
 */
export function needsOnboarding(): boolean {
  const userId = currentUserId()
  if (!userId) return false
  return prefsFor(userId).onboardedAt === undefined
}

/**
 * Mark onboarding done.
 *
 * Called both when the user connects a provider and when they skip, because
 * the screen's job is to have been *offered* once — re-offering it on every
 * launch to somebody who deliberately declined is nagging, and the same
 * controls live in Settings permanently.
 */
export function completeOnboarding(): void {
  const userId = currentUserId()
  if (!userId) return

  const store = load()
  store[userId] = { ...store[userId], onboardedAt: Date.now() }
  writeJson(FILE, store)
}

/**
 * Note that this account has been used on this machine.
 *
 * Recorded on every sign-in, and read by exactly one thing: the decision about
 * whether pre-account provider keys may be adopted. See
 * `claimUnownedCredentials`.
 */
export function recordAccountSeen(): void {
  const userId = currentUserId()
  if (!userId) return

  const store = load()
  if (store[userId]) return
  store[userId] = {}
  writeJson(FILE, store)
}

/** How many distinct accounts have signed in on this machine. */
export function knownAccountCount(): number {
  return Object.keys(load()).length
}

/** Forget an account's preferences, for account deletion. */
export function forgetUserPrefs(userId: string): void {
  const store = load()
  if (!(userId in store)) return
  delete store[userId]
  writeJson(FILE, store)
}
