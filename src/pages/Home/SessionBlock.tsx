import { useState } from 'react'
import type { SessionLine } from '../../shared/providerApi'

interface Props {
  lines: SessionLine[]
  /** What the session is called, for the header. */
  name: string
}

/** Collapse anything longer than this, showing the tail. */
const PREVIEW_LINES = 12

/**
 * A run of output from a real CLI session.
 *
 * Presented as output, not as an assistant's message. The bytes a full-screen
 * CLI writes carry no structure saying which lines were the model speaking
 * and which were a tool banner or a progress note, so this does not pretend
 * to know — it shows what the process printed, in a monospaced block, marked
 * as coming from the session.
 *
 * That is a deliberate limit rather than an unfinished feature. Inferring
 * message boundaries would mean attributing sentences to Claude that Claude
 * may not have said, and a transcript that is subtly wrong is worse than one
 * that is plainly raw. The terminal tab remains the exact view.
 */
export function SessionBlock({ lines, name }: Props) {
  const [open, setOpen] = useState(false)

  const isUser = lines[0]?.kind === 'user'
  if (isUser) {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] border-2 border-ink bg-brand px-2.5 py-1.5 font-ui text-[12px] leading-[1.5] text-on-brand">
          {lines.map((l) => l.text).join('\n')}
        </p>
      </div>
    )
  }

  const long = lines.length > PREVIEW_LINES
  const shown = open || !long ? lines : lines.slice(-PREVIEW_LINES)

  return (
    <div className="border-2 border-rule bg-paper">
      <div className="flex items-center gap-2 border-b-2 border-rule px-2 py-1">
        <span aria-hidden className="font-mono text-[10px] text-ink-3">
          ▸
        </span>
        <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
          {name}
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-3">
          {lines.length} line{lines.length === 1 ? '' : 's'}
        </span>
        {long && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="font-mono text-[10px] text-ink-3 transition-colors hover:text-ink"
          >
            {open ? '−' : '+'}
          </button>
        )}
      </div>

      {long && !open && (
        <p className="border-b-2 border-rule px-2 py-0.5 font-mono text-[10px] text-ink-3">
          … {lines.length - PREVIEW_LINES} earlier line
          {lines.length - PREVIEW_LINES === 1 ? '' : 's'}
        </p>
      )}

      {/*
        Horizontally scrollable rather than wrapped. CLI output is aligned —
        tables, diffs, trees — and re-wrapping it destroys the alignment that
        makes it readable in the first place.
      */}
      <div className="overflow-x-auto px-2 py-1">
        <pre className="whitespace-pre font-mono text-[11px] leading-[1.5] text-ink-3">
          {shown.map((l) => l.text).join('\n')}
        </pre>
      </div>
    </div>
  )
}
