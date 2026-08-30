import { useEffect, useMemo, useRef } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { ACTIVITY_GLYPH, isBusyActivity } from '../../shared/activity'

/**
 * What has actually been happening, in order.
 *
 * Every line here is a real runtime event: a tool the agent genuinely called,
 * an approval that genuinely went up, a hand-off that genuinely happened. The
 * main process writes a line only when the activity *changes*, so an agent
 * reading eleven files produces eleven lines and an agent reading one file
 * eleven times produces one — which is the difference between a story and a
 * log.
 *
 * Deliberately not the whole event stream. `agent.message.delta` fires many
 * times a second and `agent.state` fires on every queue change; neither is
 * something a person wants to read afterwards.
 */

interface Props {
  /** Limit to one agent. Omitted shows the whole project. */
  agentId?: string | null
  /** How many lines to show. */
  limit?: number
  /** Resolve an id to the name the rest of the interface uses. */
  nameFor?: (agentId: string) => string
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function ActivityTimeline({ agentId, limit = 14, nameFor }: Props) {
  const log = useBackstage((s) => s.activityLog)
  const scrollRef = useRef<HTMLOListElement>(null)

  const entries = useMemo(() => {
    const scoped = agentId ? log.filter((e) => e.agentId === agentId) : log
    return scoped.slice(-limit)
  }, [log, agentId, limit])

  /* Newest at the bottom, and the bottom is where the eye should be. */
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])

  if (entries.length === 0) {
    return (
      <p className="px-3 py-2 font-ui text-[11px] leading-snug text-ink-3">
        Nothing yet. Every file read, command and hand-off appears here as it
        happens.
      </p>
    )
  }

  return (
    <ol
      ref={scrollRef}
      className="max-h-[168px] overflow-y-auto px-3 py-1.5"
    >
      {entries.map((entry, i) => {
        const busy = isBusyActivity(entry.type)
        const last = i === entries.length - 1
        const name = nameFor?.(entry.agentId) ?? entry.agentName

        return (
          <li
            key={entry.id}
            className="flex items-baseline gap-2 border-l-2 border-rule py-0.5 pl-2"
          >
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-ink-3">
              {clock(entry.at)}
            </span>
            <span
              aria-hidden
              className={`shrink-0 font-pixel text-[10px] ${
                entry.type === 'error'
                  ? 'text-rust'
                  : entry.type === 'completed'
                    ? 'text-sage'
                    : 'text-brand-deep'
              } ${busy && last ? 'blink' : ''}`}
            >
              {ACTIVITY_GLYPH[entry.type]}
            </span>
            <span className="min-w-0 flex-1 truncate font-ui text-[11px] leading-snug text-ink-3">
              {/*
                The agent's name is not repeated when the panel is already
                scoped to one — "Jane, Jane, Jane" down the left margin is
                noise, and the header above already says whose this is.
              */}
              {!agentId && <span className="text-ink">{name} </span>}
              <span className="font-semibold text-ink">
                {entry.label.toLowerCase()}
              </span>
              {entry.detail && <span> {entry.detail}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
