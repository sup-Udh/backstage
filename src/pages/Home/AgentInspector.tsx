import type { CharacterDef } from '../../characters/character.types'
import type { AgentView } from '../../world/world.types'
import { CharacterSprite } from '../../world/CharacterSprite'
import { STATUS_GLYPH, STATUS_LABEL } from '../../characters/character.states'

interface Props {
  agent: AgentView
  character: CharacterDef
  onFocus: () => void
  onClose: () => void
}

const ACTIVE = ['working', 'thinking', 'talking', 'success']

/**
 * The panel for a character the user has clicked.
 *
 * Unlike the hover card this sticks around, so it can carry the thing the
 * user actually wants: what this agent is working on right now, which model
 * is behind it, and a way to follow it around the room.
 */
export function AgentInspector({ agent, character, onFocus, onClose }: Props) {
  const active = ACTIVE.includes(agent.status)

  return (
    <aside className="absolute bottom-4 left-4 z-20 w-[268px] border-[3px] border-brand bg-ink shadow-[4px_4px_0_0_rgba(27,27,42,0.5)]">
      <header className="flex items-start gap-3 border-b-2 border-ink-3 p-3">
        <div className="shrink-0 border-2 border-ink-3 bg-ink-2 p-1">
          <CharacterSprite
            appearance={character.appearance}
            state={agent.status === 'idle' ? 'idle' : 'working'}
            scale={2}
          />
        </div>

        <div className="min-w-0 flex-1">
          {/*
            The name comes from the view, not the costume. A configured agent
            is re-cast by the theme and answers to the character's name; an
            external CLI session is Claude or Codex in every world, and the
            view is the thing that already knows which of those applies.
          */}
          <p className="font-pixel text-base font-bold uppercase leading-none tracking-[0.06em] text-brand">
            {agent.name}
          </p>
          <p className="mt-1.5 font-ui text-xs leading-none text-cream-2">
            {agent.role}
          </p>
          <p className="mt-2 flex items-center gap-1.5 font-pixel text-xs font-semibold uppercase tracking-[0.06em]">
            <span
              aria-hidden
              className={active ? 'blink text-brand' : 'text-dim'}
            >
              {STATUS_GLYPH[agent.status]}
            </span>
            <span className={active ? 'text-brand' : 'text-dim'}>
              {STATUS_LABEL[agent.status]}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 font-mono text-xs text-dim transition-colors hover:text-cream"
        >
          ✕
        </button>
      </header>

      <div className="p-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-dim">
          Working on
        </p>
        <p className="mt-1 font-ui text-[13px] leading-snug text-cream">
          {agent.task ?? 'Nothing right now.'}
        </p>

        <p className="mt-3 flex items-baseline gap-2 font-mono text-[11px] leading-none">
          <span className="uppercase tracking-[0.08em] text-dim">Model</span>
          <span className="font-medium text-cream">{agent.model}</span>
        </p>

        <button
          type="button"
          onClick={onFocus}
          className="mt-3 w-full border-2 border-brand-shadow bg-brand px-2 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink transition-transform duration-75 hover:-translate-y-px hover:bg-brand-lite"
        >
          Centre on {agent.name}
        </button>
      </div>
    </aside>
  )
}
