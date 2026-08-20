/**
 * Everything in the world is drawn from `Op`s: axis-aligned rectangles on an
 * integer pixel grid. Keeping art as data (rather than image files) means the
 * whole cast can be recoloured per theme, and there is never a resampling
 * step that could soften the pixels.
 *
 *   [x, y, width, height, colour]
 *
 * `colour` is either a literal CSS colour or a key looked up in a palette,
 * which is how one sprite skeleton produces four distinct characters.
 */
export type Op = [number, number, number, number, string]

export type Palette = Record<string, string>

/** Draw ops onto a context already scaled to 1 unit = 1 pixel. */
export function paint(
  ctx: CanvasRenderingContext2D,
  ops: readonly Op[],
  palette?: Palette,
  dx = 0,
  dy = 0
): void {
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const raw = op[4]
    const colour = palette && raw in palette ? palette[raw] : raw
    // A palette may deliberately resolve a slot to nothing (e.g. no tie).
    if (!colour || colour === 'none') continue
    ctx.fillStyle = colour
    ctx.fillRect(op[0] + dx, op[1] + dy, op[2], op[3])
  }
}

/** Offset a group of ops. Used to pose limbs without re-authoring them. */
export function shift(ops: readonly Op[], dx: number, dy: number): Op[] {
  return ops.map(([x, y, w, h, c]) => [x + dx, y + dy, w, h, c] as Op)
}

/**
 * Create an offscreen canvas of logical pixel size and return its context,
 * with smoothing disabled so nothing is ever interpolated.
 */
export function createPixelCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

/** Render ops to a standalone canvas, ready to be blitted. */
export function rasterise(
  w: number,
  h: number,
  ops: readonly Op[],
  palette?: Palette
): HTMLCanvasElement {
  const { canvas, ctx } = createPixelCanvas(w, h)
  paint(ctx, ops, palette)
  return canvas
}

/** Deterministic PRNG so the office behaves the same way each run if seeded. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
