/**
 * How large world labels are allowed to be.
 *
 * The world is pixel art and scales by whole-number camera zoom, which is
 * right for the art and wrong for text: at the zoom where the office reads
 * well, a five-pixel-tall glyph rasterised into the scene buffer is noise.
 *
 * So label size is decoupled from world size. The camera still influences it —
 * a label should feel attached to the room, not pinned to the screen — but it
 * is clamped at both ends. Zooming out can never make a name unreadable, and
 * zooming in can never turn one into a banner.
 *
 *     size = clamp(base * zoom / reference, min, max)
 *
 * This is the single place that policy lives. Every pixel-world surface reads
 * from it, so the workspace, the landing office and any future scene cannot
 * drift apart.
 */

export type WorldLabelKind =
  | 'character-name'
  | 'character-status'
  | 'world-marker'
  | 'interaction'

interface LabelSpec {
  /** Font size in CSS pixels at the reference zoom. */
  base: number
  min: number
  max: number
}

/**
 * The zoom the base sizes are tuned against — the workspace's default camera.
 * At this zoom a label is exactly its base size; elsewhere it is scaled from
 * here and then clamped.
 */
const REFERENCE_ZOOM = 3

/**
 * Names are the thing the user is scanning for, so they carry the largest
 * floor. Status is secondary and sits a step below it. Nothing is allowed
 * under 11px, which is roughly where Pixelify Sans stops being able to hold a
 * legible stroke.
 */
export const LABEL_SPEC: Record<WorldLabelKind, LabelSpec> = {
  'character-name': { base: 14, min: 13, max: 20 },
  'character-status': { base: 12, min: 11, max: 16 },
  'world-marker': { base: 13, min: 11, max: 18 },
  interaction: { base: 13, min: 12, max: 18 }
}

/**
 * The rendered font size for a label at a given camera zoom.
 *
 * Whole pixels only. Pixelify Sans is drawn on a grid, and a fractional size
 * makes the browser resample it — which is the blurring this whole system
 * exists to remove.
 */
export function labelFontSize(kind: WorldLabelKind, zoom: number): number {
  const spec = LABEL_SPEC[kind]
  const scaled = (spec.base * zoom) / REFERENCE_ZOOM
  return Math.round(Math.min(spec.max, Math.max(spec.min, scaled)))
}
