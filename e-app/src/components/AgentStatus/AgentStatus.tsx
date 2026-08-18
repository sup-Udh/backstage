import type { AgentStatus as Status } from '../../agents/agent.types'
import type { AgentView } from '../../world/world.types'
import { STATUS_GLYPH } from '../../characters/character.states'

interface Props {
  agents: AgentView[]
  className?: string
}

/** Statuses collapsed into the four the HUD reports on. */
function bucket(status: Status): 'working' | 'thinking' | 'talking' | 'idle' {
  if (status === 'working' || status === 'success') return 'working'
  if (status === 'thinking') return 'thinking'
  if (status === 'talking') return 'talking'
  return 'idle'
}

const ROWS: { key: ReturnType<typeof bucket>; label: string; status: Status }[] = [
  { key: 'working', label: 'Working', status: 'working' },
  { key: 'thinking', label: 'Thinking', status: 'thinking' },
  { key: 'talking', label: 'Talking', status: 'talking' },
  { key: 'idle', label: 'Idle', status: 'idle' }
]

/**
 * Live office telemetry, laid out as a horizontal strip so it can live in the
 * frame's status bar rather than on top of the room. Nothing in the scene
 * gets occluded, which matters because the wall art carries the theme.
 */
export function AgentStatus({ agents, className = '' }: Props) {
  const counts = agents.reduce<Record<string, number>>((acc, a) => {
    const k = bucket(a.status)
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <span className="flex items-baseline gap-1.5">
        <span className="font-pixel text-lg font-bold leading-none text-brand">
          {agents.length}
        </span>
        <span className="font-pixel text-[10px] font-bold uppercase tracking-[0.18em] text-cream-2">
          Agents
        </span>
      </span>

      <span aria-hidden className="h-4 w-px bg-ink-3" />

      <ul className="flex items-center gap-4">
        {ROWS.map((row) => {
          const n = counts[row.key] ?? 0
          const on = n > 0
          return (
            <li
              key={row.key}
              className="flex items-center gap-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.12em]"
            >
              <span aria-hidden className={on ? 'text-brand' : 'text-dim'}>
                {STATUS_GLYPH[row.status]}
              </span>
              <span className={on ? 'text-cream' : 'text-dim'}>{n}</span>
              <span className={on ? 'text-cream-2' : 'text-dim'}>
                {row.label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
