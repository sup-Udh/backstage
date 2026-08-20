import { LineExtractor } from './lineExtractor'

/**
 * Checks for the miniature terminal.
 *
 * Escape-sequence handling fails silently — it produces plausible-looking
 * rubbish rather than an error — so each case here is one way real CLI output
 * has historically broken naive extraction.
 */

let failures = 0

function check(name: string, actual: string[], expected: string[]): void {
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

/** Feed a whole string as one chunk. */
function once(data: string): string[] {
  return new LineExtractor().push(data)
}

console.log('LineExtractor')

check('plain lines', once('hello\nworld\n'), ['hello', 'world'])

check(
  'strips colour codes',
  once('\x1b[32mI inspected the auth flow\x1b[0m\n'),
  ['I inspected the auth flow']
)

check(
  'unfinished line is not emitted',
  once('partial without newline'),
  []
)

/*
 * Progress indicators overwrite in place and pad to cover what was there.
 * Only the final state should ever become a line.
 */
check(
  'carriage return rewrites in place',
  once('Loading 10%\rLoading 90%\rDone       \n'),
  ['Done']
)

/*
 * An under-padded overwrite genuinely does leave the tail of the old text
 * behind — that is what a real terminal shows, and inventing a cleaner result
 * would mean the transcript disagreeing with the terminal panel beside it.
 */
check(
  'short overwrite leaves the tail, as a real terminal does',
  once('Loading 90%\rDone\n'),
  ['Doneing 90%']
)

check(
  'erase-to-end truncates at the cursor',
  once('abcdefgh\r\x1b[0Kxy\n'),
  ['xy']
)

/* How a CLI actually clears a line: return to column 0, then erase. */
check(
  'erase-whole-line after a return drops the frame',
  once('stale frame\r\x1b[2Kfresh\n'),
  ['fresh']
)

check(
  'absolute cursor move discards the repaint',
  once('old frame\x1b[H\x1b[2Jnew frame\n'),
  ['new frame']
)

check(
  'OSC title sequence carries no text',
  once('\x1b]0;claude — my-project\x07real output\n'),
  ['real output']
)

check('box drawing alone is dropped', once('╭──────────╮\n'), [])
check('spinner frame alone is dropped', once('⠋⠙⠹\n'), [])
check('rule alone is dropped', once('──────\n'), [])
check('keeps text inside a box', once('│ 3 tests failed │\n'), ['│ 3 tests failed │'])

/* Redraw suppression: a TUI reprints unchanged lines every frame. */
{
  const e = new LineExtractor()
  const first = e.push('Reading package.json\n')
  const again = e.push('Reading package.json\n')
  check('repeat within the window is suppressed', [...first, ...again], [
    'Reading package.json'
  ])
}

/* Sequences straddling a chunk boundary — the case a regex pass gets wrong. */
{
  const e = new LineExtractor()
  const a = e.push('text \x1b[3')
  const b = e.push('2mgreen\n')
  check('split escape sequence', [...a, ...b], ['text green'])
}

{
  const e = new LineExtractor()
  const a = e.push('before\r\x1b')
  const b = e.push('[2Kafter\n')
  check('split at the ESC byte itself', [...a, ...b], ['after'])
}

{
  const e = new LineExtractor()
  const a = e.push('\x1b]0;title')
  const b = e.push(' continued\x07body\n')
  check('split OSC sequence', [...a, ...b], ['body'])
}

/* A lone ESC must not wedge the stream forever. */
{
  const e = new LineExtractor()
  e.push('\x1b')
  const out = e.push('x'.repeat(200) + '\n')
  check(
    'lone ESC does not stall the stream',
    out.length === 1 && out[0].endsWith('x') ? ['recovered'] : out,
    ['recovered']
  )
}

/* Realistic Claude-style frame: box, colour, spinner, repaint. */
{
  const e = new LineExtractor()
  const frames = [
    '\x1b[2J\x1b[H',
    '╭─────────────────────────╮\n',
    '\x1b[1m● Reading src/auth.ts\x1b[0m\n',
    '⠋\r⠙\r⠹\r',
    'Found the token check on line 42.\n',
    '╰─────────────────────────╯\n'
  ]
  const out = frames.flatMap((f) => e.push(f))
  check('realistic TUI frame', out, [
    '● Reading src/auth.ts',
    'Found the token check on line 42.'
  ])
}

/* Tabs advance to the next stop rather than appearing as a control char. */
check('tab expands', once('a\tb\n'), ['a       b'])

/*
 * Backspace moves the cursor; it does not erase. The destructive form shells
 * actually emit is backspace-space-backspace.
 */
check('bare backspace only moves the cursor', once('ab\bc\n'), ['ac'])
check('destructive backspace erases the last character', once('hellox\b \b\n'), [
  'hello'
])

console.log()
if (failures === 0) {
  console.log('All extractor checks passed.')
} else {
  console.log(`${failures} check(s) failed.`)
  process.exitCode = 1
}
