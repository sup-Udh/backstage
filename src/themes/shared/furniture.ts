import type { Op } from '../../world/pixel/ops'
import { makeRng } from '../../world/pixel/ops'
import { books } from './props'

/**
 * Furniture for the non-office worlds.
 *
 * Same contract as `props.ts`: ops in palette-key form, absolute scene
 * coordinates, no knowledge of which theme is drawing them. A couch rendered
 * with the Friends palette and the same couch rendered with the Sherlock
 * palette are the same function.
 */

/* ------------------------------------------------------- living spaces -- */

/** A three-seat couch in the theme's accent colour. */
export function couch(x: number, y: number, w: number): Op[] {
  const ops: Op[] = [[x - 3, y - 1, w + 6, 3, 'floorShadow']]
  ops.push([x, y - 24, w, 14, 'ink'])
  ops.push([x + 1, y - 23, w - 2, 12, 'accent'])
  ops.push([x + 1, y - 23, w - 2, 2, 'accentLite'])
  // Arms.
  ops.push([x - 4, y - 20, 6, 19, 'ink'])
  ops.push([x + w - 2, y - 20, 6, 19, 'ink'])
  ops.push([x - 3, y - 19, 4, 17, 'accent'])
  ops.push([x + w - 1, y - 19, 4, 17, 'accentDark'])
  // Seat.
  ops.push([x - 1, y - 12, w + 2, 11, 'ink'])
  ops.push([x, y - 11, w, 9, 'accentDark'])
  ops.push([x, y - 11, w, 2, 'accent'])
  const seat = Math.floor(w / 3)
  for (let i = 1; i < 3; i++) {
    ops.push([x + seat * i, y - 23, 1, 12, 'accentDark'])
    ops.push([x + seat * i, y - 11, 1, 9, 'ink'])
  }
  ops.push([x + 2, y - 2, 3, 3, 'ink'])
  ops.push([x + w - 5, y - 2, 3, 3, 'ink'])
  return ops
}

export function armchair(x: number, y: number): Op[] {
  const ops: Op[] = [[x - 2, y - 1, 22, 3, 'floorShadow']]
  ops.push([x, y - 26, 18, 16, 'ink'])
  ops.push([x + 1, y - 25, 16, 14, 'accent'])
  ops.push([x + 1, y - 25, 16, 2, 'accentLite'])
  ops.push([x - 3, y - 20, 5, 19, 'ink'])
  ops.push([x + 16, y - 20, 5, 19, 'ink'])
  ops.push([x - 2, y - 19, 3, 17, 'accentDark'])
  ops.push([x + 17, y - 19, 3, 17, 'accentDark'])
  ops.push([x - 1, y - 12, 20, 11, 'ink'])
  ops.push([x, y - 11, 18, 9, 'accentDark'])
  return ops
}

/** A low table with a couple of mugs and a magazine. */
export function coffeeTable(x: number, y: number): Op[] {
  const ops: Op[] = [[x - 2, y - 1, 34, 3, 'floorShadow']]
  ops.push([x + 4, y - 6, 5, 5, 'ink'])
  ops.push([x + 5, y - 5, 3, 3, 'white'])
  ops.push([x + 20, y - 6, 5, 5, 'ink'])
  ops.push([x + 21, y - 5, 3, 3, 'brand'])
  ops.push([x + 11, y - 4, 9, 3, 'ink'])
  ops.push([x + 12, y - 3, 7, 1, 'paper'])
  ops.push([x - 1, y - 1, 32, 5, 'ink'])
  ops.push([x, y, 30, 3, 'woodLite'])
  ops.push([x + 2, y + 4, 3, 4, 'ink'])
  ops.push([x + 25, y + 4, 3, 4, 'ink'])
  return ops
}

