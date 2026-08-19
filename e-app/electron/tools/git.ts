import { execFile } from 'node:child_process'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import { truncate, type AgentTool, type ToolResult } from './types'

/**
 * Git tools.
 *
 * Read-only by design, so none of them needs approval. They run git directly
 * with an argument array rather than through a shell, which removes any
 * question of injection through the model's parameters.
 */

function git(args: string[], maxChars: number): Promise<ToolResult> {
  const root = getWorkspaceRoot()
  if (!root) {
    return Promise.resolve({ success: false, error: 'No workspace folder is open.' })
  }

  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd: root, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          const message = (stderr || err.message || '').trim()
          resolve({
            success: false,
            error: message.includes('not a git repository')
              ? 'This workspace is not a git repository.'
              : message.slice(0, 400) || 'git failed.'
          })
          return
        }
        const { text, truncated } = truncate(stdout.trim() || '(no output)', maxChars)
        resolve({ success: true, output: text, metadata: { truncated } })
      }
    )
  })
}

export const gitStatus: AgentTool = {
  name: 'git_status',
  label: 'Checking git status',
  description:
    'Show the working tree status of the workspace repository: staged, unstaged and untracked files.',
  inputSchema: { type: 'object', properties: {} },
  describe: () => 'Checked git status',
  execute: () => git(['status', '--porcelain=v1', '-b'], 8_000)
}

export const gitDiff: AgentTool = {
  name: 'git_diff',
  label: 'Reading the diff',
  description:
    'Show uncommitted changes. Pass staged:true for the index, or a path to narrow it to one file or folder.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Optional path to limit the diff to.' },
      staged: { type: 'boolean', description: 'Diff the index instead of the worktree.' }
    }
  },
  describe: (i) => (i.path ? `Read the diff for ${String(i.path)}` : 'Read the diff'),
  execute: (input) => {
    const args = ['diff', '--stat', '--patch']
    if (input.staged) args.push('--staged')
    if (typeof input.path === 'string' && input.path.trim()) {
      // `--` stops git treating a path as a revision.
      args.push('--', input.path.trim())
    }
    return git(args, 16_000)
  }
}

export const gitLog: AgentTool = {
  name: 'git_log',
  label: 'Reading the history',
  description: 'Show recent commits, most recent first.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'How many commits. Default 20, max 100.' },
      path: { type: 'string', description: 'Optional path to limit history to.' }
    }
  },
  describe: () => 'Read the commit history',
  execute: (input) => {
    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100)
    const args = ['log', `-${limit}`, '--pretty=format:%h %ad %an: %s', '--date=short']
    if (typeof input.path === 'string' && input.path.trim()) {
      args.push('--', input.path.trim())
    }
    return git(args, 8_000)
  }
}

export const gitTools = [gitStatus, gitDiff, gitLog]
