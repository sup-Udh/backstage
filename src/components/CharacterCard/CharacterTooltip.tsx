import type { AgentView } from '../../world/world.types'
import { STATUS_GLYPH, STATUS_LABEL } from '../../characters/character.states'

interface Props {
  agent: AgentView
  /** Position within the world frame, in CSS pixels. */
  left: number
  top: number
}

const ACTIVE = ['working', 'thinking', 'talking', 'success']

/**
 * The hover card. Dark plate, brand border, notched corners, tiny type -
 * deliberately a game inspect panel rather than a web tooltip.
 */
export function CharacterTooltip({ agent, left, top }: Props) {
  const active = ACTIVE.includes(agent.status)

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{ left, top, transform: 'translate(-50%, -100%)' }}
    >
      <div className="border-[3px] border-brand bg-slate px-3 py-2 shadow-[4px_4px_0_0_rgba(27,27,42,0.45)]">
        {/* Notched corners, drawn as four cream squares over the border. */}
        <span className="absolute left-0 top-0 h-[3px] w-[3px] bg-brand" />
        <span className="absolute right-0 top-0 h-[3px] w-[3px] bg-brand" />
        <span className="absolute bottom-0 left-0 h-[3px] w-[3px] bg-brand" />
        <span className="absolute bottom-0 right-0 h-[3px] w-[3px] bg-brand" />

        <p className="font-pixel text-base font-bold uppercase leading-none tracking-[0.06em] text-brand">
          {agent.name}
        </p>
        <p className="mt-1.5 font-ui text-xs leading-none text-on-slate-2">
          {agent.role}
        </p>

        <div className="my-2 h-px bg-slate-rule" />

        <p className="font-mono text-[11px] leading-none text-dim">
          <span className="uppercase tracking-[0.08em]">Model</span>{' '}
          <span className="font-medium text-on-slate">{agent.model}</span>
        </p>

        <p
          className={`mt-2 flex items-center gap-1.5 font-pixel text-xs font-semibold uppercase tracking-[0.08em] ${
            active ? 'text-brand' : 'text-dim'
          }`}
        >
          <span aria-hidden className={active ? 'blink' : ''}>
            {STATUS_GLYPH[agent.status]}
          </span>
          {STATUS_LABEL[agent.status]}
        </p>

        {agent.task && (
          <p className="mt-1.5 max-w-[190px] font-ui text-[11px] leading-snug text-dim">
            {agent.task}
          </p>
        )}
      </div>

      {/* Pointer down to the character. */}
      <div className="mx-auto h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-brand" />
    </div>
  )
}
