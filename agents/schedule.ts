import type { TriggerEventType, TriggerSchedule } from '../src/shared/agents'
import { isScheduleEvent, normaliseSchedule } from '../src/shared/schedule'

/**
 * When a time-based automation runs next.
 *
 * Pure, and deliberately so: this is the one part of the automation system
 * that is easy to get subtly wrong and impossible to notice — a daily review
 * that fires at the wrong hour, or twice, or never, looks like nothing at all
 * from the outside. No store, no clock of its own, no Electron: every function
 * takes the current time as an argument so a test can ask what happens at
 * 23:59 on a Sunday without waiting for one.
 *
 * Local time throughout. "Every evening" means the user's evening, and a
 * developer tool that fires a daily review at 18:00 UTC for somebody in
 * California is wrong in a way that takes weeks to spot.
 *
 * The shape of a schedule, and how to describe one, live in
 * `src/shared/schedule.ts` because the renderer needs them too. What is here
 * is only the part that decides something.
 */

export {
  DAY_NAMES,
  DEFAULT_SCHEDULE,
  WEEKDAYS,
  describeSchedule,
  isScheduleEvent,
  normaliseSchedule
} from '../src/shared/schedule'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Local midnight on the day `at` falls in. */
function startOfDay(at: number): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * The next moment this schedule is due, strictly after `from`.
 *
 * Strictly after, which is what stops a schedule that has just run being
 * immediately due again: the scheduler recomputes from the moment it fired, so
 * an inclusive comparison would fire the same automation in a loop for the
 * whole minute it was due in.
 *
 * Returns null for a trigger that is not time-based, so the caller can store
 * the result without deciding whether it applies.
 */
export function nextRunAt(
  event: TriggerEventType,
  schedule: TriggerSchedule | null,
  from: number,
  lastRunAt: number | null = null
): number | null {
  if (!isScheduleEvent(event)) return null
  const s = normaliseSchedule(schedule)

  if (event === 'schedule.interval') {
    const step = s.everyMinutes * MINUTE
    /*
     * Measured from the last run, not from now. Otherwise restarting the app
     * would push every interval automation a full period into the future,
     * which is how "every hour" quietly becomes "every hour I happen to leave
     * it open for an hour".
     */
    const base = lastRunAt ?? from
    let next = base + step
    // A long shutdown must not produce a backlog; it produces one run, soon.
    if (next <= from) next = from + Math.min(step, MINUTE)
    return next
  }

  const allowed =
    event === 'schedule.weekly' ? (s.days.length > 0 ? s.days : [1]) : s.days

  for (let offset = 0; offset <= 8; offset++) {
    /*
     * Rebuilt through Date rather than by adding milliseconds, so a day that
     * is 23 or 25 hours long — the two clock changes a year — still lands on
     * the requested wall-clock time rather than an hour either side of it.
     */
    const candidate = new Date(startOfDay(from) + offset * DAY)
    candidate.setHours(0, s.minuteOfDay, 0, 0)
    const at = candidate.getTime()

    if (at <= from) continue
    if (allowed.length > 0 && !allowed.includes(candidate.getDay())) continue
    return at
  }
  return null
}

/** Whether this schedule is due to run, given when it is next expected. */
export function isDue(
  event: TriggerEventType,
  nextAt: number | null,
  now: number
): boolean {
  if (!isScheduleEvent(event)) return false
  return nextAt !== null && nextAt <= now
}
