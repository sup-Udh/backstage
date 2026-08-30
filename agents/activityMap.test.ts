import { activityForCommand, activityForTool } from './activityMap'
import {
  ACTIVITY_GLYPH,
  ACTIVITY_LABEL,
  ACTIVITY_SHORT,
  activityFamily,
  badgeText,
  shortCommand,
  shortPath,
  statusForActivity
} from '../src/shared/activity'
import type { ActivityType } from '../src/shared/activity'

/**
 * Checks for the tool-to-activity mapping.
 *
 * Two properties matter more than the rest, and they are the two the brief is
 * most insistent about:
 *
 *   nothing is invented — a tool call with no path produces an activity with
 *   no path, never a plausible filename;
 *
 *   the mapping is provider-independent — it is a function of the registry
 *   tool name and its arguments, and there is nowhere in it for a provider to
 *   be consulted, which is why an OpenAI read and a Gemini read cannot render
 *   differently.
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

/* ------------------------------------------------------------ vocabulary -- */

console.log('the vocabulary')
{
  const types = Object.keys(ACTIVITY_LABEL) as ActivityType[]
  check('every activity has a short form', Object.keys(ACTIVITY_SHORT).length, types.length)
  check('every activity has a glyph', Object.keys(ACTIVITY_GLYPH).length, types.length)

  const longer = types.filter((t) => ACTIVITY_SHORT[t].length > ACTIVITY_LABEL[t].length)
  check('no short form is longer than its label', longer, [])

  const multiGlyph = types.filter((t) => [...ACTIVITY_GLYPH[t]].length !== 1)
  check('every glyph is a single character', multiGlyph, [])

  /*
   * The status is derived from the activity and never the other way round.
   * These four are the ones a user acts on, so being wrong about them is
   * being wrong about whether somebody needs to do something.
   */
  check('reading is working', statusForActivity('reading_file'), 'working')
  check('thinking is thinking', statusForActivity('thinking'), 'thinking')
  check('awaiting approval is waiting', statusForActivity('waiting_for_permission'), 'waiting')
  check('delegating is talking', statusForActivity('delegating'), 'talking')
  check('an error is an error', statusForActivity('error'), 'error')
  check('completing rests', statusForActivity('completed'), 'idle')
}

/* --------------------------------------------------------------- shorten -- */

console.log('\nshortening')
{
  check('a nested path keeps its filename', shortPath('src/components/App.tsx'), 'App.tsx')
  check('a windows path too', shortPath('src\\components\\App.tsx'), 'App.tsx')
  check('a bare filename is unchanged', shortPath('package.json'), 'package.json')
  check('a directory keeps its slash', shortPath('src/components/'), 'components/')
  check('the root is named', shortPath('.'), 'project root')
  check('an empty path is empty', shortPath(''), '')

  check('a short command is untouched', shortCommand('npm test'), 'npm test')
  check(
    'a long command is cut, not summarised',
    shortCommand('npm run build --workspace @acme/web --verbose', 20),
    'npm run build --wor…'
  )
}

console.log('\nbadge text')
{
  const reading = {
    type: 'reading_file' as const,
    label: 'READING',
    detail: 'package.json'
  }
  check('a roomy badge shows everything', badgeText(reading, 30), 'READING package.json')
  /*
   * §25. A crowded office drops to the short label rather than truncating
   * mid-word, and only cuts the detail when even that will not fit.
   */
  const command = {
    type: 'running_command' as const,
    label: 'RUNNING COMMAND',
    detail: 'npm run build'
  }
  check('a tight badge shortens the label', badgeText(command, 22), 'TERMINAL npm run build')
  check('a very tight badge cuts the detail', badgeText(command, 14), 'TERMINAL npm…')
  check(
    'and the tightest keeps the label alone',
    badgeText(command, 9),
    'TERMINAL'
  )
  check(
    'a badge with no detail is just the label',
    badgeText({ type: 'thinking', label: 'THINKING', detail: null }, 30),
    'THINKING'
  )
}

/* -------------------------------------------------------------- commands -- */

