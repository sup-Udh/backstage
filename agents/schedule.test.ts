import { describeSchedule, isDue, nextRunAt, normaliseSchedule, WEEKDAYS } from './schedule'
import type { TriggerSchedule } from '../src/shared/agents'

/**
 * Checks for the scheduler's clock.
 *
 * The failure mode this guards against is silent. A daily automation that
 * fires at the wrong hour, or twice, or not at all, produces no error — it
 * simply is not there in the morning, and by the time anybody notices there is
 * nothing to look at. So every case here fixes a moment in time and asks what
 * would happen, rather than waiting to find out.
 *
 * Local time throughout, deliberately: `nextRunAt` answers in the user's
 * timezone, so the expectations are built with local Date constructors rather
 * than UTC millisecond arithmetic.
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

/** A local wall-clock moment, which is the only thing the scheduler reasons in. */
function at(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime()
}

function daily(minuteOfDay: number, days: number[] = []): TriggerSchedule {
  return { minuteOfDay, days, everyMinutes: 60 }
}

/* --------------------------------------------------------- normalisation -- */

console.log('normalising')
{
  const s = normaliseSchedule({ minuteOfDay: 9999, days: [9, 1, 1, -2], everyMinutes: 1 })
  check('the time is clamped to a real one', s.minuteOfDay, 24 * 60 - 1)
  check('impossible days are dropped and duplicates removed', s.days, [1])
  check('the interval has a floor', s.everyMinutes, 5)

  const empty = normaliseSchedule(undefined)
  check('a missing schedule gets defaults', empty.minuteOfDay, 9 * 60)
  check('and no day restriction', empty.days, [])
}

/* ---------------------------------------------------------------- daily -- */

console.log('\ndaily')
{
  // Monday 4 August 2025, 08:00 local.
  const monday8am = at(2025, 8, 4, 8)

  check(
    'later today, when the time has not passed',
    nextRunAt('schedule.daily', daily(9 * 60), monday8am),
    at(2025, 8, 4, 9)
  )
  check(
    'tomorrow, when it has',
    nextRunAt('schedule.daily', daily(7 * 60), monday8am),
    at(2025, 8, 5, 7)
  )
  /*
   * Strictly after. A schedule recomputed at the exact moment it fired must
   * move to the next occurrence, or the scheduler fires it again every tick
   * for the rest of that minute.
   */
  check(
    'exactly now counts as passed',
    nextRunAt('schedule.daily', daily(8 * 60), monday8am),
    at(2025, 8, 5, 8)
  )
}

console.log('\ndaily, restricted to weekdays')
{
  // Friday 8 August 2025, 18:00 — after the run time, so it must skip the weekend.
  const friday6pm = at(2025, 8, 8, 18)
  check(
    'Friday evening rolls to Monday',
    nextRunAt('schedule.daily', daily(9 * 60, WEEKDAYS), friday6pm),
    at(2025, 8, 11, 9)
  )

  // Saturday 9 August 2025, 10:00.
  const saturday = at(2025, 8, 9, 10)
  check(
    'Saturday rolls to Monday',
    nextRunAt('schedule.daily', daily(9 * 60, WEEKDAYS), saturday),
    at(2025, 8, 11, 9)
  )
}

/* --------------------------------------------------------------- weekly -- */

console.log('\nweekly')
{
  // Monday 4 August 2025, 10:00. Wednesday is day 3.
  const monday = at(2025, 8, 4, 10)
  check(
    'the next chosen day',
    nextRunAt('schedule.weekly', daily(9 * 60, [3]), monday),
    at(2025, 8, 6, 9)
  )
  check(
    'wrapping into next week',
    nextRunAt('schedule.weekly', daily(9 * 60, [1]), monday),
    at(2025, 8, 11, 9)
  )
  check(
    'no chosen day falls back to Monday',
    nextRunAt('schedule.weekly', daily(9 * 60, []), monday),
    at(2025, 8, 11, 9)
  )
}

/* ------------------------------------------------------------- interval -- */

console.log('\ninterval')
{
  const now = at(2025, 8, 4, 10)
  const hourly: TriggerSchedule = { minuteOfDay: 0, days: [], everyMinutes: 60 }

  check(
    'measured from the last run, not from now',
    nextRunAt('schedule.interval', hourly, now, at(2025, 8, 4, 9, 30)),
    at(2025, 8, 4, 10, 30)
  )
  check(
    'with no last run, one interval from now',
    nextRunAt('schedule.interval', hourly, now, null),
    at(2025, 8, 4, 11)
  )
  /*
   * The app was closed for a week. That must produce one upcoming run rather
   * than a backlog of 168 — a scheduler that catches up is a scheduler that
   * bills you for every hour your laptop was shut.
   */
  const afterLongGap = nextRunAt('schedule.interval', hourly, now, at(2025, 7, 28, 10))
  check('a long gap collapses to one soon run', afterLongGap, now + 60_000)
}

/* ------------------------------------------------------------ not a schedule -- */

console.log('\nnon-schedule triggers')
{
  check(
    'an event trigger has no next run',
    nextRunAt('file.changed', daily(9 * 60), at(2025, 8, 4, 8)),
    null
  )
  check(
    'a manual trigger has no next run',
    nextRunAt('manual', null, at(2025, 8, 4, 8)),
    null
  )
  check('and is never due', isDue('manual', 1, Number.MAX_SAFE_INTEGER), false)
}

/* ------------------------------------------------------------------ due -- */

console.log('\ndue')
{
  const now = at(2025, 8, 4, 9)
  check('due when the moment has arrived', isDue('schedule.daily', now, now), true)
  check('due when it has passed', isDue('schedule.daily', now - 1000, now), true)
  check('not due before', isDue('schedule.daily', now + 1000, now), false)
  check('never due with no next run', isDue('schedule.daily', null, now), false)
}

/* ------------------------------------------------------------ describing -- */

console.log('\ndescribing')
{
  check('every day', describeSchedule('schedule.daily', daily(9 * 60)), 'Every day · 09:00')
  check(
    'every weekday',
    describeSchedule('schedule.daily', daily(18 * 60, WEEKDAYS)),
    'Every weekday · 18:00'
  )
  check(
    'chosen days',
    describeSchedule('schedule.daily', daily(9 * 60, [1, 3])),
    'Mon, Wed · 09:00'
  )
  check(
    'weekly',
    describeSchedule('schedule.weekly', daily(9 * 60, [3])),
    'Every Wed · 09:00'
  )
  check(
    'hourly',
    describeSchedule('schedule.interval', { minuteOfDay: 0, days: [], everyMinutes: 60 }),
    'Every hour'
  )
  check(
    'every few hours',
    describeSchedule('schedule.interval', { minuteOfDay: 0, days: [], everyMinutes: 180 }),
    'Every 3 hours'
  )
  check(
    'minutes',
    describeSchedule('schedule.interval', { minuteOfDay: 0, days: [], everyMinutes: 15 }),
    'Every 15 minutes'
  )
  check('an event trigger describes as nothing', describeSchedule('git.changed', null), '')
}

console.log()
if (failures === 0) {
  console.log('All schedule checks passed.')
} else {
  console.log(`${failures} check(s) failed.`)
  process.exitCode = 1
}
