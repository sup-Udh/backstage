import type { Theme } from '../../themes/types'
import type { AgentConfig } from '../../shared/providerApi'
import { bucketFor, STATUS_GLYPH } from '../../characters/character.states'
import { ALL_AGENTS, useBackstage } from '../../stores/backstageStore'
import { useTeam, spawnedAgents } from '../../stores/teamStore'

interface Props {
  theme: Theme
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
 * The counts come from the same per-agent runtime state the world renders
 * from, so "2 working" here and two characters typing next door are the same
 * two agents. The selector only changes which conversation is shown; it never
 * starts or stops anything.
 */
export function TeamHeader({ theme }: Props) {
  const target = useBackstage((s) => s.chatTarget)
  const setTarget = useBackstage((s) => s.setChatTarget)
  const agentStates = useBackstage((s) => s.agentStates)
  const agents = useTeam((s) => s.agents)

  const present = spawnedAgents(agents)

  const counts: Record<string, number> = {}
  for (const agent of present) {
    const status = agentStates[agent.id]?.status ?? 'idle'
    const bucket = bucketFor(status)
    counts[bucket] = (counts[bucket] ?? 0) + 1
  }

  const errored = present.filter(
    (a) => agentStates[a.id]?.status === 'error'
  ).length

  /* The cast is chosen by slot, so the selector can only ever offer this
     world's characters — never someone from a theme the user is not in. */
  const characterName = (agent: AgentConfig) => {
    const cast = theme.characters
    return cast[((agent.characterSlot % cast.length) + cast.length) % cast.length].name
  }

  return (
    <header className="shrink-0 border-b-[3px] border-ink bg-cream px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-pixel text-sm font-bold uppercase tracking-[0.06em] text-ink">
          Your Team
        </h1>
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
          <span className="text-ink">{present.length}</span> agents
        </span>
      </div>

      <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em]">
        {BUCKETS.map((bucket) => {
          const n = counts[bucket] ?? 0
          const on = n > 0
          return (
            <li key={bucket} className="flex items-center gap-1">
              <span aria-hidden className={on ? 'text-brand-deep' : 'text-rule'}>
                {STATUS_GLYPH[bucket === 'idle' ? 'idle' : bucket]}
              </span>
              <span className={on ? 'text-ink' : 'text-ink-3'}>{n}</span>
              <span className="text-ink-3">{bucket}</span>
            </li>
          )
        })}
        {/* An agent whose provider failed is not idle, and must not be
            counted as though it were. */}
        {errored > 0 && (
          <li className="flex items-center gap-1">
            <span aria-hidden className="text-rust">
              {STATUS_GLYPH.error}
            </span>
            <span className="text-rust">{errored}</span>
            <span className="text-ink-3">error</span>
          </li>
        )}
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
          <option value={ALL_AGENTS}>
            All agents{present.length > 0 ? ` (${present.length})` : ''}
          </option>
          {present.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {characterName(agent)} — {agent.role}
            </option>
          ))}
        </select>
      </div>
    </header>
  )
}