/** Kitchen or break-room counter with a sink and cupboards. */
export function kitchenCounter(x: number, y: number, w: number): Op[] {
  const ops: Op[] = [[x - 1, y - 1, w + 2, 3, 'floorShadow']]
  ops.push([x - 1, y - 21, w + 2, 22, 'ink'])
  ops.push([x, y - 20, w, 5, 'steel'])
  ops.push([x, y - 20, w, 1, 'white'])
  ops.push([x, y - 15, w, 15, 'wood'])
  ops.push([x, y - 8, w, 8, 'woodDark'])
  for (let i = 0; i < Math.floor(w / 16); i++) {
    ops.push([x + 3 + i * 16, y - 13, 12, 11, 'woodDark'])
    ops.push([x + 7 + i * 16, y - 10, 5, 1, 'brand'])
  }
  ops.push([x + w - 20, y - 19, 15, 3, 'ink'])
  ops.push([x + w - 19, y - 18, 13, 1, 'steelDark'])
  ops.push([x + w - 13, y - 24, 1, 5, 'steelDark'])
  ops.push([x + w - 13, y - 24, 5, 1, 'steelDark'])
  return ops
}

/* ----------------------------------------------------------- workplace -- */

/** A fabric cubicle divider, standing behind a desk. */
export function cubicle(x: number, y: number, w: number): Op[] {
  const ops: Op[] = []
  ops.push([x, y - 26, w, 26, 'ink'])
  ops.push([x + 1, y - 25, w - 2, 24, 'accent'])
  ops.push([x + 1, y - 25, w - 2, 2, 'accentLite'])
  ops.push([x + 1, y - 3, w - 2, 2, 'accentDark'])
  ops.push([x + 5, y - 21, 8, 7, 'ink'])
  ops.push([x + 6, y - 20, 6, 5, 'paper'])
  ops.push([x + 17, y - 22, 7, 6, 'ink'])
  ops.push([x + 18, y - 21, 5, 4, 'brand'])
  return ops
}

export function printer(x: number, y: number): Op[] {
  const ops: Op[] = [[x - 1, y - 1, 24, 3, 'floorShadow']]
  ops.push([x, y - 18, 22, 18, 'ink'])
  ops.push([x + 1, y - 17, 20, 16, 'steel'])
  ops.push([x + 1, y - 17, 20, 2, 'white'])
  ops.push([x + 3, y - 13, 16, 4, 'steelDark'])
  ops.push([x + 4, y - 12, 5, 1, 'brand'])
  ops.push([x + 3, y - 7, 16, 5, 'ink'])
  ops.push([x + 4, y - 6, 14, 3, 'paper'])
  ops.push([x + 5, y - 22, 12, 4, 'ink'])
  ops.push([x + 6, y - 21, 10, 2, 'paper'])
  return ops
}

export function waterCooler(x: number, y: number): Op[] {
  const ops: Op[] = [[x - 1, y - 1, 14, 3, 'floorShadow']]
  ops.push([x, y - 16, 12, 16, 'ink'])
  ops.push([x + 1, y - 15, 10, 14, 'steel'])
  ops.push([x + 3, y - 10, 6, 3, 'ink'])
  ops.push([x + 4, y - 9, 2, 1, 'brand'])
  ops.push([x + 1, y - 32, 10, 16, 'ink'])
  ops.push([x + 2, y - 31, 8, 14, 'sageLite'])
  ops.push([x + 3, y - 29, 2, 9, 'white'])
  return ops
}

/* --------------------------------------------------------------- study -- */

export function bookcase(x: number, y: number, w: number, h: number): Op[] {
  const ops: Op[] = [[x - 1, y - 1, w + 2, 3, 'floorShadow']]
  ops.push([x - 1, y - h - 1, w + 2, h + 2, 'ink'])
  ops.push([x, y - h, w, h, 'woodDark'])
  const rows = Math.floor(h / 13)
  for (let r = 0; r < rows; r++) {
    const sy = y - h + 2 + r * 13
    ops.push(...books(x + 2, sy, w - 4, 31 + r * 7))
    ops.push([x, sy + 10, w, 2, 'wood'])
  }
  return ops
}

export function fireplace(x: number, y: number, w: number): Op[] {
  const ops: Op[] = []
  ops.push([x - 3, y - 40, w + 6, 6, 'ink'])
  ops.push([x - 2, y - 39, w + 4, 4, 'woodLite'])
  ops.push([x, y - 34, w, 34, 'ink'])
  ops.push([x + 1, y - 33, w - 2, 33, 'ink2'])
  ops.push([x + 4, y - 28, w - 8, 28, 'ink'])
  const fw = w - 14
  ops.push([x + 7, y - 12, fw, 12, 'accentDark'])
  ops.push([x + 8, y - 9, fw - 2, 9, 'accent'])
  ops.push([x + 10, y - 6, fw - 6, 6, 'brand'])
  ops.push([x + 12, y - 3, fw - 10, 3, 'brandLite'])
  ops.push([x + 6, y - 3, fw + 2, 3, 'woodDark'])
  return ops
}

