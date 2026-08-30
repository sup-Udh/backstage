import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveInside, toRelative } from '../workspace/WorkspaceManager'
import { truncate, type AgentTool, type ToolResult } from './types'

/**
 * Filesystem tools.
 *
 * Every path goes through `resolveInside`, which is the single place that
 * decides whether an access is inside the workspace. None of these functions
 * does its own path checking.
 */

/** Directories never worth walking into — noise, and enormous. */
const SKIP_DIRS = new Set([
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

const MAX_FILE_BYTES = 512 * 1024
const MAX_WRITE_BYTES = 1024 * 1024

function fail(error: string): ToolResult {
  return { success: false, error }
}

function isBinary(buf: Buffer): boolean {
  // A NUL in the first block is the usual cheap heuristic.
  return buf.subarray(0, 4096).includes(0)
}

/* ------------------------------------------------------------------ list -- */

export const filesystemList: AgentTool = {
  name: 'filesystem_list',
  label: 'Listing files',
  description:
    'List the files and folders at a path inside the workspace. Use this first to orient yourself. Returns names, with a trailing slash for directories.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative path. Use "." for the project root.'
      }
    },
    required: ['path']
  },
  describe: (i) => `Listed ${i.path === '.' ? 'the project root' : String(i.path)}`,

  async execute(input, ctx) {
    try {
      const target = resolveInside(String(input.path ?? '.'), ctx.workspaceRoot)
      if (!existsSync(target)) return fail(`No such path: ${input.path}`)
      if (!statSync(target).isDirectory()) return fail(`Not a directory: ${input.path}`)

      const entries = readdirSync(target, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.') || e.name === '.gitignore')
        .map((e) => {
          if (e.isDirectory()) return `${e.name}/`
          try {
            const size = statSync(join(target, e.name)).size
            return `${e.name}  (${size} bytes)`
          } catch {
            return e.name
          }
        })
        .sort()

      const { text, truncated } = truncate(entries.join('\n') || '(empty)')
      return { success: true, output: text, metadata: { truncated } }
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not list that path.')
    }
  }
}

/* ------------------------------------------------------------------ read -- */

export const filesystemRead: AgentTool = {
  name: 'filesystem_read',
  label: 'Reading a file',
  description:
    'Read a text file from the workspace. Always read a file before drawing conclusions about it or editing it.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path.' }
    },
    required: ['path']
  },
  describe: (i) => `Read ${String(i.path)}`,

  async execute(input, ctx) {
    try {
      const target = resolveInside(String(input.path ?? ''), ctx.workspaceRoot)
      if (!existsSync(target)) return fail(`No such file: ${input.path}`)
      const info = statSync(target)
      if (info.isDirectory()) return fail(`${input.path} is a directory. Use filesystem_list.`)
      if (info.size > MAX_FILE_BYTES) {
        return fail(`That file is ${info.size} bytes, too large to read whole.`)
      }

      const buf = readFileSync(target)
      if (isBinary(buf)) return fail(`${input.path} looks like a binary file.`)

      const { text, truncated } = truncate(buf.toString('utf8'))
      return {
        success: true,
        output: text,
        metadata: { path: toRelative(target, ctx.workspaceRoot), truncated }
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }
}

/* ---------------------------------------------------------------- search -- */

function walk(dir: string, out: string[], depth = 0): void {
  if (depth > 12 || out.length > 8000) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.gitignore') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(full, out, depth + 1)
    } else {
      out.push(full)
    }
  }
}

