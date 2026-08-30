import type { TriggerEventType, TriggerSchedule } from './agents'

/**
 * Reading and writing a schedule.
 *
 * In `src/shared` rather than beside the scheduler for the same reason the
 * agent domain is: both processes need it. The main process normalises what it
 * stores; the renderer has to render "Every weekday · 09:00" on a card and in
 * a builder, and the two must not be separate translations of the same struct.
 * The one thing that stays in the main process is `nextRunAt`, which is the
 * only part that decides anything.
 */

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Monday to Friday, for the "every weekday" case. */
export const WEEKDAYS = [1, 2, 3, 4, 5]

export const DEFAULT_SCHEDULE: TriggerSchedule = {
  // 09:00, which is the least surprising default for "every day".
  minuteOfDay: 9 * 60,
  days: [],
  everyMinutes: 60
}

export function isScheduleEvent(event: TriggerEventType): boolean {
  return (
    event === 'schedule.daily' ||
    event === 'schedule.weekly' ||
    event === 'schedule.interval'
  )
}

export function normaliseSchedule(raw: unknown): TriggerSchedule {
  const s = (raw ?? {}) as Partial<TriggerSchedule>
  const minuteOfDay = Number.isFinite(s.minuteOfDay)
    ? Math.min(24 * 60 - 1, Math.max(0, Math.round(Number(s.minuteOfDay))))
    : DEFAULT_SCHEDULE.minuteOfDay
  const days = Array.isArray(s.days)
    ? [
        ...new Set(
          s.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        )
      ].sort()
    : []
  const everyMinutes = Number.isFinite(s.everyMinutes)
    ? Math.min(60 * 24 * 7, Math.max(5, Math.round(Number(s.everyMinutes))))
    : DEFAULT_SCHEDULE.everyMinutes
  return { minuteOfDay, days, everyMinutes }
}

export function clockLabel(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60)
  const m = minuteOfDay % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** The schedule as a person would say it. Used on cards and in the builder. */
export function describeSchedule(
  event: TriggerEventType,
  schedule: TriggerSchedule | null
): string {
  if (!isScheduleEvent(event)) return ''
  const s = normaliseSchedule(schedule)

  if (event === 'schedule.interval') {
    if (s.everyMinutes % 60 === 0) {
      const hours = s.everyMinutes / 60
      return hours === 1 ? 'Every hour' : `Every ${hours} hours`
    }
    return `Every ${s.everyMinutes} minutes`
  }

  if (event === 'schedule.weekly') {
    const days = (s.days.length > 0 ? s.days : [1]).map((d) => DAY_NAMES[d])
    return `Every ${days.join(', ')} · ${clockLabel(s.minuteOfDay)}`
  }

  if (s.days.length === 0) return `Every day · ${clockLabel(s.minuteOfDay)}`
  const isWeekdays = s.days.length === 5 && WEEKDAYS.every((d) => s.days.includes(d))
  if (isWeekdays) return `Every weekday · ${clockLabel(s.minuteOfDay)}`
  return `${s.days.map((d) => DAY_NAMES[d]).join(', ')} · ${clockLabel(s.minuteOfDay)}`
}
