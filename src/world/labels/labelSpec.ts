/**
 * How large world labels are.
 *
 * The world is pixel art scaled by a whole number, which is right for the art
 * and wrong for text: at the scale where the office reads well, a five-pixel
 * glyph rasterised into the scene buffer is noise. So labels are DOM over the
 * canvas, and their size is decoupled from the room's.
 *
 * It used to be *coupled* — size scaled with the camera zoom and was clamped at
 * both ends. There is no camera any more, and the room is built to fit rather
 * than zoomed, so there is nothing left for a label to scale against. These are
 * plain sizes in CSS pixels, and this is the single place that decides them.
 *
 * They are deliberately small. A label is an identification tag on somebody
 * working in a room, not a caption for the room — at larger sizes a name plate
 * was wider than the character wearing it and the status beneath it was the
 * brightest thing on the floor, so six agents produced a wall of text with an
 * office faintly visible behind it.
 */

export type WorldLabelKind =
  | 'character-name'
  | 'character-status'
  | 'world-marker'
  | 'interaction'

/** Font size in CSS pixels. Whole numbers: Pixelify Sans is drawn on a grid. */
export const LABEL_SIZE: Record<WorldLabelKind, number> = {
  'character-name': 10,
  'character-status': 9,
  'world-marker': 13,
  interaction: 12
}

export function labelFontSize(kind: WorldLabelKind): number {
  return LABEL_SIZE[kind]
}