export const filesystemSearch: AgentTool = {
  name: 'filesystem_search',
  label: 'Searching the project',
  description:
    'Search file contents, or file names, across the workspace. Use this instead of reading many files: search first, then read the files that matter. Skips node_modules, .git and build output.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text or regular expression to find.' },
      path: { type: 'string', description: 'Optional subdirectory to search in.' },
      filenames: {
        type: 'boolean',
        description: 'Search file names instead of file contents.'
      },
      maxResults: { type: 'number', description: 'Default 60.' }
    },
    required: ['query']
  },
  describe: (i) => `Searched for "${String(i.query)}"`,

  async execute(input, ctx) {
    try {
      const query = String(input.query ?? '').trim()
      if (!query) return fail('Empty query.')
      const base = resolveInside(String(input.path ?? '.'), ctx.workspaceRoot)
      const limit = Math.min(Number(input.maxResults) || 60, 200)

      const files: string[] = []
      walk(base, files)

      let re: RegExp
      try {
        re = new RegExp(query, 'i')
      } catch {
        // Not valid regex; treat it as a literal.
        re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      }

      const hits: string[] = []

      if (input.filenames) {
        for (const f of files) {
          const rel = toRelative(f, ctx.workspaceRoot)
          if (re.test(rel)) hits.push(rel)
          if (hits.length >= limit) break
        }
      } else {
        for (const f of files) {
          if (hits.length >= limit) break
          let content: string
          try {
            const info = statSync(f)
            if (info.size > MAX_FILE_BYTES) continue
            const buf = readFileSync(f)
            if (isBinary(buf)) continue
            content = buf.toString('utf8')
          } catch {
            continue
          }
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              hits.push(`${toRelative(f, ctx.workspaceRoot)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
              if (hits.length >= limit) break
            }
          }
        }
      }

      const body = hits.length ? hits.join('\n') : 'No matches.'
      const { text, truncated } = truncate(body)
      return {
        success: true,
        output: `${hits.length} match(es) across ${files.length} files.\n\n${text}`,
        metadata: { truncated }
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Search failed.')
    }
  }
}

/* ---------------------------------------------------------------- create -- */

export const filesystemCreate: AgentTool = {
  name: 'filesystem_create',
  label: 'Creating a file',
  description:
    'Create a new file, or overwrite one that already exists. Parent folders are created as needed. To change part of an existing file prefer filesystem_edit.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path.' },
      content: { type: 'string', description: 'Full contents of the file.' }
    },
    required: ['path', 'content']
  },
  describe: (i) => `Created ${String(i.path)}`,

  async execute(input, ctx) {
    try {
      const target = resolveInside(String(input.path ?? ''), ctx.workspaceRoot)
      const content = String(input.content ?? '')
      if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) {
        return fail('That content is too large to write.')
      }

      const existed = existsSync(target)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content, 'utf8')

      ctx.onFileChange?.(existed ? 'modified' : 'created', toRelative(target, ctx.workspaceRoot))
      return {
        success: true,
        output: `${existed ? 'Overwrote' : 'Created'} ${toRelative(target, ctx.workspaceRoot)} (${content.length} chars).`,
        metadata: { path: toRelative(target, ctx.workspaceRoot) }
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not write that file.')
    }
  }
}

/* ------------------------------------------------------------------ edit -- */

export const filesystemEdit: AgentTool = {
  name: 'filesystem_edit',
  label: 'Editing a file',
  description:
    'Replace an exact snippet in an existing file. oldText must match the file exactly and appear once. Fails rather than guessing, so it can never silently destroy work.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path.' },
      oldText: { type: 'string', description: 'Exact text to replace.' },
      newText: { type: 'string', description: 'Replacement text.' }
    },
    required: ['path', 'oldText', 'newText']
  },
  describe: (i) => `Edited ${String(i.path)}`,

  async execute(input, ctx) {
    try {
      const target = resolveInside(String(input.path ?? ''), ctx.workspaceRoot)
      if (!existsSync(target)) return fail(`No such file: ${input.path}`)

      const oldText = String(input.oldText ?? '')
      const newText = String(input.newText ?? '')
      if (!oldText) return fail('oldText is required and must not be empty.')

      const content = readFileSync(target, 'utf8')
      const first = content.indexOf(oldText)
      if (first === -1) {
        return fail(
          'oldText was not found in that file. Read the file again and copy the exact text, including whitespace.'
        )
      }
      if (content.indexOf(oldText, first + 1) !== -1) {
        return fail(
          'oldText appears more than once. Include more surrounding context so it is unique.'
        )
      }

      writeFileSync(target, content.replace(oldText, newText), 'utf8')
      ctx.onFileChange?.('modified', toRelative(target, ctx.workspaceRoot))
      return {
        success: true,
        output: `Edited ${toRelative(target, ctx.workspaceRoot)}.`,
        metadata: { path: toRelative(target, ctx.workspaceRoot) }
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not edit that file.')
    }
  }
}

export const filesystemTools = [
  filesystemList,
  filesystemRead,
  filesystemSearch,
  filesystemCreate,
  filesystemEdit
]
