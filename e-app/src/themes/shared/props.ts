import type { Op } from '../../world/pixel/ops'
import { makeRng } from '../../world/pixel/ops'
import { disc, text, textWidth } from '../../world/pixel/shapes'

/**
 * The shared furniture library.
 *
 * Every function returns ops in palette-key form, so the same object can be
 * recoloured per world by supplying a different ThemePalette - a desk is a
 * desk whether it lives in a detective office or a Scranton branch. Themes
 * compose these into a SceneDef; the renderer never learns which theme it is
 * drawing.
 *
 * Coordinates are absolute scene pixels. Layout belongs to the theme.
 */

/* ------------------------------------------------------------ wall units -- */

/**
 * Late-afternoon light. The windows are the reason the whole room is warm,
 * which is what lets the brand yellow appear as light rather than as paint.
 */
export function windowUnit(x: number, y: number, w: number, h: number): Op[] {
  const half = h >> 1
  return [
    [x - 2, y - 2, w + 4, h + 4, 'ink'],
    [x, y, w, half, 'brandPale'],
    [x, y + half, w, h - half, 'brandLite'],
    // Glazing bars.
    [x + (w >> 1), y, 1, h, 'ink'],
    [x, y + half, w, 1, 'ink'],
    // A single specular streak so the glass reads as glass.
    [x + 2, y + 2, 1, half - 4, 'white'],
    [x + (w >> 1) + 3, y + 2, 1, half - 4, 'white'],
    // Sill.
    [x - 4, y + h + 2, w + 8, 3, 'ink'],
    [x - 4, y + h + 2, w + 8, 1, 'woodLite'],
    [x - 3, y + h + 5, w + 6, 1, 'floorShadow']
  ]
}

const BOOK_COLOURS = [
  'ink2',
  'rust',
  'sage',
  'brandDeep',
  'steelDark',
  'woodDark',
  'brand',
  'sageDark'
]

export function books(x: number, y: number, w: number, seed: number): Op[] {
  const rng = makeRng(seed)
  const ops: Op[] = []
  let cx = x
  while (cx < x + w - 2) {
    const bw = 2 + Math.floor(rng() * 3)
    if (cx + bw > x + w) break
    const bh = 7 + Math.floor(rng() * 3)
    const c = BOOK_COLOURS[Math.floor(rng() * BOOK_COLOURS.length)]
    ops.push([cx, y + (10 - bh), bw, bh, 'ink'])
    ops.push([cx, y + (10 - bh) + 1, bw - 1, bh - 2, c])
    cx += bw + 1
  }
  return ops
}

export function shelfUnit(x: number, y: number, w: number): Op[] {
  const ops: Op[] = [
    [x, y, 1, 32, 'ink'],
    [x + w - 1, y, 1, 32, 'ink'],
    [x, y, w, 2, 'ink']
  ]
  ops.push(...books(x + 2, y + 2, w - 4, 11))
  ops.push([x, y + 13, w, 2, 'wood'], [x, y + 15, w, 1, 'ink'])
  ops.push(...books(x + 2, y + 16, w - 4, 23))
  ops.push([x, y + 27, w, 2, 'wood'], [x, y + 29, w, 1, 'ink'])
  // A stack of case files lying flat on the lower shelf.
  ops.push([x + w - 13, y + 24, 10, 3, 'ink'])
  ops.push([x + w - 12, y + 25, 8, 1, 'paper'])
  return ops
}

export function whiteboard(x: number, y: number, w: number, h: number): Op[] {
  const ops: Op[] = [
    [x - 2, y - 2, w + 4, h + 4, 'ink'],
    [x - 1, y - 1, w + 2, h + 2, 'steel'],
    [x, y, w, h, 'white']
  ]
  // A small flow diagram: three linked boxes.
  const by = y + 4
  for (let i = 0; i < 3; i++) {
    const bx = x + 4 + i * 12
    ops.push([bx, by, 9, 7, 'ink3'])
    ops.push([bx + 1, by + 1, 7, 5, 'white'])
    if (i < 2) ops.push([bx + 9, by + 3, 3, 1, 'ink3'])
  }
  // Notes underneath.
  ops.push([x + 4, y + 15, w - 14, 1, 'ink3'])
  ops.push([x + 4, y + 18, w - 20, 1, 'ink3'])
  ops.push([x + 4, y + 21, w - 12, 1, 'brandDeep'])
  ops.push([x + 4, y + 24, w - 26, 1, 'ink3'])
  // Marker tray with one brand-coloured marker.
  ops.push([x - 2, y + h + 2, w + 4, 2, 'ink'])
  ops.push([x + 4, y + h + 1, 7, 1, 'brand'])
  return ops
}

