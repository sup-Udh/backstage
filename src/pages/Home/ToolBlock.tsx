import { useState } from 'react'
import {
  GROUP_GLYPH,
  GROUP_LABEL,
  type ToolBlock as Block
} from '../../agents/toolActivity'

interface Props {
  block: Block
  /** Expanded on first render, for the block currently running. */
  defaultOpen?: boolean
}

/**
 * A run of tool calls, boxed.
 *
 * The alternative — and what this replaces — was letting tool output fall
 * into the prose, which produced a paragraph the user had to read in full to
 * discover that most of it was a directory listing. A box says at a glance
 * what kind of work happened and how much of it, and opens if the detail
 * matters.
 *
 * Collapsed by default once finished, open while running: work in progress is
 * the thing the user is actually watching, and work that is over is evidence
 * they can go back to.
 */
export function ToolBlock({ block, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen ?? block.running)

  const label = GROUP_LABEL[block.group].toUpperCase()
  const count = block.runs.length
  const done = block.runs.filter((r) => r.status !== 'running').length

  return (
    <div
      className={[
        'border-2 bg-paper',
        block.failed > 0 ? 'border-rust' : block.running ? 'border-brand-deep' : 'border-rule'
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-1 text-left transition-colors hover:bg-brand-pale"
      >
        <span aria-hidden className="font-mono text-[10px] text-ink-3">
          {GROUP_GLYPH[block.group]}
        </span>
        <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
          {label}
        </span>

        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-3">
          {block.running ? `${done}/${count}` : count}
        </span>

        {block.failed > 0 && (
          <span className="font-mono text-[10px] text-rust">{block.failed} failed</span>
        )}

        <span aria-hidden className="font-mono text-[10px] text-ink-3">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <ul className="border-t-2 border-rule px-2 py-1">
          {block.runs.map((run) => (
            <li key={run.id} className="flex items-baseline gap-1.5 py-px">
              <span
                aria-hidden
                className={[
                  'font-mono text-[10px]',
                  run.status === 'ok'
                    ? 'text-sage-dark'
                    : run.status === 'failed'
                      ? 'text-rust'
                      : 'blink text-brand-deep'
                ].join(' ')}
              >
                {run.status === 'ok' ? '✓' : run.status === 'failed' ? '✕' : '·'}
              </span>
              <span
                className={[
                  'font-mono text-[11px] leading-snug',
                  run.status === 'failed' ? 'text-rust' : 'text-ink-3'
                ].join(' ')}
              >
                {run.action}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
