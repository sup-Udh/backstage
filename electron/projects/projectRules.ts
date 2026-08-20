import { basename, resolve } from 'node:path'
import type { Project } from '../../src/shared/projects'

/**
 * The rules governing project records.
 *
 * Pure functions with no store, no electron and no I/O behind them — the same
 * arrangement as `relationships.ts`, and for the same reason. These decide
 * whether a persisted record is usable and which project the app opens into,
 * and both answers are ones the user notices immediately if they are wrong: a
 * dropped project is a team that has vanished, and a mis-resolved active id is
 * an app that opens onto the wrong workspace.
 */

/** A readable default name: the folder the project lives in. */
export function nameFromPath(workspacePath: string): string {
  return basename(workspacePath.replace(/[\\/]+$/, '')) || workspacePath
}

/**
 * Coerce anything into a valid project, or reject it.
 *
 * Repaired where it can be, dropped where it cannot. The id and the workspace
 * path are the two irreparable fields: every tool resolves against the path,
 * and every child record is keyed by the id, so a record missing either is not
 * a project that could be opened. Everything else has a defensible default.
 */
export function normaliseProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>

  const id = typeof p.id === 'string' ? p.id.trim() : ''
  const rawPath =
    typeof p.workspacePath === 'string' ? p.workspacePath.trim() : ''
  if (!id || !rawPath) return null

  const workspacePath = resolve(rawPath)
  const name =
    typeof p.name === 'string' && p.name.trim()
      ? p.name.trim()
      : nameFromPath(workspacePath)

  return {
    id,
    name,
    workspacePath,
    themeId: typeof p.themeId === 'string' && p.themeId ? p.themeId : 'detective',
    characterRoster: Array.isArray(p.characterRoster)
      ? p.characterRoster.filter((x): x is string => typeof x === 'string')
      : [],
    godAgentId:
      typeof p.godAgentId === 'string' && p.godAgentId ? p.godAgentId : null,
    createdAt: Number.isFinite(p.createdAt) ? Number(p.createdAt) : Date.now(),
    updatedAt: Number.isFinite(p.updatedAt) ? Number(p.updatedAt) : Date.now()
  }
}

/**
 * Which project the app opens into.
 *
 * The stored id is resolved against the list rather than trusted: a project
 * can be removed by hand, or dropped by the normaliser above, and an active id
 * pointing at nothing would open the app onto no workspace at all. Falling
 * back to the first stored project is the closest thing to what the user had.
 */
export function resolveActiveId(
  projects: Project[],
  storedId: unknown
): string | null {
  if (
    typeof storedId === 'string' &&
    projects.some((p) => p.id === storedId)
  ) {
    return storedId
  }
  return projects[0]?.id ?? null
}

/**
 * Where each adopted agent sits in a project's roster.
 *
 * Migration re-seats rather than re-casts. The old slot indexed a theme's
 * whole cast — up to eight characters — and the new one indexes a project
 * roster that may hold three, so carrying the old number over would wrap
 * agents onto each other's faces. Ordering by position fills the roster from
 * the front, which keeps the team recognisable and guarantees nobody is cast
 * twice while a free character remains.
 */
export function reseatSlots(
  count: number,
  rosterSize: number,
  previousSlots: number[]
): number[] {
  const size = Math.max(1, rosterSize)
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    out.push(i < size ? i : ((previousSlots[i] ?? i) % size + size) % size)
  }
  return out
}
