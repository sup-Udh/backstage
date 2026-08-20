import type { AgentStatus } from '../../agents/agent.types'
import {
  ACTIVE_STATUSES,
  STATUS_GLYPH,
  STATUS_LABEL
} from '../../characters/character.states'

interface Props {
  status: AgentStatus
  /** Render on a dark surface (tooltips, the terminal panel). */
  dark?: boolean
  /** Show a bordered box rather than bare text. */
  boxed?: boolean
  className?: string
}

/**
 * The single visual language for agent state, used identically in the roster,
 * the world tooltips, the chat header and the team cards: filled glyph plus
 * uppercase label.
 *
 * It takes its glyphs and labels from the one status table rather than keeping
 * its own, so a status added to the runtime cannot render here as blank.
 */
export function StatusChip({ status, dark = false, boxed = false, className = '' }: Props) {
  const active = ACTIVE_STATUSES.includes(status)
  const error = status === 'error'

  const colour = error
    ? dark
      ? 'text-rust'
      : 'text-rust'
    : active
      ? dark
        ? 'text-brand'
        : 'text-brand-deep'
      : 'text-ink-3'

  const box = boxed
    ? `border-2 px-2 py-0.5 ${
        error
          ? 'border-rust'
          : active
            ? 'border-ink bg-brand-pale'
            : 'border-rule bg-paper'
      }`
    : ''

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.08em] ${colour} ${box} ${className}`}
    >
      <span aria-hidden className={active && !error ? 'blink' : ''}>
        {STATUS_GLYPH[status]}
      </span>
      {STATUS_LABEL[status]}
    </span>
  )
}