/** Clock face only. The hands are animated by the renderer. */
export function clockFace(cx: number, cy: number, r: number): Op[] {
  const ops: Op[] = [
    ...disc(cx, cy, r, 'ink'),
    ...disc(cx, cy, r - 1, 'cream'),
    ...disc(cx, cy, r - 2, 'white')
  ]
  ops.push([cx, cy - r + 2, 1, 2, 'ink'])
  ops.push([cx, cy + r - 3, 1, 2, 'ink'])
  ops.push([cx - r + 2, cy, 2, 1, 'ink'])
  ops.push([cx + r - 3, cy, 2, 1, 'ink'])
  return ops
}

/** The office signage: BACKSTAGE, in brand yellow, on the wall. */
export function wallSign(cx: number, y: number): Op[] {
  const label = 'BACKSTAGE'
  const w = textWidth(label)
  const x = cx - (w >> 1)
  return [
    [x - 4, y - 4, w + 8, 13, 'ink'],
    [x - 3, y - 3, w + 6, 11, 'brand'],
    [x - 3, y - 3, w + 6, 1, 'brandLite'],
    [x - 3, y + 7, w + 6, 1, 'brandShadow'],
    ...text(label, x, y, 'ink'),
    // Mounting screws.
    [x - 2, y - 2, 1, 1, 'brandShadow'],
    [x + w + 1, y + 6, 1, 1, 'brandShadow']
  ]
}

/* ----------------------------------------------------------- floor units -- */

export const DESK_W = 52
/** Distance from the desk surface down to the sort baseline. */
export const DESK_BASE = 22
/** Where the occupant sits, relative to the desk's left edge and surface. */
export const SEAT_DX = 30
export const SEAT_DY = 5

export interface DeskParts {
  ops: Op[]
  baseY: number
  monitor: { x: number; y: number }
  led: { x: number; y: number }
}

/**
 * A desk with monitor, lamp and clutter. `y` is the desk surface top.
 *
 * The monitor is deliberately parked at the left end rather than centred:
 * the occupant sits at SEAT_DX and the desk sorts in front of them, so a
 * centred monitor would cover the character's face. Clutter sits on the
 * surface itself, below the character's visible waistline, for the same
 * reason.
 */
export function deskUnit(x: number, y: number, seed: number): DeskParts {
  const ops: Op[] = []

  // Monitor, left end.
  ops.push([x + 10, y - 3, 3, 3, 'ink'])
  ops.push([x + 7, y - 1, 9, 2, 'ink'])
  ops.push([x + 2, y - 18, 19, 16, 'ink'])
  ops.push([x + 3, y - 17, 17, 13, 'screen'])
  ops.push([x + 3, y - 17, 17, 1, 'screenLite'])
  const led = { x: x + 17, y: y - 4 }
  const monitor = { x: x + 3, y: y - 17 }

  // Desk lamp, right end: the yellow light source at floor level.
  ops.push([x + 42, y - 3, 6, 3, 'ink'])
  ops.push([x + 44, y - 13, 2, 10, 'ink'])
  ops.push([x + 41, y - 18, 9, 5, 'ink'])
  ops.push([x + 42, y - 17, 7, 3, 'brand'])
  ops.push([x + 43, y - 14, 5, 1, 'brandLite'])

  // Desk body.
  ops.push([x - 1, y - 1, DESK_W + 2, 17, 'ink'])
  ops.push([x, y, DESK_W, 6, 'woodLite'])
  ops.push([x, y, DESK_W, 1, 'brandPale'])
  ops.push([x, y + 6, DESK_W, 9, 'wood'])
  ops.push([x, y + 12, DESK_W, 3, 'woodDark'])
  // Drawer with a brass pull.
  ops.push([x + 3, y + 8, 15, 5, 'woodDark'])
  ops.push([x + 8, y + 10, 5, 1, 'brand'])
  // Legs and contact shadow.
  ops.push([x + 1, y + 16, 3, 5, 'ink'])
  ops.push([x + DESK_W - 4, y + 16, 3, 5, 'ink'])
  ops.push([x - 2, y + 21, DESK_W + 4, 2, 'floorShadow'])
  // Pool of lamplight on the surface, not a rectangle on the wall.
  ops.push([x + 37, y + 1, 13, 2, 'brandPale'])

  // Clutter, varied per desk so they do not read as clones.
  const rng = makeRng(seed)
  if (rng() > 0.3) {
    // Coffee mug, sitting on the surface.
    ops.push([x + 24, y, 6, 5, 'ink'])
    ops.push([x + 25, y + 1, 4, 3, 'white'])
    ops.push([x + 30, y + 1, 1, 2, 'ink'])
  }
  if (rng() > 0.35) {
    // Loose papers.
    ops.push([x + 34, y + 1, 9, 3, 'ink'])
    ops.push([x + 35, y + 2, 7, 1, 'paper'])
  }
  if (rng() > 0.45) {
    // A sticky note on the monitor bezel.
    ops.push([x + 19, y - 16, 5, 5, 'ink'])
    ops.push([x + 19, y - 16, 4, 4, 'brand'])
  }

  return { ops, baseY: y + DESK_BASE, monitor, led }
}

