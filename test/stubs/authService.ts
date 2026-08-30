/**
 * A signed-in account, without Supabase.
 *
 * Only `currentUserId` is stubbed, because that is the whole of what the
 * stores ask authentication for — every scoped read in the main process
 * resolves ownership through this one function, which is exactly the property
 * the isolation checks are there to exercise.
 *
 * It is settable, so a check can sign in as somebody else and confirm that the
 * first account's projects, agents and automations become invisible rather
 * than merely hidden by the interface.
 */

let userId = 'user-a'

export function currentUserId(): string {
  return userId
}

export function isAuthenticated(): boolean {
  return userId !== ''
}

/** Test-only. Sign in as somebody else, or as nobody. */
export function signInAs(id: string): void {
  userId = id
}