/* ------------------------------------------------------------ eighties -- */

export function arcadeCabinet(x: number, y: number): Op[] {
  const ops: Op[] = [[x - 1, y - 1, 24, 3, 'floorShadow']]
  ops.push([x, y - 44, 22, 44, 'ink'])
  ops.push([x + 1, y - 43, 20, 42, 'accent'])
  ops.push([x + 2, y - 42, 18, 8, 'accentDark'])
  ops.push([x + 4, y - 40, 14, 4, 'brand'])
  ops.push([x + 2, y - 33, 18, 14, 'ink'])
  ops.push([x + 3, y - 32, 16, 12, 'screen'])
  ops.push([x + 5, y - 29, 3, 3, 'brand'])
  ops.push([x + 12, y - 26, 4, 2, 'sageLite'])
  ops.push([x + 8, y - 23, 6, 2, 'accentLite'])
  ops.push([x + 2, y - 18, 18, 6, 'ink2'])
  ops.push([x + 5, y - 16, 2, 3, 'brand'])
  ops.push([x + 12, y - 16, 2, 2, 'accentLite'])
  ops.push([x + 15, y - 16, 2, 2, 'sageLite'])
  return ops
}

/** A drooping run of fairy lights - the signature of an eighties wall. */
export function stringLights(
  x: number,
  y: number,
  w: number,
  seed: number
): Op[] {
  const ops: Op[] = []
  const bulbs = ['brand', 'accent', 'sageLite', 'accentLite', 'brandLite']
  const rng = makeRng(seed)
  const span = 26
  for (let i = 0; i <= w; i++) {
    const sag = Math.round(Math.sin(((i % span) / span) * Math.PI) * 7)
    ops.push([x + i, y + sag, 1, 1, 'ink3'])
    if (i % 7 === 3) {
      const c = bulbs[Math.floor(rng() * bulbs.length)]
      ops.push([x + i, y + sag + 1, 1, 2, 'ink'])
      ops.push([x + i - 1, y + sag + 3, 3, 3, 'ink'])
      ops.push([x + i, y + sag + 3, 1, 2, c])
      ops.push([x + i - 1, y + sag + 4, 3, 1, c])
    }
  }
  return ops
}

/** A boxy CRT and keyboard, sitting on a surface. */
export function crtSet(x: number, y: number): Op[] {
  const ops: Op[] = []
  ops.push([x, y - 20, 22, 18, 'ink'])
  ops.push([x + 1, y - 19, 20, 16, 'cream2'])
  ops.push([x + 2, y - 18, 18, 13, 'ink'])
  ops.push([x + 3, y - 17, 16, 11, 'screen'])
  ops.push([x + 4, y - 15, 8, 1, 'sageLite'])
  ops.push([x + 4, y - 13, 11, 1, 'sageLite'])
  ops.push([x + 4, y - 11, 6, 1, 'brand'])
  ops.push([x + 3, y - 4, 16, 2, 'ink2'])
  ops.push([x + 1, y - 2, 20, 3, 'ink'])
  ops.push([x + 2, y - 1, 18, 1, 'cream2'])
  return ops
}

/* ----------------------------------------------------------------- lab -- */

/**
 * How far the worktop sits above the floor line `labBench` is placed on.
 *
 * Exported because a bench used as a workstation has to be described the other
 * way round — the grid gives a station its surface height, not its footing.
 */
export const LAB_BENCH_TOP = 18

export function labBench(x: number, y: number, w: number): Op[] {
  const ops: Op[] = [[x - 2, y - 1, w + 4, 3, 'floorShadow']]
  ops.push([x - 1, y - 19, w + 2, 20, 'ink'])
  ops.push([x, y - 18, w, 5, 'steel'])
  ops.push([x, y - 18, w, 1, 'white'])
  ops.push([x, y - 13, w, 13, 'steelDark'])
  ops.push([x, y - 6, w, 6, 'ink2'])
  for (let i = 0; i < Math.floor(w / 18); i++) {
    ops.push([x + 4 + i * 18, y - 11, 13, 4, 'ink'])
    ops.push([x + 5 + i * 18, y - 10, 11, 2, 'steel'])
  }
  return ops
}

