import type { AgentActivity } from '../../shared/providerApi'
import {
  ACTIVITY_GLYPH,
  isBusyActivity,
  isWaitingActivity
} from '../../shared/activity'

/**
 * One activity, as a chip.
 *
 * The same component wherever an activity is shown outside the pixel world —
 * the chat header, the inspector, the group chat, the timeline. Written once
 * because the alternative is four places each deciding independently what
 * colour "waiting for approval" is, and then disagreeing about it.
 *
 * Colour carries one distinction and only one: is something happening, is
 * somebody blocked, or is it over. Anything finer would need a legend, and a
 * badge that needs a legend is not a badge.
 */

interface Props {
  activity: AgentActivity
  /** Show the detail line beside the label. */
  detail?: boolean
  /** Use the full path or command rather than the shortened one. */
  full?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function ActivityBadge({
  activity,
  detail = true,
  full = false,
  size = 'sm',
  className = ''
}: Props) {
  const busy = isBusyActivity(activity.type)
  const waiting = isWaitingActivity(activity.type)
  const failed = activity.type === 'error'
  const done = activity.type === 'completed'

  const tone = failed
    ? 'text-rust'
    : done
      ? 'text-sage'
      : waiting
        ? 'text-brand-deep'
        : busy
          ? 'text-brand-deep'
          : 'text-ink-3'

  const text = full ? (activity.detailFull ?? activity.detail) : activity.detail

  return (
    <span
      className={`inline-flex min-w-0 items-baseline gap-1.5 ${className}`}
      title={
        activity.detailFull
          ? `${activity.label} ${activity.detailFull}`
          : activity.label
      }
    >
      <span
        aria-hidden
        /*
         * Only genuine activity pulses. A completed or waiting badge holds
         * still — a blinking ✓ reads as "still doing something", which is the
         * opposite of what it means.
         */
        className={`${tone} font-pixel ${busy ? 'blink' : ''} ${
          size === 'md' ? 'text-[13px]' : 'text-[11px]'
        }`}
      >
        {ACTIVITY_GLYPH[activity.type]}
      </span>
      <span
        className={`shrink-0 font-pixel font-semibold uppercase tracking-[0.08em] ${tone} ${
          size === 'md' ? 'text-[12px]' : 'text-[10px]'
        }`}
      >
        {activity.label}
      </span>
      {detail && text && (
        <span
          className={`min-w-0 truncate font-mono text-ink-3 ${
            size === 'md' ? 'text-[11px]' : 'text-[10px]'
          }`}
        >
          {text}
        </span>
      )}
    </span>
  )
}

/**
 * How long an activity has been running, as a person would say it.
 *
 * Seconds until a minute, then minutes. No milliseconds and no decimals: the
 * question this answers is "has this been stuck?", and a figure precise to a
 * hundredth of a second implies a precision the answer does not have.
 */
export function elapsedLabel(startedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}
