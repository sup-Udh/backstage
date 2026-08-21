import type { Op } from '../../world/pixel/ops'
import { makeRng } from '../../world/pixel/ops'
import type { SceneDef } from '../types'

/**
 * The shell every world is built inside: wall, skirting and floor.
 *
 * Themes describe their room rather than drawing it, so a new world is a
 * configuration object plus a handful of signature props - never a new code
 * path in the renderer.
 *
 * Where things *go* inside that shell is `office.ts`'s job, not this file's.
 * This one only knows how to make a surface.
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
    /*
     * Boards, not brickwork.
     *
     * A butt-joint every 52 pixels on a strict half-offset grid is exactly
     * what masonry looks like, and at this room's size that is precisely how
     * it read — a tiled wall lying on the ground. Real boards run long and
     * their joints fall where they fall, so the runs are irregular and much
     * longer than they are tall, and alternate rows carry a faint tone shift
     * so the eye follows the timber rather than the grid.
     */
    const rng = makeRng(8171)
    for (let y = h, row = 0; y < hh; y += 9, row++) {
      if (row % 2 === 1) ops.push([0, y, w, 8, 'floorAlt'])
      // Joints, spaced 90-170px apart and never aligned with the row above.
      let x = Math.floor(rng() * 120)
      while (x < w) {
        ops.push([x, y, 1, 8, 'floorLine'])
        x += 90 + Math.floor(rng() * 80)
      }
      ops.push([0, y + 8, w, 1, 'floorLine'])
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
    /*
     * Speck count follows the floor's area rather than being a fixed number.
     * It was tuned for a room a third this size, and reusing it here would
     * have left the enlarged floor looking washed out — the same texture has
     * to read at the same density however big the room gets.
     */
    const specks = Math.round((w * (hh - h)) / 90)
    for (let i = 0; i < specks; i++) {
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

  /*
   * A band of shadow where the floor meets the wall.
   *
   * Several worlds use a floor only a shade darker than their wall — the warm
   * cream identity leaves little room between them — and across a room this
   * wide the junction simply disappeared, so the office read as one flat
   * surface with furniture stuck to it. Grounding the first few rows gives
   * the horizon back without touching either palette.
   */
  for (let s = 0; s < 5; s++) {
    ops.push([0, h + s, w, 1, s < 2 ? 'floorShadow' : 'floorLine'])
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
  | 'workstations'
  | 'boardSpots'
  | 'talkSpots'
  | 'coffeeSpots'
  | 'wanderSpots'
  | 'laneY'
  | 'deskBaseY'
>
