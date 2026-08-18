import type { AgentStatus } from '../../agents/agent.types'
import { STATUS_GLYPH, STATUS_LABEL } from '../../characters/character.states'

/** Statuses that count as "actively doing something" get the brand colour. */
const ACTIVE: AgentStatus[] = ['working', 'thinking', 'talking', 'success']

interface Props {
  status: AgentStatus
  /** Render on a dark surface (tooltips, the terminal panel). */
  dark?: boolean
  className?: string
}

/**
 * The single visual language for agent state, used identically in the HUD,
 * the tooltips and the team cards: filled glyph plus uppercase label.
 */
export function StatusChip({ status, dark = false, className = '' }: Props) {
  const active = ACTIVE.includes(status)
  const colour = active
    ? dark
      ? 'text-brand'
      : 'text-brand-deep'
    : dark
      ? 'text-ink-3'
      : 'text-ink-3'

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-pixel text-xs font-bold uppercase tracking-[0.14em] ${colour} ${className}`}
    >
      <span aria-hidden className={active ? 'blink' : ''}>
        {STATUS_GLYPH[status]}
      </span>
      {STATUS_LABEL[status]}
    </span>
  )
}
