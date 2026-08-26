import { execFile } from 'node:child_process'
import type { ClaudeDetection } from '../src/shared/providerApi'
import { parseClaudeVersion } from './claudeVersion'

/**
 * Is Claude Code actually on this machine?
 *
 * Backstage's "Start Claude" button types `claude` into a real PTY. That works
 * beautifully when Claude Code is installed and is nearly useless when it is
 * not: the shell prints `'claude' is not recognized…`, the session sits there
 * looking like it started, and the user is left to work out from a line of
 * shell output whether Backstage is broken, their terminal is broken, or they
 * simply never installed the thing. Requirement 20's whole point is that those
 * three are different and the user should be told which one happened.
 *
 * So availability is established *before* a session is started, here, in the
 * main process. The renderer never runs a command — it asks a question and
 * gets one of a small set of answers back.
 *
 * ---------------------------------------------------------------------------
 * On running commands at all
 * ---------------------------------------------------------------------------
 *
 * Nothing here interpolates anything. Both commands are literal constants with
 * literal arguments; there is no code path by which a project name, a file
 * path, a prompt or any other user-controlled string reaches a shell. That is
 * the property that matters, and it is why `shell: true` below is acceptable
 * rather than reckless: on Windows `claude` is very often a `.cmd` shim, and
 * `execFile` without a shell cannot execute one — it would report every
 * Windows install of Claude Code as missing.
 */

/** Long enough for a cold Node start-up, short enough not to hang a click. */
const TIMEOUT_MS = 8000

/** Cached, because the answer changes about as often as an install does. */
let cached: ClaudeDetection | null = null

function run(
  command: string,
  args: string[]
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout: TIMEOUT_MS,
        windowsHide: true,
        // Output is a version string or a path; anything larger is a
        // misbehaving shim and not worth buffering.
        maxBuffer: 1024 * 512,
        shell: true
      },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0
        resolve({
          ok: !err,
          stdout: String(stdout ?? '').trim(),
          stderr: String(stderr ?? '').trim(),
          code
        })
      }
    )
  })
}

/**
 * Look for Claude Code, and say precisely what was found.
 *
 * Two steps, because they answer two different questions:
 *
 *   1. does the name resolve on PATH?   `where` / `command -v`
 *      No  → NOT_INSTALLED. There is nothing to run.
 *   2. does running it work?            `claude --version`
 *      No  → FAILED_TO_START. Something is there — a broken shim, a wrong
 *            Node version, a permissions problem — and telling the user it is
 *            "not installed" would send them to reinstall a thing that is
 *            already installed.
 *
 * Collapsing these two into one check is the mistake this module exists to
 * avoid.
 */
export async function detectClaude(refresh = false): Promise<ClaudeDetection> {
  if (cached && !refresh) return cached

  const lookup =
    process.platform === 'win32'
      ? await run('where', ['claude'])
      : await run('command', ['-v', 'claude'])

  if (!lookup.ok || !lookup.stdout) {
    cached = {
      state: 'not_installed',
      path: null,
      version: null,
      checkedAt: Date.now(),
      detail: null
    }
    return cached
  }

  // `where` can return several matches, one per line. The first is the one the
  // shell would actually run, which is the one that matters.
  const path = lookup.stdout.split(/\r?\n/)[0]?.trim() || null

  const version = await run('claude', ['--version'])

  if (!version.ok) {
    cached = {
      state: 'failed_to_start',
      path,
      version: null,
      checkedAt: Date.now(),
      /*
       * The real stderr, trimmed. This is a developer-facing diagnostic shown
       * in settings, not an auth error — there is no secret in the output of a
       * version check, and withholding it here would leave the user with
       * "something went wrong" and no next step.
       */
      detail: (version.stderr || version.stdout || 'No output.').slice(0, 400)
    }
    return cached
  }

  cached = {
    state: 'available',
    path,
    version: parseClaudeVersion(version.stdout || version.stderr),
    checkedAt: Date.now(),
    detail: null
  }
  return cached
}

/** Drop the cache, so the next check really looks again. */
export function forgetClaudeDetection(): void {
  cached = null
}