/**
 * The chair back, drawn behind its occupant so it frames them. It also has
 * to stand up on its own at an empty desk, so it carries cushion seams and a
 * base rather than reading as a dark slab.
 */
export function chairBack(x: number, y: number): Op[] {
  return [
    [x - 9, y - 21, 18, 14, 'ink'],
    [x - 8, y - 20, 16, 12, 'ink3'],
    [x - 7, y - 19, 14, 4, 'steelDark'],
    [x - 7, y - 14, 14, 3, 'steelDark'],
    [x - 8, y - 20, 16, 1, 'steel'],
    // Stem and star base.
    [x - 2, y - 8, 4, 6, 'ink'],
    [x - 10, y - 3, 6, 2, 'ink'],
    [x + 4, y - 3, 6, 2, 'ink'],
    [x - 2, y - 2, 4, 2, 'ink']
  ]
}

export function plant(x: number, y: number, seed: number): Op[] {
  const rng = makeRng(seed)
  const ops: Op[] = [[x - 2, y - 1, 16, 3, 'floorShadow']]
  // Pot.
  ops.push([x, y - 10, 12, 10, 'ink'])
  ops.push([x + 1, y - 9, 10, 8, 'rust'])
  ops.push([x + 1, y - 9, 3, 8, 'brandShadow'])
  ops.push([x - 1, y - 13, 14, 4, 'ink'])
  ops.push([x, y - 12, 12, 2, 'rust'])
  ops.push([x, y - 12, 12, 1, 'brandDeep'])
  // Foliage: overlapping discs, lit from the left.
  const cx = x + 6
  ops.push(...disc(cx, y - 20, 6, 'ink'))
  ops.push(...disc(cx, y - 20, 5, 'sageDark'))
  ops.push(...disc(cx - 2, y - 22, 4, 'sage'))
  ops.push(...disc(cx + 3, y - 19, 3, 'sageDark'))
  ops.push(...disc(cx - 1, y - 26, 4, 'ink'))
  ops.push(...disc(cx - 1, y - 26, 3, 'sage'))
  ops.push(...disc(cx - 2, y - 27, 2, 'sageLite'))
  if (rng() > 0.5) ops.push(...disc(cx + 5, y - 24, 2, 'sageLite'))
  return ops
}

export function cabinet(x: number, y: number): Op[] {
  const ops: Op[] = [[x - 1, y - 1, 24, 3, 'floorShadow']]
  ops.push([x, y - 28, 22, 28, 'ink'])
  ops.push([x + 1, y - 27, 20, 26, 'steel'])
  ops.push([x + 1, y - 27, 20, 2, 'white'])
  for (let i = 0; i < 3; i++) {
    const dy = y - 25 + i * 8
    ops.push([x + 2, dy, 18, 7, 'steelDark'])
    ops.push([x + 3, dy + 1, 16, 5, 'steel'])
    ops.push([x + 8, dy + 3, 6, 1, 'brand'])
  }
  // Files and a mug stacked on top.
  ops.push([x + 3, y - 33, 9, 5, 'ink'])
  ops.push([x + 4, y - 32, 7, 3, 'paper'])
  ops.push([x + 4, y - 32, 7, 1, 'rust'])
  ops.push([x + 14, y - 32, 5, 4, 'ink'])
  ops.push([x + 15, y - 31, 3, 2, 'brand'])
  return ops
}

export interface CoffeeParts {
  ops: Op[]
  steam: { x: number; y: number }
}

