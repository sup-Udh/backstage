import { execFile, spawn } from 'node:child_process'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import { truncate, type AgentTool, type ToolResult } from './types'

/**
 * Command execution.
 *
 * Commands run with the workspace as the working directory, under a timeout,
 * with bounded output and with the process tree killed if it overruns.
 *
 * Patterns that can destroy work are refused outright rather than approved,
 * because a model that has misread a repository should not be one confirmation
 * click away from `rm -rf`. The narrower, reversible equivalents are still
 * available to it.
 */

const TIMEOUT_MS = 120_000
const MAX_BUFFER = 2 * 1024 * 1024

/**
 * Refused unconditionally. Deliberately about *destruction*, not about
 * writing: agents are meant to change files, just not to wipe them out or
 * discard the user's uncommitted work.
 */
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf]/i, why: 'recursive or forced delete' },
  { re: /\brmdir\b\s+\/s/i, why: 'recursive directory delete' },
  { re: /\bdel\b\s+\/[sq]/i, why: 'recursive delete' },
  { re: /\bformat\b/i, why: 'disk format' },
  { re: /\bmkfs\b/i, why: 'filesystem creation' },
  { re: /\bdd\s+if=/i, why: 'raw disk write' },
  { re: /git\s+reset\s+--hard/i, why: 'discards uncommitted work' },
  { re: /git\s+clean\s+-[a-z]*[fdx]/i, why: 'deletes untracked files' },
  { re: /git\s+push\s+.*--force/i, why: 'force push' },
  { re: /\b(shutdown|reboot|halt)\b/i, why: 'machine power control' },
  { re: />\s*\/dev\/sd/i, why: 'raw device write' },
  { re: /\bchmod\s+-R\s+777/i, why: 'permission wipe' },
  { re: /\bcurl\b[^|]*\|\s*(ba)?sh/i, why: 'pipes a download straight into a shell' },
  { re: /\bwget\b[^|]*\|\s*(ba)?sh/i, why: 'pipes a download straight into a shell' }
]

export function screenCommand(command: string): string | null {
  for (const rule of FORBIDDEN) {
    if (rule.re.test(command)) return rule.why
  }
  return null
}

export const terminalRun: AgentTool = {
  name: 'terminal_run',
  label: 'Running a command',
  description:
    'Run a shell command in the workspace and get back stdout, stderr and the exit code. Use this to build, test, lint or inspect. Commands that would destroy work are refused.',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command line to run, e.g. "npm run build".'
      },
      timeoutMs: { type: 'number', description: 'Optional, default 120000.' }
    },
    required: ['command']
  },
  describe: (i) => `Ran \`${String(i.command).slice(0, 70)}\``,

  async execute(input, ctx): Promise<ToolResult> {
    const command = String(input.command ?? '').trim()
    if (!command) return { success: false, error: 'Empty command.' }

    const root = ctx.workspaceRoot || getWorkspaceRoot()
    if (!root) return { success: false, error: 'No workspace folder is open.' }

    const refusal = screenCommand(command)
    if (refusal) {
      return {
        success: false,
        error: `Refused: that command performs a ${refusal}. Backstage will not run it. Use a narrower, reversible command instead.`
      }
    }

    const timeout = Math.min(Number(input.timeoutMs) || TIMEOUT_MS, 300_000)
    const started = Date.now()

    return new Promise<ToolResult>((resolve) => {
      /*
       * A shell is genuinely needed here — the model writes command lines with
       * pipes and operators. The guardrails are the screen above, the
       * workspace cwd, the timeout and the output cap, not argument escaping.
       */
      const child = spawn(command, {
        cwd: root,
        shell: true,
        windowsHide: true,
        env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' }
      })

      let stdout = ''
      let stderr = ''
      let done = false

      const finish = (exitCode: number, note?: string) => {
        if (done) return
        done = true
        clearTimeout(timer)

        const out = truncate(stdout.trim(), 12_000)
        const err = truncate(stderr.trim(), 8_000)
        const durationMs = Date.now() - started

        const parts = [`exit code: ${exitCode}`]
        if (note) parts.push(note)
        if (out.text) parts.push(`stdout:\n${out.text}`)
        if (err.text) parts.push(`stderr:\n${err.text}`)
        if (!out.text && !err.text) parts.push('(no output)')

        resolve({
          success: exitCode === 0,
          output: parts.join('\n\n'),
          error: exitCode === 0 ? undefined : `Command exited with code ${exitCode}.`,
          metadata: {
            exitCode,
            durationMs,
            truncated: out.truncated || err.truncated
          }
        })
      }

      child.stdout?.on('data', (d) => {
        if (stdout.length < MAX_BUFFER) stdout += d.toString()
      })
      child.stderr?.on('data', (d) => {
        if (stderr.length < MAX_BUFFER) stderr += d.toString()
      })

      const timer = setTimeout(() => {
        killTree(child.pid)
        finish(124, `Timed out after ${timeout}ms and was killed.`)
      }, timeout)

      child.on('error', (err) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({
          success: false,
          error: `Could not start the command: ${err.message}`
        })
      })

      child.on('close', (code) => finish(code ?? 0))
    })
  }
}

/**
 * Kill the whole process tree. `child.kill()` only signals the shell, which
 * leaves the real work (a dev server, a test runner) running.
 */
function killTree(pid?: number): void {
  if (!pid) return
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
  }
}

export const terminalTools = [terminalRun]
