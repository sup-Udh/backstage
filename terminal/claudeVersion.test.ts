import { parseClaudeVersion } from './claudeVersion'

/**
 * Checks for the Claude Code version parser.
 *
 * This exists because of one requirement and one failure mode. The requirement
 * is that Backstage must never show a version it did not actually detect. The
 * failure mode is that a loose parser handed an *error message* will find a
 * number in it — a line number, an exit code, a Node version, a port — and
 * present that as Claude Code's version, in a settings panel, next to the
 * word "Version". Somebody then pastes it into a bug report and everybody
 * wastes an afternoon.
 *
 * So the negative cases below matter more than the positive ones.
 */

let failures = 0

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}`)
    console.log(`        expected ${b}`)
    console.log(`        actual   ${a}`)
  }
}

/* ------------------------------------------------------- what it accepts -- */

console.log('\nparseClaudeVersion — real output')

check('the bare number the CLI prints today', parseClaudeVersion('2.1.246'), '2.1.246')
check(
  'the number with the trailing text it also prints',
  parseClaudeVersion('2.1.246 (Claude Code)'),
  '2.1.246'
)
check(
  'the older "claude, version x" form',
  parseClaudeVersion('claude, version 1.0.72'),
  '1.0.72'
)
check('a two-component version', parseClaudeVersion('1.4'), '1.4')
check(
  'a pre-release tail is kept, because it is part of the version',
  parseClaudeVersion('2.2.0-beta.3'),
  '2.2.0-beta.3'
)
check(
  'a number buried in a banner is still the version',
  parseClaudeVersion('Claude Code\n  v0.9.14\n  ready'),
  '0.9.14'
)
check('surrounding whitespace is irrelevant', parseClaudeVersion('  3.0.1  '), '3.0.1')

/* ------------------------------------------------------- what it refuses -- */

console.log('\nparseClaudeVersion — nothing to report')

check('empty output yields nothing rather than a guess', parseClaudeVersion(''), null)
check('prose with no version in it', parseClaudeVersion('command not found'), null)

/*
 * The one that matters most. A bare integer is an exit code, a line number or
 * a count — never a version — and a parser that accepted it would put "1" in
 * the settings panel the first time the CLI failed.
 */
check('a lone integer is not a version', parseClaudeVersion('1'), null)
check(
  'an exit status is not a version',
  parseClaudeVersion('Process exited with code 127'),
  null
)
check(
  'a file-and-line reference is not a version',
  parseClaudeVersion('Error at index.js line 42'),
  null
)

/*
 * Ordering. When something unhelpful precedes the real number, the parser
 * takes the first *version-shaped* thing — which is why the shape has to be
 * two components rather than one.
 */
check(
  'a leading exit code does not shadow the real version',
  parseClaudeVersion('exit 3\nclaude 2.1.246'),
  '2.1.246'
)

/* ------------------------------------------------------------------ -- */

if (failures > 0) {
  console.log(`\n${failures} Claude version check(s) failed.`)
  process.exit(1)
}
console.log('\nAll Claude version checks passed.')
