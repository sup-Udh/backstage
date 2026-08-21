import { readJson, writeJson } from './persist'

/**
 * One-time data migrations, recorded so they run exactly once.
 *
 * These exist because a fix to how records are *created* does nothing for
 * records that already exist. That distinction caused the bug this file was
 * written for, and it is worth stating plainly: changing a default changes
 * tomorrow's data, never yesterday's.
 */

const FILE = 'migrations.json'

type Ledger = Record<string, boolean>

/**
 * Run `apply` unless it has run before, and remember either way.
 *
 * Deliberately records the migration as done even though `apply` may have
 * changed nothing: "already correct" and "corrected" are the same end state,
 * and re-running a grant every launch would fight the user every time they
 * turned the same setting off.
 */
export function once(name: string, apply: () => void): void {
  const ledger = readJson<Ledger>(FILE, {})
  if (ledger[name]) return

  apply()

  ledger[name] = true
  writeJson(FILE, ledger)
}