/** Flasks and beakers - the signature of a chemistry bench. */
export function glassware(x: number, y: number, seed: number): Op[] {
  const rng = makeRng(seed)
  const ops: Op[] = []
  ops.push([x + 3, y - 14, 2, 6, 'ink'])
  ops.push([x + 1, y - 8, 6, 1, 'ink'])
  ops.push([x, y - 7, 8, 7, 'ink'])
  ops.push([x + 1, y - 6, 6, 5, 'white'])
  ops.push([x + 1, y - 4, 6, 3, 'accent'])
  ops.push([x + 10, y - 10, 7, 10, 'ink'])
  ops.push([x + 11, y - 9, 5, 8, 'white'])
  ops.push([x + 11, y - 5, 5, 4, 'sageLite'])
  ops.push([x + 19, y - 5, 10, 5, 'ink'])
  for (let i = 0; i < 3; i++) {
    ops.push([x + 20 + i * 3, y - 11, 2, 7, 'ink'])
    ops.push([x + 20 + i * 3, y - 8, 2, 3, rng() > 0.5 ? 'accent' : 'sageLite'])
  }
  return ops
}

/**
 * The same bench in miniature: one flask and a pair of tubes, 14 wide.
 *
 * A workstation has exactly one band free for something tall — the strip past
 * the occupant's shoulder — and the full set is twice as wide as that. Standing
 * it in the middle of the bench instead put a flask stand through the chest of
 * whoever was working there, and a bench that sorts in front of its own chemist
 * simply looks unmanned.
 */
export function glasswareCompact(x: number, y: number, seed: number): Op[] {
  const rng = makeRng(seed)
  const ops: Op[] = []
  // Flask on a ring stand.
  ops.push([x + 3, y - 14, 2, 6, 'ink'])
  ops.push([x + 1, y - 8, 6, 1, 'ink'])
  ops.push([x, y - 7, 8, 7, 'ink'])
  ops.push([x + 1, y - 6, 6, 5, 'white'])
  ops.push([x + 1, y - 4, 6, 3, 'accent'])
  // Two tubes in a short rack.
  ops.push([x + 8, y - 5, 6, 5, 'ink'])
  for (let i = 0; i < 2; i++) {
    ops.push([x + 9 + i * 3, y - 11, 2, 7, 'ink'])
    ops.push([x + 9 + i * 3, y - 8, 2, 3, rng() > 0.5 ? 'accent' : 'sageLite'])
  }
  return ops
}

export function barrel(x: number, y: number): Op[] {
  const ops: Op[] = [[x - 1, y - 1, 16, 3, 'floorShadow']]
  ops.push([x, y - 24, 14, 24, 'ink'])
  ops.push([x + 1, y - 23, 12, 22, 'steelDark'])
  ops.push([x + 1, y - 23, 12, 2, 'steel'])
  ops.push([x + 1, y - 18, 12, 2, 'ink2'])
  ops.push([x + 1, y - 8, 12, 2, 'ink2'])
  ops.push([x + 3, y - 15, 8, 6, 'ink'])
  ops.push([x + 4, y - 14, 6, 4, 'brand'])
  ops.push([x + 6, y - 13, 2, 2, 'ink'])
  return ops
}

/* --------------------------------------------------------------- walls -- */

/** A framed wall poster. `seed` varies the abstract artwork inside. */
export function poster(
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number
): Op[] {
  const rng = makeRng(seed)
  const ops: Op[] = [
    [x - 2, y - 2, w + 4, h + 4, 'ink'],
    [x - 1, y - 1, w + 2, h + 2, 'woodDark'],
    [x, y, w, h, 'paper']
  ]
  const bands = ['accent', 'brand', 'sage', 'steelDark', 'accentLite']
  for (let i = 0; i < 4; i++) {
    const bh = 2 + Math.floor(rng() * 4)
    const by = y + 3 + i * Math.floor((h - 6) / 4)
    if (by + bh > y + h - 2) break
    ops.push([
      x + 2 + Math.floor(rng() * 3),
      by,
      Math.max(3, w - 4 - Math.floor(rng() * 6)),
      bh,
      bands[Math.floor(rng() * bands.length)]
    ])
  }
  return ops
}

