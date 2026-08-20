import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Small JSON files in userData.
 *
 * Every store here has the same failure policy: a corrupt or missing file
 * falls back to the supplied default rather than throwing, and a failed write
 * is survivable because the in-memory value is still correct. The app must
 * open even when its state files do not.
 */

export function readJson<T>(file: string, fallback: T): T {
  try {
    const path = join(app.getPath('userData'), file)
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJson(file: string, value: unknown): void {
  try {
    writeFileSync(
      join(app.getPath('userData'), file),
      JSON.stringify(value, null, 2),
      'utf8'
    )
  } catch {
    // Losing the write is survivable; the in-memory value still works.
  }
}

/** Short, sortable, collision-resistant enough for ids within a session. */
let counter = 0
export function makeId(prefix: string): string {
  counter = (counter + 1) % 0xffff
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(3, '0')}`
}
