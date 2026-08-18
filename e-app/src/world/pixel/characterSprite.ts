import type { Op, Palette } from './ops'
import type {
  CharacterAppearance,
  CharacterState,
  Facing
} from '../../characters/character.types'

/**
 * The sprite skeleton.
 *
 * Every character in every theme is generated from this one 16x24 grid, so
 * head-to-body ratio, outline thickness, pixel density and lighting stay
 * consistent across the cast by construction. Characters differ only by
 * palette, hair silhouette and a couple of accessories.
 *
 *   y0        spare row (hair volume / bob headroom)
 *   y1..y10   head      - 10px, deliberately large relative to the body
 *   y11       neck
 *   y12..y18  torso and arms
 *   y19..y22  legs
 *   y23       feet
 */
export const SPRITE_W = 16
export const SPRITE_H = 24

/** Sprites are authored in three views; left and right share art and mirror. */
export type SpriteFacing = 'down' | 'up' | 'side'

export function spriteFacing(f: Facing): SpriteFacing {
  return f === 'down' ? 'down' : f === 'up' ? 'up' : 'side'
}

/** Left-facing sprites are the mirrored side view. */
export function isMirrored(f: Facing): boolean {
  return f === 'left'
}

const INK = '#1B1B2A'

export function appearancePalette(a: CharacterAppearance): Palette {
  return {
    ink: INK,
    white: '#FFFFFF',
    skin: a.skin,
    skinShade: a.skinShade,
    hair: a.hair,
    hairShade: a.hairShade,
    outfit: a.outfit,
    outfitShade: a.outfitShade,
    shirt: a.shirt,
    accent: a.accent ?? 'none',
    vest: a.vest ?? 'none',
    trousers: a.trousers,
    shoes: a.shoes
  }
}

/* ----------------------------------------------------------------- head -- */

function hairFront(a: CharacterAppearance, dy: number): Op[] {
  // Fringe shapes sitting over the forehead row.
  switch (a.hairStyle) {
    case 'swept':
      // Side-swept: thicker on the left, tapering to the right.
      return [
        [4, 5 + dy, 4, 1, 'hair'],
        [4, 6 + dy, 2, 1, 'hair'],
        [8, 5 + dy, 2, 1, 'hairShade']
      ]
    case 'short':
      return [[4, 5 + dy, 8, 1, 'hair']]
    case 'bun':
      // Pulled back, so hair only frames the temples.
      return [
        [4, 5 + dy, 8, 1, 'hair'],
        [4, 5 + dy, 1, 3, 'hair'],
        [11, 5 + dy, 1, 3, 'hairShade']
      ]
    case 'long':
      return [
        [4, 5 + dy, 8, 1, 'hair'],
        [4, 6 + dy, 1, 5, 'hair'],
        [11, 6 + dy, 1, 5, 'hairShade']
      ]
  }
}

/** Hair falling onto the shoulders, drawn over the torso. */
function hairOverShoulders(a: CharacterAppearance, dy: number): Op[] {
  if (a.hairStyle !== 'long') return []
  return [
    [3, 11 + dy, 2, 5, 'hair'],
    [11, 11 + dy, 2, 5, 'hairShade']
  ]
}

function eyes(a: CharacterAppearance, dy: number): Op[] {
  const ops: Op[] = []
  if (a.glasses) {
    // Minimal frames: a brow bar plus verticals bracketing each lens.
    ops.push([4, 5 + dy, 8, 1, 'ink'])
    ops.push([4, 6 + dy, 8, 2, 'white'])
    ops.push([4, 6 + dy, 1, 2, 'ink'])
    ops.push([7, 6 + dy, 2, 2, 'ink'])
    ops.push([11, 6 + dy, 1, 2, 'ink'])
    ops.push([5, 6 + dy, 2, 2, 'ink'])
    ops.push([9, 6 + dy, 2, 2, 'ink'])
  } else {
    ops.push([5, 6 + dy, 2, 2, 'ink'])
    ops.push([9, 6 + dy, 2, 2, 'ink'])
  }
  return ops
}

function mouth(a: CharacterAppearance, dy: number, open: boolean): Op[] {
  if (open) return [[7, 9 + dy, 2, 2, 'ink']]
  if (a.mouth === 'smirk') {
    return [
      [7, 9 + dy, 2, 1, 'skinShade'],
      [9, 8 + dy, 1, 1, 'skinShade']
    ]
  }
  return [[7, 9 + dy, 2, 1, 'skinShade']]
}

