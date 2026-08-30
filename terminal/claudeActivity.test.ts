import { activityFromLine, clearsPermission } from './claudeActivity'

/**
 * Checks for the Claude Code activity reader.
 *
 * The whole risk in this module is one thing, and it is what most of these
 * checks are about: reading an *intention* as an *action*. Claude announces
 * what it is going to do in prose, then does it and prints a banner. Treating
 * the sentence as the event would put a character into WRITING for a file it
 * has not touched — the interface lying, confidently, about the user's own
 * repository.
 *
 * So the negative checks matter more than the positive ones here. Prose that
 * mentions reading, editing or running must produce nothing at all.
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

function typeOf(line: string): string | null {
  return activityFromLine(line)?.type ?? null
}

/* ----------------------------------------------------------- tool banners -- */

console.log('tool banners')
{
  check('a read', typeOf('⏺ Read(package.json)'), 'reading_file')
  check('with the filename', activityFromLine('⏺ Read(src/App.tsx)')?.detail, 'App.tsx')
  check(
    'and the whole path kept',
    activityFromLine('⏺ Read(src/App.tsx)')?.detailFull,
    'src/App.tsx'
  )
  check('an edit writes', typeOf('⏺ Edit(src/App.tsx)'), 'writing_file')
  check('an update writes', typeOf('⏺ Update(src/styles.css)'), 'writing_file')
  check('a multi-edit writes', typeOf('⏺ MultiEdit(src/App.tsx)'), 'writing_file')
  check('a write creates', typeOf('⏺ Write(src/components/Hero.tsx)'), 'creating_file')
  check('a grep searches code', typeOf('⏺ Grep(pattern: "auth")'), 'searching_code')
  check(
    'and carries the pattern without its label',
    activityFromLine('⏺ Grep(pattern: "auth")')?.detail,
    'auth'
  )
  check('a glob searches files', typeOf('⏺ Glob(**/*.ts)'), 'searching_files')
  check('a web fetch is the web', typeOf('⏺ WebFetch(https://example.com)'), 'web_search')
  check('a todo write is planning', typeOf('⏺ TodoWrite(3 items)'), 'planning')

  /* Different bullets across versions, and none at all, all still read. */
  check('a bullet variant still reads', typeOf('● Read(a.ts)'), 'reading_file')
  check('no bullet still reads', typeOf('Read(a.ts)'), 'reading_file')
  check('indented still reads', typeOf('   ⏺ Read(a.ts)'), 'reading_file')
}

console.log('\ncommands, classified like everybody else’s')
{
  /*
   * The point of the normalisation: a Claude `Bash(npm test)` and an API
   * agent's `terminal_run` with the same command produce the same activity,
   * through the same function.
   */
  check('a bash test run is TESTING', typeOf('⏺ Bash(npm test)'), 'testing')
  check('a build is BUILDING', typeOf('⏺ Bash(npm run build)'), 'building')
  check('an install is INSTALLING', typeOf('⏺ Bash(npm install)'), 'installing_dependency')
  check('git is GIT', typeOf('⏺ Bash(git status)'), 'git_operation')
  check('anything else is a command', typeOf('⏺ Bash(./deploy.sh)'), 'running_command')
  check(
    'and carries the real command',
    activityFromLine('⏺ Bash(npm run build)')?.command,
    'npm run build'
  )
  check(
    'a labelled argument is unwrapped',
    activityFromLine('⏺ Bash(command: "npm test")')?.command,
    'npm test'
  )
  check('a bash with no command still runs', typeOf('⏺ Bash()'), 'running_command')
  check('and invents nothing', activityFromLine('⏺ Bash()')?.detail, null)
}

/* --------------------------------------------------------------- waiting -- */

console.log('\nwaiting')
{
  check(
    'an approval prompt waits for approval',
    typeOf('Do you want to proceed?'),
    'waiting_for_permission'
  )
  check(
    'and the edit variant',
    typeOf('❯ Do you want to make this edit to App.tsx?'),
    'waiting_for_permission'
  )
  check('an approval prompt carries no detail', activityFromLine('Do you want to proceed?')?.detail, null)

  check(
    'the processing indicator is thinking',
    typeOf('✻ Pondering… (12s · ↑ 1.2k tokens · esc to interrupt)'),
    'thinking'
  )
  /*
   * The flavour word beside the spinner is random and means nothing. Showing
   * it would be dressing noise up as information, and it sits uncomfortably
   * close to reporting what the model is doing internally.
   */
  check(
    'and shows nothing of what it is thinking',
    activityFromLine('✻ Pondering… (12s · esc to interrupt)')?.detail,
    null
  )

  check('an empty prompt waits for the user', typeOf('> '), 'waiting_for_user')

  check('a refusal clears an approval', clearsPermission('No, and tell Claude what to do'), true)
  check('ordinary output does not', clearsPermission('Reading the config now'), false)
}

/* ------------------------------------------------------------- not events -- */

console.log('\nprose is never an event')
{
  /*
   * Every one of these mentions an operation. None of them is one. This is the
   * rule the Claude brief states at §4 and the reason this module reads
   * banners rather than sentences.
   */
  check("an announced read", typeOf("I'll read package.json to see what's there."), null)
  check('an announced edit', typeOf('Let me edit src/App.tsx and add the handler.'), null)
  check('an announced command', typeOf('Next I will run npm test.'), null)
  check('a plan', typeOf('First I need to search the codebase for the auth logic.'), null)
  check('a summary', typeOf('I read package.json and updated App.tsx.'), null)
  check('a question', typeOf('Should I run the tests now?'), null)

  check('an empty line', typeOf(''), null)
  check('whitespace', typeOf('    '), null)
  check('box drawing', typeOf('╭──────────────────────╮'), null)
  check('an unknown verb', typeOf('⏺ Frobnicate(a.ts)'), null)

  /*
   * A verb from the allowlist inside a sentence is still a sentence. The
   * anchor at the start of the line is what makes that true.
   */
  check(
    'a banner verb mid-sentence is prose',
    typeOf('I will now Read(package.json) as discussed.'),
    null
  )
}

console.log()
if (failures === 0) {
  console.log('All Claude activity checks passed.')
} else {
  console.log(`${failures} check(s) failed.`)
  process.exitCode = 1
}
