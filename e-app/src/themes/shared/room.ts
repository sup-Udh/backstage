import type { Op } from '../../world/pixel/ops'
import { makeRng } from '../../world/pixel/ops'
import type { SceneDef } from '../types'
import { DESK_BASE, SEAT_DX, SEAT_DY } from './props'

/**
 * The shell every world is built inside: wall, skirting and floor.
 *
 * Themes describe their room rather than drawing it, so a new world is a
 * configuration object plus a handful of signature props - never a new code
 * path in the renderer.
 */

export type FloorStyle = 'planks' | 'tiles' | 'carpet' | 'concrete'
export type WallStyle = 'plain' | 'panelled' | 'brick' | 'stripe'

export interface BackdropSpec {
  width: number
  height: number
  /** Where the wall meets the floor. */
  horizon: number
  floorStyle: FloorStyle
  wallStyle: WallStyle
  /** Pools of light thrown onto the floor, as [x, width] pairs. */
  lightPools?: [number, number][]
}

function wallSurface(spec: BackdropSpec): Op[] {
  const { width: w, horizon: h, wallStyle } = spec
  const ops: Op[] = [
    [0, 0, w, h, 'wall'],
    [0, 0, w, 18, 'wallLite'],
    [0, h - 14, w, 14, 'wallShade']
  ]

  if (wallStyle === 'panelled') {
    // Wainscoting: a rail with recessed panels beneath it.
    const railY = h - 26
    ops.push([0, railY, w, 2, 'ink'])
    ops.push([0, railY + 2, w, h - railY - 5, 'woodDark'])
    for (let x = 4; x < w - 8; x += 26) {
      ops.push([x, railY + 5, 18, h - railY - 11, 'wood'])
      ops.push([x, railY + 5, 18, 1, 'woodLite'])
    }
  } else if (wallStyle === 'brick') {
    for (let y = 2, row = 0; y < h - 6; y += 7, row++) {
      ops.push([0, y, w, 1, 'wallShade'])
      for (let x = (row % 2) * 13; x < w; x += 26) {
        ops.push([x, y, 1, 6, 'wallShade'])
      }
    }
  } else if (wallStyle === 'stripe') {
    for (let x = 0; x < w; x += 12) {
      ops.push([x, 0, 4, h - 6, 'wallShade'])
    }
  }
  return ops
}

function floorSurface(spec: BackdropSpec): Op[] {
  const { width: w, height: hh, horizon: h, floorStyle } = spec
  const ops: Op[] = [[0, h, w, hh - h, 'floor']]

  if (floorStyle === 'planks') {
    for (let y = h + 7; y < hh; y += 9) ops.push([0, y, w, 1, 'floorLine'])
    for (let y = h, row = 0; y < hh; y += 9, row++) {
      for (let x = (row % 2) * 26; x < w; x += 52) {
        ops.push([x, y, 1, 8, 'floorAlt'])
      }
    }
  } else if (floorStyle === 'tiles') {
    // Checker, which reads instantly as a workplace or a diner.
    const t = 13
    for (let y = h, r = 0; y < hh; y += t, r++) {
      for (let x = 0, c = 0; x < w; x += t, c++) {
        if ((r + c) % 2 === 0) ops.push([x, y, t, t, 'floorAlt'])
      }
    }
    for (let y = h; y < hh; y += t) ops.push([0, y, w, 1, 'floorLine'])
  } else if (floorStyle === 'carpet') {
    const rng = makeRng(4242)
    for (let i = 0; i < 900; i++) {
      ops.push([
        Math.floor(rng() * w),
        h + Math.floor(rng() * (hh - h)),
        1,
        1,
        rng() > 0.5 ? 'floorAlt' : 'floorLine'
      ])
    }
  } else {
    // Concrete: broad slabs with expansion joints.
    for (let y = h + 12; y < hh; y += 24) ops.push([0, y, w, 1, 'floorLine'])
    for (let x = 40; x < w; x += 80) ops.push([x, h, 1, hh - h, 'floorLine'])
  }

  // Light falling from windows: shallow steps in a tint just above the floor.
  for (const [px, pw] of spec.lightPools ?? []) {
    for (let s = 0; s < 8; s++) {
      ops.push([px - s, h + 1 + s * 3, pw + s * 2, 3, 'floorLit'])
    }
  }
  return ops
}