/** A small wall sconce throwing a pool of light. */
export function wallLamp(x: number, y: number): Op[] {
  return [
    [x - 5, y + 4, 13, 9, 'brandPale'],
    [x, y, 3, 6, 'ink'],
    [x - 3, y + 4, 9, 4, 'ink'],
    [x - 2, y + 5, 7, 2, 'brand'],
    [x - 1, y + 7, 5, 1, 'brandLite']
  ]
}

/**
 * A doorway in the back wall.
 *
 * The room needs somewhere to have come from. Without one the office reads as
 * a sealed box, and characters walking in from the edge have nowhere to have
 * walked in from. `y` is the floor line the frame stands on.
 */
export function doorway(x: number, y: number, w = 34, h = 52): Op[] {
  const ops: Op[] = [
    // Frame.
    [x - 3, y - h - 3, w + 6, h + 3, 'ink'],
    [x, y - h, w, h, 'woodDark'],
    // The room beyond, darker than anything in this one so it reads as depth.
    [x + 2, y - h + 2, w - 4, h - 2, 'ink2'],
    // Door leaf, standing open against the left jamb.
    [x + 2, y - h + 2, 11, h - 2, 'wood'],
    [x + 2, y - h + 2, 11, 1, 'woodLite'],
    [x + 10, y - Math.round(h / 2), 2, 3, 'brand'],
    // Lintel.
    [x - 3, y - h - 3, w + 6, 3, 'ink'],
    [x - 2, y - h - 2, w + 4, 1, 'woodLite']
  ]
  // Light spilling out across the floor.
  ops.push([x + 1, y, w - 2, 2, 'floorShadow'])
  return ops
}

/**
 * A free-standing task chair, seen from the front.
 *
 * Distinct from `chairBack` in props.ts, which is drawn to sit *behind* an
 * occupant and frame them. This one has to stand on its own beside a meeting
 * table, so it carries a seat, a back and legs rather than a silhouette.
 */
export function taskChair(x: number, y: number, facing: 'up' | 'down' = 'up'): Op[] {
  const ops: Op[] = [[x - 8, y - 1, 16, 2, 'floorShadow']]
  // Back: above the seat when facing away, below it when facing the viewer.
  const backY = facing === 'up' ? y - 20 : y - 9
  ops.push([x - 7, backY, 14, 11, 'ink'])
  ops.push([x - 6, backY + 1, 12, 9, 'accent'])
  ops.push([x - 6, backY + 1, 12, 1, 'accentLite'])
  // Seat.
  ops.push([x - 8, y - 10, 16, 4, 'ink'])
  ops.push([x - 7, y - 9, 14, 2, 'accentDark'])
  // Stem and base.
  ops.push([x - 1, y - 6, 3, 4, 'ink'])
  ops.push([x - 6, y - 2, 12, 2, 'ink'])
  return ops
}

/** A backless stool, for a break area or a bench. */
export function stool(x: number, y: number): Op[] {
  return [
    [x - 6, y - 1, 12, 2, 'floorShadow'],
    [x - 6, y - 10, 12, 4, 'ink'],
    [x - 5, y - 9, 10, 2, 'wood'],
    [x - 5, y - 6, 2, 6, 'ink'],
    [x + 3, y - 6, 2, 6, 'ink'],
    [x - 4, y - 4, 8, 1, 'woodDark']
  ]
}

/**
 * A pendant light hanging from the ceiling, with the pool it throws.
 *
 * Drawn as part of the wall band rather than as a floor prop: it hangs above
 * everybody's head and must never sort in front of a character.
 */
export function pendantLamp(x: number, y: number, drop = 14): Op[] {
  return [
    [x, 0, 1, drop, 'ink3'],
    [x - 7, y, 15, 2, 'ink'],
    [x - 6, y + 2, 13, 4, 'ink'],
    [x - 5, y + 3, 11, 2, 'brand'],
    [x - 4, y + 5, 9, 1, 'brandLite'],
    // The glow beneath it, kept subtle so it does not read as a solid block.
    [x - 5, y + 7, 11, 2, 'brandPale']
  ]
}

/**
 * A rack of equipment: the storage zone's anchor.
 *
 * Blinking status lights are left to the renderer, which is handed their
 * positions the same way it is handed a desk's.
 */
export interface RackParts {
  ops: Op[]
  leds: { x: number; y: number }[]
}

