import { useMemo, useState } from 'react'
import {
  inlineText,
  parseBlocks,
  safeHref,
  type Align,
  type Block,
  type Inline
} from './parse'

/**
 * An agent's answer, rendered as the document it actually is.
 *
 * The typography rule this exists to enforce: pixel type for labels, readable
 * type for prose. Backstage's voice is the pixel font, and the chat had
 * extended that to the answers themselves — a 12px pixel-influenced face
 * setting four hundred words of technical explanation with no headings, no
 * lists and no code blocks, because the Markdown was never parsed. Structure
 * and legibility were both lost at once, which is why the result read as a
 * wall rather than as a long answer.
 *
 * So: headings are pixel type, small and quiet, because they are labels. Body
 * text, list items, table cells and code are the UI and mono faces at a size
 * and line height meant for reading.
 */

interface Props {
  text: string
  /**
   * Tighter spacing, for places where an answer sits inside another card and
   * the surrounding layout already provides the breathing room.
   */
  compact?: boolean
}

export function Markdown({ text, compact = false }: Props) {
  const blocks = useMemo(() => parseBlocks(text), [text])

  return (
    <div className={compact ? 'flex flex-col gap-1.5' : 'flex flex-col gap-2.5'}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} compact={compact} />
      ))}
    </div>
  )
}

function BlockView({ block, compact }: { block: Block; compact: boolean }) {
  switch (block.kind) {
    case 'heading':
      return <Heading block={block} />

    case 'paragraph':
      return (
        <p className="font-ui text-[12.5px] leading-[1.65] text-ink">
          <InlineView nodes={block.children} />
        </p>
      )

    case 'code':
      return <CodeBlock language={block.language} text={block.text} />

    case 'rule':
      return <hr className="my-1 border-0 border-t-2 border-rule" />

    case 'quote':
      return (
        <blockquote className="border-l-2 border-brand-deep pl-2.5">
          <div className="flex flex-col gap-1.5">
            {block.blocks.map((b, i) => (
              <BlockView key={i} block={b} compact />
            ))}
          </div>
        </blockquote>
      )

    case 'list':
      return <ListView block={block} compact={compact} />

    case 'table':
      return <TableView block={block} />
  }
}

/**
 * A heading.
 *
 * Every level is set in pixel type at close to the same size, separated by
 * weight and colour rather than by scale. A model writing `####` inside a
 * side panel is labelling a subsection, not asking for 24px type, and honouring
 * the scale literally is what turns one answer into something that looks like
 * six competing documents.
 */
function Heading({ block }: { block: Extract<Block, { kind: 'heading' }> }) {
  const top = block.level <= 2
  return (
    <p
      className={
        top
          ? 'mt-1 font-pixel text-[11px] font-bold uppercase tracking-[0.1em] text-ink'
          : 'mt-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3'
      }
    >
      <InlineView nodes={block.children} />
    </p>
  )
}

function ListView({
  block,
  compact
}: {
  block: Extract<Block, { kind: 'list' }>
  compact: boolean
}) {
  const items = block.items.map((blocks, i) => (
    <li key={i} className="pl-0.5">
      <div className="flex flex-col gap-1">
        {blocks.map((b, j) => (
          <BlockView key={j} block={b} compact />
        ))}
      </div>
    </li>
  ))

  return block.ordered ? (
    <ol
      start={block.start}
      className={`ml-4 list-outside list-decimal font-ui text-[12.5px] leading-[1.6] text-ink marker:font-mono marker:text-[11px] marker:text-ink-3 ${
        compact ? 'flex flex-col gap-0.5' : 'flex flex-col gap-1'
      }`}
    >
      {items}
    </ol>
  ) : (
    <ul
      className={`ml-4 list-outside list-disc font-ui text-[12.5px] leading-[1.6] text-ink marker:text-brand-deep ${
        compact ? 'flex flex-col gap-0.5' : 'flex flex-col gap-1'
      }`}
    >
      {items}
    </ul>
  )
}