export function coffeeStation(x: number, y: number): CoffeeParts {
  const ops: Op[] = [[x - 1, y - 1, 52, 3, 'floorShadow']]
  // Machine on the counter.
  ops.push([x + 6, y - 36, 16, 18, 'ink'])
  ops.push([x + 7, y - 35, 14, 16, 'ink2'])
  ops.push([x + 8, y - 34, 12, 5, 'screen'])
  ops.push([x + 9, y - 33, 3, 1, 'brand'])
  ops.push([x + 9, y - 31, 6, 1, 'brandDeep'])
  ops.push([x + 17, y - 27, 3, 3, 'brand'])
  ops.push([x + 12, y - 24, 3, 4, 'ink'])
  // The pot, catching the light.
  ops.push([x + 10, y - 21, 8, 4, 'ink'])
  ops.push([x + 11, y - 20, 6, 2, 'woodDark'])
  // Counter.
  ops.push([x - 1, y - 19, 52, 20, 'ink'])
  ops.push([x, y - 18, 50, 5, 'woodLite'])
  ops.push([x, y - 18, 50, 1, 'brandPale'])
  ops.push([x, y - 13, 50, 12, 'wood'])
  ops.push([x, y - 7, 50, 6, 'woodDark'])
  ops.push([x + 24, y - 13, 1, 12, 'ink'])
  ops.push([x + 12, y - 9, 5, 1, 'brand'])
  ops.push([x + 32, y - 9, 5, 1, 'brand'])
  // Mugs waiting on the counter.
  for (let i = 0; i < 3; i++) {
    const mx = x + 28 + i * 7
    ops.push([mx, y - 23, 6, 5, 'ink'])
    ops.push([mx + 1, y - 22, 4, 3, 'white'])
  }
  return { ops, steam: { x: x + 13, y: y - 25 } }
}

export function meetingTable(x: number, y: number): Op[] {
  const ops: Op[] = [[x - 2, y - 1, 60, 3, 'floorShadow']]
  ops.push([x - 1, y - 15, 58, 16, 'ink'])
  ops.push([x, y - 14, 56, 6, 'woodLite'])
  ops.push([x, y - 14, 56, 1, 'brandPale'])
  ops.push([x, y - 8, 56, 7, 'wood'])
  ops.push([x, y - 4, 56, 3, 'woodDark'])
  ops.push([x + 3, y + 1, 3, 4, 'ink'])
  ops.push([x + 50, y + 1, 3, 4, 'ink'])
  // Scattered case material.
  ops.push([x + 6, y - 17, 12, 3, 'ink'])
  ops.push([x + 7, y - 16, 10, 1, 'paper'])
  ops.push([x + 22, y - 18, 9, 4, 'ink'])
  ops.push([x + 23, y - 17, 7, 2, 'brand'])
  ops.push([x + 36, y - 17, 11, 3, 'ink'])
  ops.push([x + 37, y - 16, 9, 1, 'paper'])
  ops.push([x + 44, y - 20, 6, 5, 'ink'])
  ops.push([x + 45, y - 19, 4, 3, 'white'])
  return ops
}

export function boxStack(x: number, y: number): Op[] {
  const ops: Op[] = [[x - 1, y - 1, 22, 3, 'floorShadow']]
  ops.push([x, y - 11, 20, 11, 'ink'])
  ops.push([x + 1, y - 10, 18, 9, 'wood'])
  ops.push([x + 1, y - 10, 18, 1, 'woodLite'])
  ops.push([x + 4, y - 7, 12, 3, 'paper'])
  ops.push([x + 5, y - 6, 10, 1, 'ink3'])
  ops.push([x + 2, y - 20, 16, 9, 'ink'])
  ops.push([x + 3, y - 19, 14, 7, 'woodLite'])
  ops.push([x + 6, y - 17, 9, 3, 'paper'])
  ops.push([x + 7, y - 16, 7, 1, 'rust'])
  return ops
}

/** A flat rug. Part of the ground layer, never sorted. */
export function rug(x: number, y: number, w: number, h: number): Op[] {
  return [
    [x, y, w, h, 'cream2'],
    [x, y, w, 1, 'brandDeep'],
    [x, y + h - 1, w, 1, 'brandDeep'],
    [x, y, 1, h, 'brandDeep'],
    [x + w - 1, y, 1, h, 'brandDeep'],
    [x + 3, y + 3, w - 6, h - 6, 'cream'],
    [x + 3, y + 3, w - 6, 1, 'brandLite'],
    [x + 3, y + h - 4, w - 6, 1, 'brandLite'],
    [x + (w >> 1) - 6, y + (h >> 1) - 3, 12, 6, 'brandPale']
  ]
}
