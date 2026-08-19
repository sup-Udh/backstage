import { useEffect, useRef } from 'react'
import type { ActivityEntry } from '../../stores/backstageStore'
import type { Theme } from '../../themes/types'

interface Props {
  activity: ActivityEntry[]
  theme: Theme
}

function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

/**
 * The activity feed: what the team is doing, as a log.
 *
 * Names resolve through the active theme, so the same event reads as "Jane
 * opened the project files" in one world and "Rachel opened the project
 * files" in another without the runtime knowing either name exists.
 */
export function ActivityFeed({ activity, theme }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [activity.length])

  if (activity.length === 0) return null

  const nameFor = (agentId?: string) =>
    theme.characters.find((c) => c.agentId === agentId)?.name

  return (
    <div className="border-t-[3px] border-ink">
      <p className="border-b-2 border-rule px-4 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        Activity
      </p>

      <ol className="max-h-44 overflow-y-auto px-4 py-3">
        {activity.map((entry) => {
          const who = nameFor(entry.agentId)
          return (
            <li key={entry.id} className="flex gap-3 py-1">
              <span className="shrink-0 pt-px font-mono text-[10px] font-medium tabular-nums text-ink-3">
                {clock(entry.at)}
              </span>
              <span className="font-ui text-[13px] leading-snug text-ink-3">
                {who && <span className="font-semibold text-ink">{who} </span>}
                {entry.text}
              </span>
            </li>
          )
        })}
        <div ref={endRef} />
      </ol>
    </div>
  )
}
