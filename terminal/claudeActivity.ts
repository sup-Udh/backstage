import type { ActivityType } from '../src/shared/activity'
import { shortCommand, shortPath } from '../src/shared/activity'
import { activityForCommand } from '../agents/activityMap'

/**
 * What a Claude Code session is actually doing, read from what it prints.
 *
 * Be clear about what this is and is not. Claude Code runs in a PTY and
 * exposes no structured event stream to the process hosting it — there is no
 * socket, no JSON, no hook that says "a file read has begun". The only thing
 * that crosses the boundary is bytes destined for a terminal.
 *
 * So this reads the *tool banners* Claude Code renders when it performs an
 * operation: the `Read(package.json)` line it prints as it runs the tool, not
 * the sentence "I'll take a look at package.json" it printed a moment earlier.
 * That distinction is the whole design, and it is what the brief asks for:
 * an announcement of intent changes nothing, and a banner is a record of
 * something that has started.
 *
 * Three rules hold it honest:
 *
 *   1. A strict allowlist of verbs. Anything not on it produces no activity
 *      change at all, and the session falls back to the generic state derived
 *      from whether the process is producing output. Guessing is worse than
 *      being vague.
 *
 *   2. The verb must be at the start of the line, optionally behind Claude's
 *      own bullet, and immediately followed by its argument in parentheses.
 *      Prose does not have that shape.
 *
 *   3. Nothing from Claude's reasoning is ever surfaced. The processing
 *      indicator is recognised by its "esc to interrupt" suffix and reported
 *      as THINKING with no detail — the flavour word beside it is a random
 *      gerund, and printing it would be dressing up noise as information.
 *
 * Pure and testable, like `lineExtractor` beside it and for the same reason:
 * pattern matching over terminal output fails silently and produces plausible
 * rubbish rather than an error.
 */

export interface SessionActivity {
  type: ActivityType
  label?: string
  detail: string | null
  detailFull: string | null
  filePath?: string | null
  command?: string | null
}

/**
 * The tool verbs Claude Code prints, and what each one is.
 *
 * Names as Claude Code renders them. Several map to the same activity —
 * `Edit`, `Update` and `MultiEdit` are all writing a file — which is the
 * normalisation working: the user does not need three words for one action.
 */
const VERBS: Record<string, ActivityType> = {
  Read: 'reading_file',
  NotebookRead: 'reading_file',
  Write: 'creating_file',
  Create: 'creating_file',
  Edit: 'writing_file',
  Update: 'writing_file',
  MultiEdit: 'writing_file',
  NotebookEdit: 'writing_file',
  Bash: 'running_command',
  Grep: 'searching_code',
  Search: 'searching_code',
  Glob: 'searching_files',
  LS: 'searching_files',
  WebFetch: 'web_search',
  WebSearch: 'web_search',
  Task: 'analyzing',
  TodoWrite: 'planning'
}

/** Labels where the vocabulary's default would be less accurate. */
const LABELS: Record<string, string> = {
  Task: 'RUNNING SUBTASK',
  TodoWrite: 'PLANNING',
  LS: 'LISTING'
}

/**
 * A rendered tool banner.
 *
 * The leading class covers the bullets Claude Code has used across versions
 * plus plain whitespace, so a change of glyph degrades to "no activity" rather
 * than to a wrong one. The verb is anchored and must be followed directly by
 * `(`, which is what keeps it off ordinary prose.
 */
const BANNER = /^[\s⏺●•·∙*+-]*([A-Za-z]+)\(([^)]*)\)/

/**
 * The processing indicator.
 *
 * Claude Code prints a spinner line carrying a token count and the words
 * "esc to interrupt" while a turn is in flight. The suffix is the signal; the
 * gerund in front of it is decorative and is deliberately discarded.
 */
const THINKING = /esc to interrupt/i

/**
 * The permission prompt.
 *
 * Claude Code asks before an action its own settings do not cover. Recognised
 * so the character can say WAITING FOR APPROVAL rather than sitting in
 * WORKING with nothing happening — which is indistinguishable from a hang.
 */
const PERMISSION =
  /^\s*(?:\W\s*)?Do you want to (?:proceed|make this edit|create|run|continue)\b/i

/** Claude has returned to its prompt and is waiting to be told something. */
const PROMPT = /^\s*(?:>|❯)\s*(?:Try ".*"|$)/

/**
 * The first argument of a banner, cleaned up.
 *
 * Claude renders arguments in several shapes — a bare path, `pattern: "auth"`,
 * a quoted command — so the label prefix and the quotes come off and the rest
 * is left exactly as printed. Nothing is reformatted beyond that: a command
 * the user reads on a badge has to be the command that ran.
 */
function argument(raw: string): string | null {
  const trimmed = raw
    .trim()
    .replace(/^(?:file_path|path|pattern|query|command|url|prompt|description)\s*:\s*/i, '')
    .replace(/^["'`]|["'`]$/g, '')
    .trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Read one reconstructed output line.
 *
 * Returns null far more often than not, and that is correct: most of what a
 * TUI prints is not a statement about what it is doing. A null leaves the
 * session on whatever activity it already had.
 */
export function activityFromLine(line: string): SessionActivity | null {
  const text = String(line ?? '')
  if (!text.trim()) return null

  if (PERMISSION.test(text)) {
    return {
      type: 'waiting_for_permission',
      detail: null,
      detailFull: null
    }
  }

  if (THINKING.test(text)) {
    // Deliberately detail-free. See rule 3 above.
    return { type: 'thinking', detail: null, detailFull: null }
  }

  const banner = BANNER.exec(text)
  if (banner) {
    const verb = banner[1]
    const type = VERBS[verb]
    if (!type) return null

    const arg = argument(banner[2])

    if (verb === 'Bash') {
      /*
       * A command is classified by the same function an API agent's
       * `terminal_run` goes through, so `npm test` is TESTING whether Claude
       * ran it or Gemini did. That shared mapping is the point of the whole
       * normalisation.
       */
      const kind = arg ? activityForCommand(arg) : 'running_command'
      return {
        type: kind,
        detail: arg ? shortCommand(arg) : null,
        detailFull: arg,
        command: arg
      }
    }

    const isPath =
      type === 'reading_file' ||
      type === 'writing_file' ||
      type === 'creating_file' ||
      type === 'deleting_file' ||
      type === 'searching_files'

    return {
      type,
      label: LABELS[verb],
      detail: arg ? (isPath ? shortPath(arg) : shortCommand(arg, 24)) : null,
      detailFull: arg,
      filePath: isPath ? arg : null
    }
  }

  if (PROMPT.test(text)) {
    return { type: 'waiting_for_user', detail: null, detailFull: null }
  }

  return null
}

/**
 * Whether a line resolves a permission prompt.
 *
 * A session left in WAITING FOR APPROVAL after the user has answered is the
 * failure the Claude brief calls out by name. Any banner or processing
 * indicator that follows the prompt is evidence it was answered, so the
 * general classifier already moves it on — this exists for the one case that
 * produces neither: an explicit refusal.
 */
export function clearsPermission(line: string): boolean {
  return /^\s*(?:\W\s*)?(?:No,|Rejected|Declined|User (?:rejected|denied))/i.test(
    String(line ?? '')
  )
}
