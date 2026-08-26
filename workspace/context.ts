import { execSync } from 'node:child_process'
import { getWorkspaceRoot } from './WorkspaceManager'
import { terminals } from '../terminal/TerminalSessionManager'

/**
 * Gather current workspace context for the agents.
 * This satisfies Phase 10: Workspace awareness/context layer.
 */
export function getWorkspaceContext(): string {
  const root = getWorkspaceRoot()
  if (!root) return 'No workspace is currently open.'

  let context = `WORKSPACE ROOT: ${root}\n`

  // 1. Git Context (branch, status, modified files)
  try {
    const branch = execSync('git branch --show-current', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (branch) {
      context += `\nGIT BRANCH: ${branch}\n`
      
      const status = execSync('git status --short', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (status) {
        context += `GIT STATUS (Modified/Untracked):\n${status}\n`
      } else {
        context += `GIT STATUS: Working tree clean\n`
      }
    }
  } catch {
    // Not a git repository or git not installed
  }

  // 2. Terminal History (if any)
  const activeTerminals = terminals.list()
  if (activeTerminals.length > 0) {
    context += `\nACTIVE TERMINALS (${activeTerminals.length}):\n`
    for (const term of activeTerminals) {
      const buffer = terminals.buffer(term.id)
      // Grab the last 1000 characters of terminal output to avoid massive context
      const snippet = buffer.length > 1000 ? '...' + buffer.slice(-1000) : buffer
      // Remove ansi escape codes to save tokens and improve readability
      const cleanSnippet = snippet.replace(/\x1b\[[0-9;]*m/g, '').trim()
      
      context += `--- Terminal: ${term.title} (Status: ${term.status}) ---\n`
      context += cleanSnippet ? `${cleanSnippet}\n` : `(empty)\n`
    }
  }

  return context
}
