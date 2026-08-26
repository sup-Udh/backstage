import { app, dialog } from 'electron'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * The workspace: which project the agents are allowed to touch.
 *
 * This is the security boundary for every local tool. There is exactly one
 * path validator — `resolveInside` — and every tool goes through it, so a
 * traversal bug can only ever exist in one place rather than in each tool.
 */

export interface WorkspaceInfo {
  root: string | null
  name: string | null
  exists: boolean
}

const STATE_FILE = 'workspace.json'

let root: string | null = null

function statePath(): string {
  return join(app.getPath('userData'), STATE_FILE)
}

export function loadWorkspace(): void {
  try {
    const saved = JSON.parse(readFileSync(statePath(), 'utf8')) as { root?: string }
    if (saved.root && existsSync(saved.root) && statSync(saved.root).isDirectory()) {
      root = saved.root
    }
  } catch {
    root = null
  }
}

function persist(): void {
  try {
    writeFileSync(statePath(), JSON.stringify({ root }), 'utf8')
  } catch {
    // Losing the preference is survivable; the user can pick again.
  }
}

export function getWorkspace(): WorkspaceInfo {
  if (!root) return { root: null, name: null, exists: false }
  return {
    root,
    name: root.split(/[\\/]/).filter(Boolean).pop() ?? root,
    exists: existsSync(root)
  }
}

export function getWorkspaceRoot(): string | null {
  return root
}

export function setWorkspace(next: string | null): WorkspaceInfo {
  root = next && existsSync(next) ? resolve(next) : null
  persist()
  return getWorkspace()
}

/** Native folder picker. Returns the new state, unchanged if cancelled. */
export async function pickWorkspace(): Promise<WorkspaceInfo> {
  const result = await dialog.showOpenDialog({
    title: 'Choose a project folder',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return getWorkspace()
  return setWorkspace(result.filePaths[0])
}

/**
 * Ask for a folder without adopting it.
 *
 * Project setup needs a path several steps before the project exists, and
 * opening the workspace at that point would point every file tool at a folder
 * the user has not finished choosing — and would strand them there if they
 * abandoned the wizard. The workspace is set when the project is opened, and
 * only then.
 */
export async function pickFolder(): Promise<{ path: string; name: string } | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose a project folder',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const path = resolve(result.filePaths[0])
  return { path, name: path.split(/[\\/]/).filter(Boolean).pop() ?? path }
}

/* ------------------------------------------------------- path validation -- */

export class WorkspaceError extends Error {}

/**
 * Resolve a caller-supplied path against the workspace and prove it stays
 * inside it.
 *
 * The check is done on the *resolved* path rather than by inspecting the input
 * for `..`, because string inspection is defeated by encodings, mixed
 * separators and symlink-free tricks. After resolution, a path is inside the
 * workspace if and only if the relative path from the root neither starts with
 * `..` nor is absolute.
 */
export function resolveInside(relPath: string): string {
  const base = root
  if (!base) throw new WorkspaceError('No workspace folder is open.')

  const raw = typeof relPath === 'string' ? relPath.trim() : ''
  const candidate = raw === '' || raw === '.' ? base : resolve(base, raw)

  const rel = relative(base, candidate)
  if (rel === '') return base
  if (rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) {
    throw new WorkspaceError(
      'That path is outside the workspace. Agents may only touch the open project.'
    )
  }
  return candidate
}

/** Present a path back to the model as workspace-relative. */
export function toRelative(absPath: string): string {
  if (!root) return absPath
  const rel = relative(root, absPath)
  return rel === '' ? '.' : rel.split(sep).join('/')
}