function head(
  a: CharacterAppearance,
  facing: SpriteFacing,
  dy: number,
  mouthOpen: boolean
): Op[] {
  const ops: Op[] = [[3, 1 + dy, 10, 10, 'ink']]

  if (facing === 'up') {
    // Back of the head: all hair, no face.
    ops.push([4, 2 + dy, 8, 9, 'hair'])
    ops.push([5, 10 + dy, 6, 1, 'hair'])
    ops.push([11, 2 + dy, 1, 8, 'hairShade'])
    if (a.hairStyle === 'bun') {
      ops.push([5, 3 + dy, 6, 5, 'ink'])
      ops.push([6, 4 + dy, 4, 3, 'hair'])
      ops.push([9, 4 + dy, 1, 3, 'hairShade'])
    }
    if (a.hairStyle === 'swept') ops.push([4, 2 + dy, 3, 2, 'hairShade'])
    return ops
  }

  if (facing === 'side') {
    ops.push([4, 2 + dy, 8, 3, 'hair'])
    ops.push([4, 5 + dy, 5, 6, 'hair'])
    ops.push([9, 5 + dy, 3, 5, 'skin'])
    ops.push([9, 10 + dy, 2, 1, 'skin'])
    ops.push([11, 5 + dy, 1, 5, 'skinShade'])
    ops.push([12, 7 + dy, 1, 1, 'skin']) // profile nose
    ops.push([9, 6 + dy, 2, 2, 'ink']) // single visible eye
    if (a.glasses) {
      ops.push([8, 5 + dy, 4, 1, 'ink'])
      ops.push([8, 6 + dy, 1, 2, 'ink'])
    }
    ops.push([10, 9 + dy, 1, 1, mouthOpen ? 'ink' : 'skinShade'])
    return ops
  }

  // Front view.
  ops.push([4, 2 + dy, 8, 3, 'hair'])
  ops.push([11, 2 + dy, 1, 3, 'hairShade'])
  ops.push([4, 5 + dy, 8, 5, 'skin'])
  ops.push([5, 10 + dy, 6, 1, 'skin'])
  ops.push([11, 5 + dy, 1, 5, 'skinShade'])
  ops.push([10, 10 + dy, 1, 1, 'skinShade'])
  ops.push(...hairFront(a, dy))
  ops.push(...eyes(a, dy))
  ops.push(...mouth(a, dy, mouthOpen))
  return ops
}

/* ---------------------------------------------------------------- torso -- */

type ArmPose = 'down' | 'typing' | 'chin' | 'gesture' | 'up'

function torso(
  a: CharacterAppearance,
  facing: SpriteFacing,
  dy: number,
  arms: ArmPose,
  frame: number
): Op[] {
  const ops: Op[] = []

  if (arms === 'up') {
    // Raised arms break the silhouette, so they go down before the body.
    const lift = frame % 2 === 0 ? 0 : -1
    ops.push([1, 9 + dy + lift, 3, 6, 'ink'])
    ops.push([12, 9 + dy + lift, 3, 6, 'ink'])
    ops.push([2, 10 + dy + lift, 2, 4, 'outfitShade'])
    ops.push([12, 10 + dy + lift, 2, 4, 'outfitShade'])
    ops.push([2, 10 + dy + lift, 2, 1, 'skin'])
    ops.push([12, 10 + dy + lift, 2, 1, 'skin'])
  }

  ops.push([6, 11 + dy, 4, 1, 'skinShade']) // neck
  ops.push([2, 12 + dy, 12, 7, 'ink']) // silhouette including sleeves
  ops.push([3, 13 + dy, 10, 5, 'outfit'])
  ops.push([3, 13 + dy, 2, 5, 'outfitShade'])
  ops.push([11, 13 + dy, 2, 5, 'outfitShade'])

  if (a.vest) {
    ops.push([5, 14 + dy, 6, 4, 'vest'])
    ops.push([10, 14 + dy, 1, 4, 'outfitShade'])
  }

  ops.push([6, 13 + dy, 4, 1, 'shirt']) // collar
  if (a.accent) ops.push([7, 14 + dy, 2, 4, 'accent'])

  // Hand position is the main read on what a character is doing.
  if (arms === 'down') {
    ops.push([3, 17 + dy, 2, 1, 'skin'])
    ops.push([11, 17 + dy, 2, 1, 'skin'])
  } else if (arms === 'typing') {
    const l = frame % 2 === 0 ? 0 : -1
    const r = frame % 2 === 0 ? -1 : 0
    ops.push([4, 17 + dy + l, 2, 1, 'skin'])
    ops.push([10, 17 + dy + r, 2, 1, 'skin'])
  } else if (arms === 'chin') {
    // One arm folded up to the chin.
    ops.push([11, 12 + dy, 2, 6, 'ink'])
    ops.push([11, 13 + dy, 2, 4, 'outfitShade'])
    ops.push([10, 11 + dy - (frame % 2), 2, 1, 'skin'])
    ops.push([3, 17 + dy, 2, 1, 'skin'])
  } else if (arms === 'gesture') {
    ops.push([3, 17 + dy, 2, 1, 'skin'])
    ops.push([11, 15 + dy - (frame % 2), 2, 1, 'skin'])
  }

  ops.push(...hairOverShoulders(a, dy))

  if (facing === 'side') {
    // Trim the far shoulder so the profile does not read as front-on.
    ops.push([2, 12 + dy, 1, 7, 'none'])
  }
  return ops
}

