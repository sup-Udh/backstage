import { useEffect, useRef } from 'react'
import { useBackstage } from '../stores/backstageStore'

/**
 * The live activity console.
 *
 * Everything here originates from a real event: a tool the runtime actually
 * ran, a file the watcher actually saw change, a CLI session that actually
 * started. Nothing is inferred from "the agent is probably doing something".
 *
 * Entries are clickable where there is somewhere to go — a file opens in the
 * files drawer, a command opens the terminal — which is what turns the feed
 * from a log into a way of moving around the workspace.
 */

function clock(at: number): string {
  const d = new Date(at)
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

/** Pull a workspace path out of an activity line, if it names one. */
function pathIn(text: string): string | null {
  const m = /([\w.@-]+\/)*[\w.@-]+\.(ts|tsx|js|jsx|json|md|css|html|py|rs|go|toml|yml|yaml)\b/.exec(
    text
  )
  return m ? m[0] : null
}

export function ActivityConsole() {
  const activity = useBackstage((s) => s.activity)
  const setOpenFile = useBackstage((s) => s.setOpenFile)
  const setDrawer = useBackstage((s) => s.setDrawer)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [activity.length])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 border-b-2 border-rule px-3 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        Activity
      </p>

      <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {activity.length === 0 && (
          <p className="font-ui text-xs text-ink-3">
            Nothing yet. Give an agent a task, or run a command in the terminal.
          </p>
        )}

        {activity.map((entry) => {
          const file = pathIn(entry.text)
          const isCommand = /^ran |running /i.test(entry.text)
          const clickable = Boolean(file) || isCommand

          const go = () => {
            if (file) {
              setOpenFile(file)
              setDrawer('files')
            } else if (isCommand) {
              setDrawer('terminal')
            }
          }

          return (
            <li key={entry.id} className="flex gap-3 py-1">
              <span className="shrink-0 pt-px font-mono text-[10px] tabular-nums text-ink-3">
                {clock(entry.at)}
              </span>
              <button
                type="button"
                onClick={clickable ? go : undefined}
                disabled={!clickable}
                className={`text-left font-ui text-[13px] leading-snug ${
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
