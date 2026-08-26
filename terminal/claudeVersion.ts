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
 * The first `x.y` or `x.y.z` in the text, with an optional pre-release tail.
 *
 * Permissive about what surrounds it, because the CLI has printed the bare
 * number, `claude, version 1.2.3`, and a banner with the number buried in it at
 * different points in its life. Strict about the number itself: two components
 * minimum, so a bare `2` or an exit code cannot pass.
 */
const VERSION = /\b(\d+\.\d+(?:\.\d+)?(?:[-.][0-9A-Za-z.]+)?)\b/

export function parseClaudeVersion(text: string): string | null {
  if (!text) return null
  const match = VERSION.exec(text)
  return match ? match[1] : null
}
