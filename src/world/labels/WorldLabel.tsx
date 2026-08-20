import { forwardRef } from 'react'
import type { WorldLabelKind } from './labelSpec'

export type LabelTone = 'default' | 'active' | 'muted' | 'selected'

interface Props {
  kind: WorldLabelKind
  text: string
  /** Rendered size in CSS pixels, already clamped by `labelFontSize`. */
  fontSize: number
  tone?: LabelTone
  /** A small glyph ahead of the text, e.g. the status mark. */
  glyph?: string
}

/**
 * One pixel-world label.
 *
 * A DOM element rather than something painted into the scene canvas, which is
 * the whole point: the browser renders it at the display's own resolution
 * instead of into a low-resolution scene buffer that then gets upscaled. Text
 * is therefore crisp at any zoom and on any device pixel ratio, without the
 * canvas having to know anything about either.
 *
 * Still pixel art in every other respect — Pixelify Sans, hard two-pixel ink
 * borders, no rounding, no blur, no shadows that soften an edge. It reads as a
 * small game HUD tag, not as a web card sitting on top of a game.
 *
 * Positioning is not its business. The layer above places it; this only knows
 * how a label looks.
 */
export const WorldLabel = forwardRef<HTMLDivElement, Props>(function WorldLabel(
  { kind, text, fontSize, tone = 'default', glyph },
  ref
) {
  const name = kind === 'character-name' || kind === 'world-marker'

  /*
   * Names get the cream plate: they are the identity, and a light plate on a
   * busy room is the most legible thing available. Everything else gets the
   * dark plate, so a character never carries two bright boxes.
   */
  const surface = name
    ? tone === 'selected'
      ? 'bg-brand text-ink'
      : 'bg-paper text-ink'
    : 'bg-ink'

  const label =
    name
      ? ''
      : tone === 'active'
        ? 'text-brand'
        : tone === 'selected'
          ? 'text-brand-lite'
          : 'text-dim'

  return (
    <div
      ref={ref}
      className={[
        'pointer-events-none absolute left-0 top-0 z-20 flex items-center',
        'border border-ink font-pixel font-semibold uppercase whitespace-nowrap',
        surface,
        label
      ].join(' ')}
      style={{
        fontSize,
        // Whole-pixel line box, so the plate height never lands on a half pixel.
        lineHeight: 1,
        /*
         * Tight, but not compressed. Pixel type turns into noise below about
         * 0.05em, and the plate has to stay narrower than the character it
         * belongs to — so the padding comes off before the tracking does.
         */
        letterSpacing: '0.06em',
        padding: '0.1em 0.25em',
        gap: '0.2em',
        /*
         * Positioned using left/top rather than transform.
         * Transforms promote the label to its own compositor layer, and a promoted
         * layer is presented on the compositor's schedule while the canvas
         * beside it is painted on the main thread's. The two then disagree by
         * a frame whenever the camera moves quickly, which is exactly the
         * "the name tag slides off the character while I drag" symptom — the
         * label was never mispositioned, it was arriving late.
         *
         * The engine fires a synchronous frame callback after painting the canvas,
         * ensuring these DOM updates hit the same layout pass as the canvas frame.
         */
      }}
    >
      {glyph && (
        <span aria-hidden className={tone === 'active' ? 'text-brand' : undefined}>
          {glyph}
        </span>
      )}
      {text}
    </div>
  )
})