/**
 * A table, in its own horizontally scrolling box.
 *
 * The box is the point. A four-column table of file paths is wider than the
 * panel will ever be, and without a scroll container of its own it either
 * pushes the whole conversation sideways or squeezes every other column into
 * one character.
 */
function TableView({ block }: { block: Extract<Block, { kind: 'table' }> }) {
  const cell = (a: Align) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  return (
    <div className="overflow-x-auto border-2 border-rule bg-paper">
      <table className="w-full border-collapse font-ui text-[12px]">
        <thead>
          <tr className="border-b-2 border-rule bg-cream-2">
            {block.head.map((h, i) => (
              <th
                key={i}
                className={`px-2 py-1 font-pixel text-[9px] font-semibold uppercase tracking-[0.06em] text-ink ${cell(
                  block.align[i]
                )}`}
              >
                <InlineView nodes={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-b border-rule/60 last:border-0">
              {row.map((c, j) => (
                <td
                  key={j}
                  className={`px-2 py-1 align-top leading-[1.5] text-ink ${cell(
                    block.align[j]
                  )}`}
                >
                  <InlineView nodes={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Past this many lines a code block is folded to its first few. */
const CODE_FOLD_AT = 14
const CODE_PEEK = 6

/**
 * A fenced code block.
 *
 * Long ones start folded. An agent that pastes a 200-line file into its answer
 * is not making a point that needs 200 lines to make, and letting it own four
 * screens of the conversation buries the sentence that explains why it is
 * there. The first few lines stay visible, so the fold is a preview rather
 * than a closed door.
 */
function CodeBlock({ language, text }: { language: string | null; text: string }) {
  const lines = text.split('\n')
  const foldable = lines.length > CODE_FOLD_AT
  const [open, setOpen] = useState(false)
  const shown = foldable && !open ? lines.slice(0, CODE_PEEK).join('\n') : text

  return (
    <div className="border-2 border-rule bg-cream-2">
      {(language || foldable) && (
        <div className="flex items-center justify-between gap-2 border-b-2 border-rule px-2 py-0.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
            {language ?? 'code'}
          </span>
          {foldable && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="shrink-0 font-pixel text-[9px] font-semibold uppercase tracking-[0.06em] text-brand-deep hover:text-ink"
            >
              {open ? 'Collapse' : `Show all ${lines.length} lines`}
            </button>
          )}
        </div>
      )}
      <pre className="overflow-x-auto px-2 py-1.5">
        <code className="font-mono text-[11px] leading-[1.55] text-ink">{shown}</code>
      </pre>
      {foldable && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border-t-2 border-rule bg-paper px-2 py-1 text-left font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:bg-brand-pale hover:text-ink"
        >
          + {lines.length - CODE_PEEK} more lines
        </button>
      )}
    </div>
  )
}

function InlineView({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.kind) {
          case 'text':
            return <span key={i}>{node.text}</span>

          case 'code':
            return (
              <code
                key={i}
                className="break-words border border-rule bg-cream-2 px-1 py-px font-mono text-[11px] text-ink"
              >
                {node.text}
              </code>
            )

          case 'strong':
            return (
              <strong key={i} className="font-semibold text-ink">
                <InlineView nodes={node.children} />
              </strong>
            )

          case 'em':
            return (
              <em key={i} className="italic">
                <InlineView nodes={node.children} />
              </em>
            )

          case 'strike':
            return (
              <s key={i} className="text-ink-3">
                <InlineView nodes={node.children} />
              </s>
            )

          case 'link': {
            /*
             * An unsafe scheme renders as its own text rather than as a dead
             * link. The user still sees exactly what the model wrote — which is
             * the useful thing if a model ever does emit a `javascript:` URL —
             * without it being one click from running.
             */
            const href = safeHref(node.href)
            if (!href) {
              return <span key={i}>{inlineText(node.children) || node.href}</span>
            }
            return (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="break-words text-brand-deep underline decoration-brand-deep/40 underline-offset-2 hover:decoration-brand-deep"
              >
                <InlineView nodes={node.children} />
              </a>
            )
          }
        }
      })}
    </>
  )
}