console.log('\ncommands')
{
  check('npm test is testing', activityForCommand('npm test'), 'testing')
  check('vitest is testing', activityForCommand('vitest run'), 'testing')
  check('pytest is testing', activityForCommand('python -m pytest'), 'testing')
  check('npm run build is building', activityForCommand('npm run build'), 'building')
  check('tsc is building', activityForCommand('tsc --noEmit'), 'building')
  check('npm install installs', activityForCommand('npm install'), 'installing_dependency')
  check('pip install installs', activityForCommand('pip install requests'), 'installing_dependency')
  check('git is git', activityForCommand('git status'), 'git_operation')
  check('rm deletes', activityForCommand('rm -rf dist'), 'deleting_file')
  check('grep searches', activityForCommand('grep -r auth src'), 'searching_code')
  check('curl is the web', activityForCommand('curl https://example.com'), 'web_search')
  check('anything else is a command', activityForCommand('./deploy.sh'), 'running_command')

  check(
    'sudo does not hide the verb',
    activityForCommand('sudo npm install'),
    'installing_dependency'
  )
  check(
    'an env assignment does not either',
    activityForCommand('CI=1 npm test'),
    'testing'
  )
  /*
   * A compound line is named after the first thing it does, which is what a
   * person watching would say. Permission classification asks a different
   * question and answers it differently — see permissionRules.test.ts.
   */
  check(
    'a compound line is named for its first command',
    activityForCommand('npm test && npm run build'),
    'testing'
  )
  check('an empty command still names itself', activityForCommand(''), 'running_command')
}

/* ----------------------------------------------------------------- tools -- */

console.log('\ntools')
{
  const read = activityForTool('filesystem_read', { path: 'src/components/App.tsx' })
  check('reading a file', read.type, 'reading_file')
  check('shows the filename', read.detail, 'App.tsx')
  check('and keeps the whole path', read.detailFull, 'src/components/App.tsx')

  check(
    'editing writes',
    activityForTool('filesystem_edit', { path: 'a.ts' }).type,
    'writing_file'
  )
  check(
    'creating creates',
    activityForTool('filesystem_create', { path: 'a.ts' }).type,
    'creating_file'
  )
  check(
    'listing is a file search',
    activityForTool('filesystem_list', { path: 'src/' }).type,
    'searching_files'
  )
  check(
    'and says so',
    activityForTool('filesystem_list', { path: 'src/' }).label,
    'LISTING'
  )
  check(
    'searching carries the query',
    activityForTool('filesystem_search', { query: 'authenticate' }).detail,
    'authenticate'
  )
  check(
    'an overview inspects the project',
    activityForTool('workspace_overview', {}).type,
    'inspecting_project'
  )

  /*
   * The distinction the whole file exists for: one tool, three activities,
   * decided by the argument.
   */
  check(
    'terminal_run running tests is TESTING',
    activityForTool('terminal_run', { command: 'npm test' }).type,
    'testing'
  )
  check(
    'terminal_run installing is INSTALLING',
    activityForTool('terminal_run', { command: 'npm install' }).type,
    'installing_dependency'
  )
  check(
    'terminal_run doing something else is a command',
    activityForTool('terminal_run', { command: './deploy.sh' }).type,
    'running_command'
  )

  check('git_status is git', activityForTool('git_status', {}).type, 'git_operation')
  check(
    'git_commit says so',
    activityForTool('git_commit', { message: 'fix auth' }).label,
    'COMMITTING'
  )
  check(
    'web_fetch shows the host',
    activityForTool('web_fetch', { url: 'https://example.com/a/b' }).detail,
    'example.com'
  )
  check(
    'delegating carries the target id',
    activityForTool('delegate_task', { agentId: 'agent-2' }).targetAgentId,
    'agent-2'
  )
}

console.log('\nnothing is invented')
{
  /*
   * §36, and the most important group of checks here. A tool call whose
   * arguments do not contain the detail must produce an activity without one —
   * "WRITING FILE" is a complete answer and a made-up filename is not.
   */
  const write = activityForTool('filesystem_edit', {})
  check('a write with no path has no detail', write.detail, null)
  check('and no full detail either', write.detailFull, null)
  check('but is still a write', write.type, 'writing_file')

  const run = activityForTool('terminal_run', {})
  check('a run with no command has no detail', run.detail, null)
  check('and is still a command', run.type, 'running_command')

  const search = activityForTool('filesystem_search', {})
  check('a search with no query has no detail', search.detail, null)

  /*
   * An unmapped tool reports that work is happening and names the tool, so
   * the omission is visible rather than silent. Losing the fact that an agent
   * is busy is the one outcome worse than filing it imprecisely.
   */
  const unknown = activityForTool('some_future_tool', {})
  check('an unknown tool still reports work', unknown.type, 'running_command')
  check('and names itself', unknown.detail, 'some_future_tool')
}

console.log('\nfamilies')
{
  check('reading is a file activity', activityFamily('reading_file'), 'files')
  check('testing is a terminal activity', activityFamily('testing'), 'terminal')
  check('git is git', activityFamily('git_operation'), 'git')
  check('delegating is team activity', activityFamily('delegating'), 'team')
  check('thinking has no family', activityFamily('thinking'), 'other')
}

console.log()
if (failures === 0) {
  console.log('All activity mapping checks passed.')
} else {
  console.log(`${failures} check(s) failed.`)
  process.exitCode = 1
}
