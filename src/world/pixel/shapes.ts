import type { Op } from './ops'

/** Filled disc via scanlines. Keeps circles on the pixel grid. */
export function disc(cx: number, cy: number, r: number, c: string): Op[] {
  const ops: Op[] = []
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)))
    if (w <= 0 && r > 1) continue
    ops.push([cx - w, cy + y, w * 2 + 1, 1, c])
  }
  return ops
}

/** A 1px outlined box: outline colour behind, fill inset by one pixel. */
export function box(
  x: number,
  y: number,
  w: number,
  h: number,
  outline: string,
  fill?: string
): Op[] {
  const ops: Op[] = [[x, y, w, h, outline]]
  if (fill) ops.push([x + 1, y + 1, w - 2, h - 2, fill])
  return ops
}

/* ------------------------------------------------------------- bitmap font */

/**
 * A 3x5 pixel font, used for in-world signage and the text on agent monitors.
 * Deliberately tiny: at world scale these read as convincing detail rather
 * than as something the user is expected to sit and read.
 */
const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  V: ['#.#', '#.#', '#.#', '.#.', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['.#.', '#.#', '#.#', '#.#', '.#.'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  '.': ['...', '...', '...', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  ' ': ['...', '...', '...', '...', '...']
}

export const GLYPH_W = 3
export const GLYPH_H = 5

/** Width in pixels that `text` will occupy. */
export function textWidth(s: string, tracking = 1): number {
  if (s.length === 0) return 0
  return s.length * (GLYPH_W + tracking) - tracking
}

/** Render a string as ops. Unknown characters are skipped. */
export function text(
  s: string,
  x: number,
  y: number,
  colour: string,
  tracking = 1
): Op[] {
  const ops: Op[] = []
  let cx = x
  for (const ch of s.toUpperCase()) {
    const g = GLYPHS[ch]
    if (g) {
      for (let row = 0; row < GLYPH_H; row++) {
        const line = g[row]
        for (let col = 0; col < GLYPH_W; col++) {
          if (line[col] === '#') ops.push([cx + col, y + row, 1, 1, colour])
        }
      }
    }
    cx += GLYPH_W + tracking
  }
  return ops
}
