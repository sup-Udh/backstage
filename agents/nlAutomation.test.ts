import { parseAutomation, parseClock, type NlAgent } from './nlAutomation'
import { WEEKDAYS } from '../src/shared/schedule'

/**
 * Checks for the sentence parser.
 *
 * It is allowed to be wrong — the user confirms every draft before it is saved
 * — but it is not allowed to be wrong in a way that hides. The two properties
 * worth guarding are that it never invents an agent that is not in the roster
 * it was given, and that it always reports what it could not work out rather
 * than filling the gap with a guess.
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

const ROSTER: NlAgent[] = [
  { id: 'a1', name: 'Walter', role: 'Team lead' },
  { id: 'a2', name: 'Jesse', role: 'Lab technician' },
  { id: 'a3', name: 'Mike', role: 'Security' }
]

/* ----------------------------------------------------------------- time -- */

console.log('clock')
{
  check('6pm', parseClock('at 6pm'), 18 * 60)
  check('6 pm with a space', parseClock('at 6 pm'), 18 * 60)
  check('9.30am', parseClock('at 9.30am'), 9 * 60 + 30)
  check('12am is midnight', parseClock('at 12am'), 0)
  check('12pm is noon', parseClock('at 12pm'), 12 * 60)
  check('24 hour', parseClock('at 18:30'), 18 * 60 + 30)
  check('no time', parseClock('sometime later'), null)
}

console.log('\nschedules')
{
  const morning = parseAutomation('Every morning ask Walter to review my git changes', ROSTER)
  check('a daily schedule', morning.event, 'schedule.daily')
  check('morning is 09:00', morning.schedule?.minuteOfDay, 9 * 60)
  check('it found Walter', morning.agentIds, ['a1'])
  check('and read it as a review', morning.action, 'request.review')
  check('nothing is missing', morning.missing, [])

  const evening = parseAutomation('Every evening ask Mike to check the logs', ROSTER)
  check('evening is 18:00', evening.schedule?.minuteOfDay, 18 * 60)

  const explicit = parseAutomation('Every day at 6pm ask Jesse to run the tests', ROSTER)
  check('an explicit time wins', explicit.schedule?.minuteOfDay, 18 * 60)

  const weekday = parseAutomation('Every weekday at 9am ask Walter to summarise', ROSTER)
  check('weekdays only', weekday.schedule?.days, WEEKDAYS)

  const weekly = parseAutomation('Every Monday ask Walter to plan the week', ROSTER)
  check('a weekly schedule', weekly.event, 'schedule.weekly')
  check('on Monday', weekly.schedule?.days, [1])

  const hourly = parseAutomation('Every 2 hours ask Mike to check the build', ROSTER)
  check('an interval schedule', hourly.event, 'schedule.interval')
  check('two hours', hourly.schedule?.everyMinutes, 120)
}

/* ---------------------------------------------------------------- events -- */

console.log('\nevents')
{
  const file = parseAutomation(
    'When package.json changes ask Walter to review the dependencies',
    ROSTER
  )
  check('a file trigger', file.event, 'file.changed')
  check('with the filename as the condition', file.condition, 'package.json')

  const commit = parseAutomation('After a commit ask Mike to review it', ROSTER)
  check('a git trigger', commit.event, 'git.changed')

  const failure = parseAutomation('When an agent fails ask Walter to investigate', ROSTER)
  check('a failure trigger', failure.event, 'agent.error')

  const done = parseAutomation('When Jesse finishes ask Mike to review the work', ROSTER)
  check('a completion trigger', done.event, 'agent.task.completed')
}

/* ---------------------------------------------------------------- agents -- */

console.log('\nagents')
{
  const two = parseAutomation('Every morning ask Walter and Jesse to review the code', ROSTER)
  check('two named agents', two.agentIds, ['a1', 'a2'])

  const team = parseAutomation('Every morning ask the team for a status update', ROSTER)
  check('"the team" means everyone', team.agentIds, ['a1', 'a2', 'a3'])

  /*
   * The property that matters most. The parser only ever sees the open
   * project's roster, so a name from somewhere else cannot resolve to anybody
   * — it becomes a missing field the user has to fill in.
   */
  const stranger = parseAutomation('Every morning ask Gustavo to review the code', ROSTER)
  check('an unknown name selects nobody', stranger.agentIds, [])
  check('and is reported as missing', stranger.missing, ['which agent should do it'])

  /* A substring of a name is not a name. */
  const partial = parseAutomation('Every morning check the walterfall metrics', ROSTER)
  check('a substring does not match an agent', partial.agentIds, [])
}

/* --------------------------------------------------------------- actions -- */

console.log('\nactions')
{
  check(
    'review',
    parseAutomation('Every day ask Walter to review the diff', ROSTER).action,
    'request.review'
  )
  check(
    'notify me',
    parseAutomation('Every day at 5pm just tell me the build is done', ROSTER).action,
    'notify.user'
  )
  check(
    'anything else is a task',
    parseAutomation('Every day ask Jesse to run the tests', ROSTER).action,
    'create.task'
  )
  /* Notify needs no agent, so it must not be reported as missing one. */
  check(
    'notify does not require an agent',
    parseAutomation('Every day at 5pm just tell me the build is done', ROSTER).missing,
    []
  )
}

/* -------------------------------------------------------------- messages -- */

console.log('\nthe instruction')
{
  const draft = parseAutomation(
    'Every morning ask Walter to review the latest git changes',
    ROSTER
  )
  check(
    'the scaffolding comes off',
    draft.message,
    'Review the latest git changes'
  )
  check('and becomes the name', draft.name, 'Review the latest git changes')
}

console.log('\nnonsense')
{
  const nonsense = parseAutomation('asdf', ROSTER)
  check('falls back to a manual automation', nonsense.event, 'manual')
  check('keeps the text as the instruction', nonsense.message, 'Asdf')
  check(
    'and says what it could not work out',
    nonsense.missing,
    ['when it should run', 'which agent should do it']
  )

  const empty = parseAutomation('', ROSTER)
  check('an empty sentence still returns a draft', empty.event, 'manual')
}

console.log()
if (failures === 0) {
  console.log('All natural-language checks passed.')
} else {
  console.log(`${failures} check(s) failed.`)
  process.exitCode = 1
}
