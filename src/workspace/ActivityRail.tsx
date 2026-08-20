import { useEffect, useRef } from 'react'
import { useBackstage } from '../stores/backstageStore'

/**
 * Activity, shown where it happened.
 *
 * There is no Activity destination any more. A log of everything the team has
 * ever done is a page nobody reads; the same lines next to the session that
 * produced them are the session explaining itself. So this is a rail, not a
 * panel: a handful of recent lines, docked inside whichever surface they
 * belong to.
 *
 * Everything here originates from a real event — a tool the runtime actually
 * ran, a file the watcher actually saw change, a CLI session that actually
 * started. Nothing is inferred from "the agent is probably doing something".
 *
 * Entries stay clickable where there is somewhere to go: a file opens in the
 * files tab, a command brings the terminal forward.
 */

interface Props {
  /** How many recent lines to keep on screen. */
  limit?: number
  /** Restrict to one agent, e.g. the CLI session being viewed. */
  agentId?: string
  /** Heading above the rail. Omit for a bare list. */
  label?: string
}

/** Pull a workspace path out of an activity line, if it names one. */
function pathIn(text: string): string | null {
  const m =
    /([\w.@-]+\/)*[\w.@-]+\.(ts|tsx|js|jsx|json|md|css|html|py|rs|go|toml|yml|yaml)\b/.exec(
      text
    )
  return m ? m[0] : null
}

export function ActivityRail({ limit = 6, agentId, label }: Props) {
  const chatTarget = useBackstage((s) => s.chatTarget)
  const targetId = agentId || chatTarget
  const activity = useBackstage((s) => s.agentActivity[targetId]) || []
  const setOpenFile = useBackstage((s) => s.setOpenFile)
  const setTab = useBackstage((s) => s.setTab)
  const endRef = useRef<HTMLDivElement>(null)

  const lines = (agentId ? activity.filter((e) => e.agentId === agentId) : activity).slice(
    -limit
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [lines.length])

  if (lines.length === 0) return null

  return (
    <div className="shrink-0 border-b-2 border-rule bg-brand-pale/50 px-3 py-1.5">
      {label && (
        <p className="mb-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          {label}
        </p>
      )}

      <ol className="flex flex-col gap-px">
        {lines.map((entry) => {
          const file = pathIn(entry.text)
          const isCommand = /^ran |running /i.test(entry.text)
          const clickable = Boolean(file) || isCommand

          const go = () => {
            if (file) {
              setOpenFile(file)
            } else if (isCommand) {
              setTab('terminal')
            }
          }

          return (
            <li key={entry.id} className="flex items-baseline gap-2">
              {/*
                A chevron rather than a timestamp: inside a live session the
                interesting thing is the sequence, not the clock.
              */}
              <span aria-hidden className="shrink-0 font-mono text-[10px] text-brand-deep">
                &gt;
              </span>
              <button
                type="button"
                onClick={clickable ? go : undefined}
                disabled={!clickable}
                title={clickable ? 'Open' : undefined}
                className={`truncate text-left font-mono text-[11px] leading-[1.5] ${
                  clickable
                    ? 'text-ink-3 underline decoration-rule underline-offset-2 hover:text-ink hover:decoration-brand-deep'
                    : 'cursor-default text-ink-3'
                }`}
              >
                {entry.agentName && (
                  <span className="font-semibold text-ink">{entry.agentName} </span>
                )}
                {entry.text}
              </button>
            </li>
          )
        })}
        <div ref={endRef} />
      </ol>
    </div>
  )
}