export function serverRack(x: number, y: number, h = 46): RackParts {
  const ops: Op[] = [[x - 1, y - 1, 28, 3, 'floorShadow']]
  ops.push([x, y - h, 26, h, 'ink'])
  ops.push([x + 1, y - h + 1, 24, h - 2, 'ink2'])
  const leds: { x: number; y: number }[] = []
  const units = Math.floor((h - 6) / 9)
  for (let i = 0; i < units; i++) {
    const uy = y - h + 4 + i * 9
    ops.push([x + 3, uy, 20, 7, 'steelDark'])
    ops.push([x + 4, uy + 1, 18, 5, 'ink3'])
    ops.push([x + 5, uy + 2, 8, 1, 'steel'])
    leds.push({ x: x + 19, y: uy + 3 })
  }
  ops.push([x, y - h, 26, 2, 'steel'])
  return { ops, leds }
}

/** A bank of storage lockers. */
export function lockers(x: number, y: number, doors = 3): Op[] {
  const w = doors * 13 + 2
  const ops: Op[] = [[x - 1, y - 1, w + 2, 3, 'floorShadow']]
  ops.push([x, y - 44, w, 44, 'ink'])
  ops.push([x + 1, y - 43, w - 2, 42, 'steel'])
  for (let i = 0; i < doors; i++) {
    const dx = x + 2 + i * 13
    ops.push([dx, y - 42, 11, 40, 'steelDark'])
    ops.push([dx + 1, y - 41, 9, 38, 'steel'])
    ops.push([dx + 1, y - 41, 9, 1, 'white'])
    // Vents and a handle.
    ops.push([dx + 3, y - 38, 5, 1, 'steelDark'])
    ops.push([dx + 3, y - 36, 5, 1, 'steelDark'])
    ops.push([dx + 8, y - 22, 1, 5, 'ink'])
  }
  return ops
}

/**
 * A corkboard of pinned notes: the documentation wall.
 *
 * Deliberately busier than the whiteboard so a room can carry both without
 * the two reading as the same object twice.
 */
export function noticeBoard(x: number, y: number, w: number, h: number, seed = 7): Op[] {
  const rng = makeRng(seed)
  const ops: Op[] = [
    [x - 2, y - 2, w + 4, h + 4, 'ink'],
    [x - 1, y - 1, w + 2, h + 2, 'woodDark'],
    [x, y, w, h, 'cork']
  ]
  // Pinned notes on a loose grid, so they read as posted rather than printed.
  const cols = Math.max(2, Math.floor((w - 4) / 15))
  const rows = Math.max(1, Math.floor((h - 4) / 15))
  const tints = ['paper', 'brand', 'white', 'brandLite', 'cream2']
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() > 0.82) continue
      const nx = x + 3 + c * 15 + Math.floor(rng() * 3)
      const ny = y + 3 + r * 15 + Math.floor(rng() * 3)
      const nw = 9 + Math.floor(rng() * 3)
      const nh = 9 + Math.floor(rng() * 2)
      if (nx + nw > x + w - 1 || ny + nh > y + h - 1) continue
      ops.push([nx, ny, nw, nh, 'ink'])
      ops.push([nx, ny, nw - 1, nh - 1, tints[Math.floor(rng() * tints.length)]])
      // A line of writing, and the pin holding it up.
      ops.push([nx + 2, ny + 3, nw - 5, 1, 'ink3'])
      ops.push([nx + Math.floor(nw / 2) - 1, ny - 1, 2, 2, 'rust'])
    }
  }
  return ops
}

/** A low side table with a lamp, for a corner that needs softening. */
export function sideTable(x: number, y: number): Op[] {
  return [
    [x - 2, y - 1, 22, 3, 'floorShadow'],
    // Lamp.
    [x + 5, y - 21, 9, 5, 'ink'],
    [x + 6, y - 20, 7, 3, 'brand'],
    [x + 7, y - 17, 5, 1, 'brandLite'],
    [x + 8, y - 16, 3, 8, 'ink'],
    // Top and legs.
    [x - 1, y - 9, 20, 4, 'ink'],
    [x, y - 8, 18, 2, 'woodLite'],
    [x + 1, y - 5, 3, 5, 'ink'],
    [x + 14, y - 5, 3, 5, 'ink']
  ]
}
