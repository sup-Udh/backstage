/**
 * Reading a version out of whatever `claude --version` printed.
 *
 * A pure function with no process behind it, so it can be tested — the same
 * arrangement `projectRules` and `relationships` use, and for the same reason:
 * this decides something the user reads and cannot verify, and getting it
 * wrong is invisible.
 *
 * The rule that matters is the negative one. Requirement 22 says not to
 * fabricate a version, and the failure mode is subtle: a loose parser handed
 * an error message will happily find a number in it — a line number, an exit
 * code, a Node version — and present that as Claude Code's version. Somebody
 * then pastes it into a bug report. So the shape is strict, and anything that
 * does not match it yields null and no version line is shown at all.
 */

/**
 * The first version-shaped token in the text.
 *
 * Read left to right, the parts are:
 *
 *   (?<![\d.])   not in the middle of a longer number. Without this, `1.2.3`
 *                could be entered at `2.3` and report a version that is a
 *                suffix of the real one.
 *   v?           the optional `v` in `v1.2.3`. This is why the pattern cannot
 *                simply start with `\b`: there is no word boundary between
 *                `v` and `0`, so `\b` skipped the `0` entirely and `v0.9.14`
 *                was read as `9.14` — a wrong version, confidently displayed.
 *                A test caught that; nothing else would have.
 *   \d+\.\d+     two components minimum. This is the whole defence against
 *                error messages: a bare `127` or `42` is an exit code or a
 *                line number and must never be mistaken for a version.
 *   (?:\.\d+)?   the optional patch component.
 *   (?:-…)?      a semver pre-release tail, hyphen-introduced so it cannot be
 *                confused with the patch component.
 *   (?![\d.])    and nothing numeric may follow, so a longer number is not
 *                silently truncated to a version.
 */
const VERSION = /(?<![\d.])v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z][0-9A-Za-z.]*)?)(?![\d.])/

export function parseClaudeVersion(text: string): string | null {
  if (!text) return null
  const match = VERSION.exec(text)
  return match ? match[1] : null
}
