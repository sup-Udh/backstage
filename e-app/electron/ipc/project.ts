import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import {
  getWorkspaceRoot,
  resolveInside,
  toRelative
} from '../workspace/WorkspaceManager'
import {
  filesystemRead,
  filesystemSearch
} from '../tools/filesystem'
import { gitDiff, gitLog, gitStatus } from '../tools/git'

/**
 * Files, git and project commands for the UI panels.
 *
 * These reuse the same tools the agents use, so the file the user opens and
 * the file an agent reads go through one path — including `resolveInside`,
 * which is still the only place that decides whether an access is allowed.
 */

const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  'target',
  '.venv'
])

export interface DirEntry {
  name: string
  path: string
  kind: 'dir' | 'file'
  size?: number
}

export function registerProjectHandlers(): void {
  /* ------------------------------------------------------------- files -- */

  ipcMain.handle('files:list', (_e, relPath: unknown): DirEntry[] => {
    try {
      const dir = resolveInside(typeof relPath === 'string' ? relPath : '.')
      if (!existsSync(dir) || !statSync(dir).isDirectory()) return []

      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => !SKIP.has(e.name))
        .map((e) => {
          const full = join(dir, e.name)
          let size: number | undefined
          try {
            if (e.isFile()) size = statSync(full).size
          } catch {
            // A file that vanished mid-listing is not an error.
          }
          return {
            name: e.name,
            path: toRelative(full),
            kind: e.isDirectory() ? ('dir' as const) : ('file' as const),
            size
          }
        })
        .sort((a, b) =>
          a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1
        )
    } catch {
      return []
    }
  })

  ipcMain.handle('files:read', async (_e, relPath: unknown) => {
    const res = await filesystemRead.execute(
      { path: String(relPath ?? '') },
      { workspaceRoot: getWorkspaceRoot() ?? '', agentId: 'ui', taskId: 'ui' }
    )
    return { success: res.success, content: res.output, error: res.error }
  })

  ipcMain.handle('files:search', async (_e, query: unknown, filenames: unknown) => {
    const res = await filesystemSearch.execute(
      { query: String(query ?? ''), filenames: Boolean(filenames), maxResults: 80 },
      { workspaceRoot: getWorkspaceRoot() ?? '', agentId: 'ui', taskId: 'ui' }
    )
    return { success: res.success, output: res.output, error: res.error }
  })

  /* --------------------------------------------------------------- git -- */

  ipcMain.handle('git:status', async () => {
    const res = await gitStatus.execute({}, ctx())
    return { success: res.success, output: res.output, error: res.error }
  })

  ipcMain.handle('git:diff', async (_e, path: unknown) => {
    const res = await gitDiff.execute(
      typeof path === 'string' && path ? { path } : {},
      ctx()
    )
    return { success: res.success, output: res.output, error: res.error }
  })

  ipcMain.handle('git:log', async () => {
    const res = await gitLog.execute({ limit: 30 }, ctx())
    return { success: res.success, output: res.output, error: res.error }
  })

  ipcMain.handle('git:branch', () => {
    const root = getWorkspaceRoot()
    if (!root) return { branch: null }
    return new Promise((resolve) => {
      execFile(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: root, windowsHide: true },
        (err, stdout) => resolve({ branch: err ? null : stdout.trim() })
      )
    })
  })

  /* ---------------------------------------------------------- commands -- */

  /**
   * Project commands, read from whatever manifest the workspace has. Offering
   * the real scripts beats a hard-coded list that is wrong for most projects.
   */
  ipcMain.handle('commands:list', () => {
    const root = getWorkspaceRoot()
    if (!root) return []

    const out: { label: string; command: string; source: string }[] = []

    const pkgPath = join(root, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          scripts?: Record<string, string>
        }
        const manager = existsSync(join(root, 'pnpm-lock.yaml'))
          ? 'pnpm'
          : existsSync(join(root, 'yarn.lock'))
            ? 'yarn'
            : 'npm'
        for (const name of Object.keys(pkg.scripts ?? {})) {
          out.push({
            label: name,
            command: `${manager} run ${name}`,
            source: 'package.json'
          })
        }
      } catch {
        // A malformed manifest simply yields no commands.
      }
    }

    for (const [file, cmds] of [
      ['Makefile', ['make']],
      ['Cargo.toml', ['cargo build', 'cargo test']],
      ['pyproject.toml', ['python -m pytest']],
      ['go.mod', ['go build ./...', 'go test ./...']]
    ] as [string, string[]][]) {
      if (!existsSync(join(root, file))) continue
      for (const command of cmds) {
        out.push({ label: command, command, source: file })
      }
    }

    return out
  })
}

function ctx() {
  return { workspaceRoot: getWorkspaceRoot() ?? '', agentId: 'ui', taskId: 'ui' }
}
