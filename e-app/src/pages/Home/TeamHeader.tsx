import type { Theme } from '../../themes/types'
import type { AgentConfig } from '../../shared/providerApi'
import type { AgentView } from '../../world/world.types'
import type { AgentStatus } from '../../agents/agent.types'
import { STATUS_GLYPH } from '../../characters/character.states'
import { useBackstage } from '../../stores/backstageStore'

interface Props {
  theme: Theme
  agents: AgentView[]
  configs: AgentConfig[]
}

/** The four buckets the header reports on. */
function bucket(status: AgentStatus): 'working' | 'thinking' | 'talking' | 'idle' {
  if (status === 'working' || status === 'success') return 'working'
  if (status === 'thinking') return 'thinking'
  if (status === 'talking') return 'talking'
  return 'idle'
}

const BUCKETS = ['working', 'thinking', 'talking', 'idle'] as const

/**
 * The top of the command centre: who is on the team, and who you are talking
 * to.
 *
 * Fixed rather than scrolling. This is the answer to "who is working?", and it
 * has to stay on screen while the surfaces below it change — the panel is a
 * tool, and a tool does not hide its own status bar.
 *
 * The selector is named for the active world's cast: the agent underneath is
 * the same configuration, and only who plays it changes with the theme. It can
 * therefore never offer a character from a world the user is not in.
 */
export function TeamHeader({ theme, agents, configs }: Props) {
  const target = useBackstage((s) => s.chatTarget)
  const setTarget = useBackstage((s) => s.setChatTarget)

  const counts = agents.reduce<Record<string, number>>((acc, a) => {
    const k = bucket(a.status)
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

  const enabled = configs.filter((a) => a.enabled)

  return (
    <header className="shrink-0 border-b-[3px] border-ink bg-cream px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-pixel text-sm font-bold uppercase tracking-[0.06em] text-ink">
          Your Team
        </h1>
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
          <span className="text-ink">{agents.length}</span> agents
        </span>
      </div>

      <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em]">
        {BUCKETS.map((k) => {
          const n = counts[k] ?? 0
          const on = n > 0
          return (
            <li key={k} className="flex items-center gap-1">
              <span aria-hidden className={on ? 'text-brand-deep' : 'text-rule'}>
                {STATUS_GLYPH[k]}
              </span>
              <span className={on ? 'text-ink' : 'text-ink-3'}>{n}</span>
              <span className="text-ink-3">{k}</span>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        <label
          htmlFor="chat-target"
          className="shrink-0 font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3"
        >
          Talk to
        </label>
        <select
          id="chat-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="min-w-0 flex-1 border-2 border-ink bg-paper px-2 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink outline-none focus:border-brand-deep"
        >
          {enabled.map((a) => {
            const cast = theme.characters
            const character =
              cast[((a.characterSlot % cast.length) + cast.length) % cast.length]
            return (
              <option key={a.id} value={a.id}>
                {character.name} — {a.role}
              </option>
            )
          })}
          <option value="all">All agents</option>
        </select>
      </div>
    </header>
  )
}