/* ----------------------------------------------------------------- legs -- */

function standLegs(): Op[] {
  return [
    [3, 19, 1, 4, 'ink'],
    [4, 19, 3, 4, 'trousers'],
    [7, 19, 2, 4, 'ink'],
    [9, 19, 3, 4, 'trousers'],
    [12, 19, 1, 4, 'ink'],
    [3, 23, 4, 1, 'shoes'],
    [9, 23, 4, 1, 'shoes']
  ]
}

/** 4-frame walk cycle: neutral, left lift, neutral, right lift. */
function walkLegs(frame: number): Op[] {
  const f = frame % 4
  if (f === 0 || f === 2) return standLegs()
  const liftLeft = f === 1
  return [
    [3, 19, 1, 4, 'ink'],
    [7, 19, 2, 4, 'ink'],
    [12, 19, 1, 4, 'ink'],
    liftLeft ? [4, 19, 3, 3, 'trousers'] : [4, 19, 3, 4, 'trousers'],
    liftLeft ? [9, 19, 3, 4, 'trousers'] : [9, 19, 3, 3, 'trousers'],
    liftLeft ? [3, 22, 4, 1, 'shoes'] : [3, 23, 4, 1, 'shoes'],
    liftLeft ? [9, 23, 4, 1, 'shoes'] : [9, 22, 4, 1, 'shoes']
  ]
}

/** Seated: knees forward, so the legs read as folded rather than standing. */
function sitLegs(): Op[] {
  return [
    [3, 19, 10, 3, 'ink'],
    [4, 19, 3, 2, 'trousers'],
    [9, 19, 3, 2, 'trousers'],
    [3, 22, 4, 1, 'shoes'],
    [9, 22, 4, 1, 'shoes']
  ]
}

/* -------------------------------------------------------------- compose -- */

/**
 * Build one animation frame. `frame` has already been reduced to the clip
 * length by the caller.
 */
export function buildCharacterOps(
  a: CharacterAppearance,
  state: CharacterState,
  frame: number,
  facing: SpriteFacing
): Op[] {
  let bob = 0
  let arms: ArmPose = 'down'
  let mouthOpen = false
  let legs: Op[]

  switch (state) {
    case 'walking':
      bob = frame % 2 === 1 ? -1 : 0
      legs = walkLegs(frame)
      break
    case 'working':
      arms = 'typing'
      legs = sitLegs()
      break
    case 'thinking':
      arms = 'chin'
      bob = frame % 2
      legs = standLegs()
      break
    case 'talking':
      arms = 'gesture'
      mouthOpen = frame % 2 === 1
      bob = frame % 2
      legs = standLegs()
      break
    case 'success':
      arms = 'up'
      mouthOpen = true
      bob = frame % 2 === 0 ? -1 : 0
      legs = standLegs()
      break
    case 'error':
      bob = frame % 2
      legs = standLegs()
      break
    case 'waiting':
    case 'idle':
    default:
      // Breathing: the whole upper body drifts a single pixel.
      bob = frame % 2
      legs = standLegs()
      break
  }

  return [
    ...torso(a, facing, bob, arms, frame),
    ...head(a, facing, bob, mouthOpen),
    ...legs
  ]
}
