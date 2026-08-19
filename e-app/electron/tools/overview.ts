import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getWorkspaceRoot, toRelative } from '../workspace/WorkspaceManager'
import { truncate, type AgentTool, type ToolResult } from './types'

/**
 * A one-call orientation of the workspace.
 *
 * Without this, "summarise this project" costs a dozen tool calls before the
 * model knows anything: list the root, read package.json, list src, list
 * electron, and so on. This gathers the same picture in one call — manifest,
 * readme, a bounded directory tree and git state — so the budget goes on the
 * files that actually matter.
 */

const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  '.cache',
  'coverage',
  '__pycache__',
  'target',
  '.venv',
  'vendor'
])

/** Manifests worth reading whole, in preference order. */
const MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json'
]

const READMES = ['README.md', 'readme.md', 'README.rst', 'README.txt', 'README']

function tree(dir: string, prefix: string, depth: number, lines: string[]): void {
  if (depth <= 0 || lines.length > 220) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
  const files = entries
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const d of dirs) {
    lines.push(`${prefix}${d.name}/`)
    tree(join(dir, d.name), `${prefix}  `, depth - 1, lines)
  }
  // Files are listed but not recursed, and long folders are summarised.
  const shown = files.slice(0, 14)
  for (const f of shown) lines.push(`${prefix}${f.name}`)
  if (files.length > shown.length) {
    lines.push(`${prefix}… and ${files.length - shown.length} more files`)
  }
}

function gitSummary(root: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['status', '--porcelain=v1', '-b'],
      { cwd: root, windowsHide: true, maxBuffer: 512 * 1024 },
      (err, stdout) => {
        if (err && !stdout) return resolve('Not a git repository.')
        const lines = stdout.trim().split('\n').filter(Boolean)
        const branch = lines[0]?.replace(/^## /, '') ?? 'unknown'
        const changed = lines.slice(1)
        resolve(
          changed.length === 0
            ? `Branch ${branch}, working tree clean.`
            : `Branch ${branch}, ${changed.length} changed file(s):\n${changed.slice(0, 25).join('\n')}`
        )
      }
    )
  })
}

export const workspaceOverview: AgentTool = {
  name: 'workspace_overview',
  label: 'Getting oriented',
  description:
    'Get a one-shot picture of the workspace: the package manifest, the README, a directory tree and git status. Call this FIRST for any task about the project as a whole — it replaces several list and read calls.',
  inputSchema: { type: 'object', properties: {} },
  describe: () => 'Surveyed the project',

  async execute(): Promise<ToolResult> {
    const root = getWorkspaceRoot()
    if (!root) return { success: false, error: 'No workspace folder is open.' }

    const parts: string[] = [`Workspace root: ${root}`]

    const manifest = MANIFESTS.map((m) => join(root, m)).find((p) => existsSync(p))
    if (manifest) {
      try {
        const raw = readFileSync(manifest, 'utf8')
        parts.push(
          `--- ${toRelative(manifest)} ---\n${truncate(raw, 6_000).text}`
        )
      } catch {
        // Unreadable manifest is not fatal; the tree still helps.
      }
    } else {
      parts.push('No recognised package manifest at the root.')
    }

    const readme = READMES.map((r) => join(root, r)).find((p) => existsSync(p))
    if (readme) {
      try {
        parts.push(
          `--- ${toRelative(readme)} ---\n${truncate(readFileSync(readme, 'utf8'), 4_000).text}`
        )
      } catch {
        // Same.
      }
    }

    const lines: string[] = []
    tree(root, '', 3, lines)
    parts.push(`--- directory tree (depth 3, build output omitted) ---\n${lines.join('\n')}`)

    parts.push(`--- git ---\n${await gitSummary(root)}`)

    let totalFiles = 0
    try {
      const count = (dir: string, depth: number): void => {
        if (depth <= 0 || totalFiles > 5000) return
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.') || SKIP.has(e.name)) continue
          const full = join(dir, e.name)
          if (e.isDirectory()) count(full, depth - 1)
          else if (statSync(full).isFile()) totalFiles++
        }
      }
      count(root, 6)
      parts.push(`--- size ---\nApproximately ${totalFiles} source files (excluding build output).`)
    } catch {
      // Counting is a nicety.
    }

    const { text, truncated } = truncate(parts.join('\n\n'), 20_000)
    return { success: true, output: text, metadata: { truncated } }
  }
}

export const overviewTools = [workspaceOverview]