/** Wall + skirting + floor, ready to sit behind a world's furniture. */
export function backdrop(spec: BackdropSpec): Op[] {
  const { width: w, horizon: h } = spec
  return [
    ...wallSurface(spec),
    // Skirting where the wall meets the floor.
    [0, h - 5, w, 5, 'ink'],
    [0, h - 4, w, 3, 'cream2'],
    [0, h - 1, w, 1, 'ink'],
    ...floorSurface(spec)
  ]
}

/* -------------------------------------------------------------- layout -- */

/** The parts of a SceneDef that describe where agents can be, not what is drawn. */
export type SceneLayout = Pick<
  SceneDef,
  | 'desks'
  | 'boardSpots'
  | 'talkSpots'
  | 'coffeeSpots'
  | 'wanderSpots'
  | 'laneY'
  | 'deskBaseY'
>

export interface LayoutSpec {
  /** Left edge x of each work surface. One seat per station. */
  stations: number[]
  /** Top of the work surface. */
  stationY?: number
  /** Two positions where an agent stands and studies something. */
  focus?: [number, number]
  focusY?: number
  /** Centre x of the break area on the right. */
  breakX?: number
}

/**
 * The behavioural skeleton every world shares: a row of work surfaces along
 * the back, a clear walking corridor, a couple of places to stand and think,
 * pairs of facing spots for conversations, and somewhere to loiter.
 *
 * Worlds differ in what is *drawn* at these positions - a desk, a lab bench,
 * a kitchen counter - not in how agents move between them. That is what keeps
 * the director and the renderer free of per-theme branching.
 */
export function standardLayout(spec: LayoutSpec): SceneLayout {
  const stationY = spec.stationY ?? 80
  const focusY = spec.focusY ?? 86
  const [fx1, fx2] = spec.focus ?? [126, 154]
  const bx = spec.breakX ?? 268

  return {
    desks: spec.stations.map((x) => ({
      x: x + SEAT_DX,
      y: stationY + SEAT_DY,
      facing: 'down' as const
    })),
    deskBaseY: stationY + DESK_BASE,

    boardSpots: [
      { x: fx1, y: focusY, facing: 'up' },
      { x: fx2, y: focusY, facing: 'up' }
    ],

    talkSpots: [
      [
        { x: 140, y: 118, facing: 'right' },
        { x: 156, y: 118, facing: 'left' }
      ],
      [
        { x: 72, y: 150, facing: 'right' },
        { x: 88, y: 150, facing: 'left' }
      ],
      [
        { x: 206, y: 146, facing: 'right' },
        { x: 222, y: 146, facing: 'left' }
      ]
    ],

    coffeeSpots: [
      { x: bx - 6, y: 106, facing: 'up' },
      { x: bx + 20, y: 106, facing: 'up' }
    ],

    // Enough loitering room for a full roster; the director falls back here
    // whenever the desks and the board are taken.
    wanderSpots: [
      { x: 100, y: 118, facing: 'down' },
      { x: 186, y: 116, facing: 'down' },
      { x: 52, y: 124, facing: 'right' },
      { x: 236, y: 120, facing: 'left' },
      { x: 170, y: 148, facing: 'up' },
      { x: 110, y: 146, facing: 'right' },
      { x: 128, y: 100, facing: 'down' },
      { x: 28, y: 148, facing: 'right' },
      { x: 262, y: 150, facing: 'left' },
      { x: 200, y: 132, facing: 'down' },
      { x: 76, y: 112, facing: 'down' },
      { x: 296, y: 136, facing: 'left' }
    ],

    laneY: 118
  }
}
