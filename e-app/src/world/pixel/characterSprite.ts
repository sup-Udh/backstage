import type { Op, Palette } from './ops'
import type {
  CharacterAppearance,
  CharacterState,
  Expression,
  Facing
} from '../../characters/character.types'

/**
 * The sprite skeleton.
 *
 * Every character in every theme is generated from this one 20x30 grid, so
 * head-to-body ratio, outline weight, pixel density and light direction stay
 * consistent across the cast by construction. They differ in silhouette,
 * palette and detail — which is what makes them recognisable rather than
 * recolours of one another.
 *
 * The box grew from 16x24 (+56% pixels) but the *body* did not: the torso is
 * still about twelve pixels across. The extra margin goes to hair, shoulders
 * and accessories — the things that break a silhouette — so characters read as
 * individuals without becoming larger relative to the desks.
 *
 *   y0..y1    hair volume and above-head accessories
 *   y2..y13   head — 12 rows, deliberately large
 *   y14       neck
 *   y15..y22  torso, shoulders and arms
 *   y23..y27  legs
 *   y28..y29  feet
 *
 * Light comes from the upper left throughout: highlights top and left, shadow
 * bottom and right, three to four shades per material.
 */
export const SPRITE_W = 20
export const SPRITE_H = 30

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

/* ------------------------------------------------------------- palette --- */

/** Shift a hex colour towards black (negative) or white (positive). */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount
    return Math.max(0, Math.min(255, Math.round(v)))
  })
  return `#${((ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).padStart(6, '0')}`
}

/**
 * Build the full palette from the handful of colours a character declares.
 * Deriving the shades keeps the light direction identical for everyone.
 */
export function appearancePalette(a: CharacterAppearance): Palette {
  const accessory = a.accessoryColor ?? '#FFC94F'
  return {
    ink: INK,
    ink2: tint(INK, 0.22),
    white: '#FFFFFF',

    skinLit: tint(a.skin, 0.16),
    skin: a.skin,
    skinShade: a.skinShade ?? tint(a.skin, -0.16),
    skinDeep: tint(a.skinShade ?? a.skin, -0.3),

    hairLit: tint(a.hair, 0.26),
    hair: a.hair,
    hairShade: a.hairShade ?? tint(a.hair, -0.28),
    hairDeep: tint(a.hair, -0.48),

    outfitLit: tint(a.outfit, 0.2),
    outfit: a.outfit,
    outfitShade: a.outfitShade ?? tint(a.outfit, -0.24),
    outfitDeep: tint(a.outfit, -0.44),

    shirtLit: tint(a.shirt, 0.14),
    shirt: a.shirt,
    shirtShade: tint(a.shirt, -0.18),

    accent: a.accent ?? 'none',
    accentShade: a.accent ? tint(a.accent, -0.28) : 'none',
    vest: a.vest ?? 'none',
    vestShade: a.vest ? tint(a.vest, -0.26) : 'none',

    trousers: a.trousers,
    trousersShade: tint(a.trousers, -0.26),
    shoes: a.shoes,

    acc: accessory,
    accShade: tint(accessory, -0.3),
    accLit: tint(accessory, 0.25)
  }
}

/* ---------------------------------------------------------------- head --- */

/**
 * Hair, drawn in two passes: `back` sits behind the head (length, volume) and
 * `front` over it (fringe, parting). Splitting them is what lets a silhouette
 * extend past the skull without covering the face.
 */
function hairBack(a: CharacterAppearance, dy: number): Op[] {
  const y = 2 + dy
  switch (a.hairStyle) {
    case 'long':
      return [
        [3, y + 2, 3, 14, 'hairShade'],
        [14, y + 2, 3, 14, 'hairShade'],
        [3, y + 2, 3, 6, 'hair'],
        [2, y + 5, 1, 8, 'hairDeep'],
        [17, y + 5, 1, 8, 'hairDeep']
      ]
    case 'bob':
      return [
        [3, y + 2, 3, 9, 'hairShade'],
        [14, y + 2, 3, 9, 'hairShade'],
        [3, y + 10, 14, 1, 'hairDeep']
      ]
    case 'ponytail':
      return [
        [15, y + 3, 3, 3, 'hair'],
        [16, y + 5, 3, 7, 'hairShade'],
        [17, y + 9, 2, 4, 'hairDeep']
      ]
    case 'bun':
      return [
        [7, y - 2, 6, 4, 'ink'],
        [8, y - 1, 4, 2, 'hair'],
        [11, y - 1, 1, 2, 'hairShade']
      ]
    case 'curly':
      return [
        [3, y + 1, 4, 4, 'hair'],
        [13, y + 1, 4, 4, 'hairShade'],
        [2, y + 4, 3, 5, 'hairShade'],
        [15, y + 4, 3, 5, 'hairDeep'],
        [4, y - 1, 4, 3, 'hair'],
        [12, y - 1, 4, 3, 'hairShade']
      ]
    case 'messy':
      return [
        [3, y, 3, 4, 'hair'],
        [15, y, 3, 4, 'hairShade'],
        [5, y - 2, 3, 3, 'hair'],
        [12, y - 2, 3, 3, 'hairShade']
      ]
    default:
      return []
  }
}

function hairFront(a: CharacterAppearance, dy: number): Op[] {
  const y = 2 + dy
  const ops: Op[] = []

  // The cap every style shares, so the skull reads as one shape.
  ops.push([4, y, 12, 4, 'hair'])
  ops.push([4, y, 12, 1, 'hairLit'])
  ops.push([14, y + 1, 2, 3, 'hairShade'])

  switch (a.hairStyle) {
    case 'swept':
      // Side parting: thick over the left brow, sweeping right and thinning.
      ops.push([4, y + 4, 7, 2, 'hair'])
      ops.push([4, y + 4, 4, 1, 'hairLit'])
      ops.push([11, y + 4, 4, 1, 'hairShade'])
      ops.push([15, y + 4, 1, 2, 'hairShade'])
      break
    case 'slick':
      // Combed flat and back: a hard, glossy top edge.
      ops.push([4, y + 4, 12, 1, 'hairShade'])
      ops.push([5, y, 9, 1, 'white'])
      ops.push([4, y + 1, 1, 4, 'hairDeep'])
      break
    case 'short':
      ops.push([4, y + 4, 12, 1, 'hair'])
      ops.push([4, y + 4, 5, 1, 'hairLit'])
      break
    case 'buzz':
      ops.push([4, y + 3, 12, 1, 'hairShade'])
      ops.push([5, y + 1, 4, 1, 'hairLit'])
      break
    case 'messy':
      // Broken outline: tufts of different lengths.
      ops.push([4, y + 4, 3, 2, 'hair'])
      ops.push([8, y + 4, 2, 1, 'hair'])
      ops.push([11, y + 4, 4, 2, 'hairShade'])
      ops.push([6, y - 1, 2, 2, 'hair'])
      ops.push([10, y - 1, 3, 2, 'hairShade'])
      break
    case 'curly':
      ops.push([4, y + 4, 12, 2, 'hair'])
      ops.push([5, y + 3, 2, 2, 'hairLit'])
      ops.push([9, y + 3, 2, 2, 'hairLit'])
      ops.push([13, y + 4, 2, 2, 'hairShade'])
      break
    case 'bun':
      ops.push([4, y + 4, 12, 1, 'hair'])
      ops.push([4, y + 4, 1, 4, 'hair'])
      ops.push([15, y + 4, 1, 4, 'hairShade'])
      break
    case 'bob':
    case 'long':
    case 'ponytail':
      ops.push([4, y + 4, 12, 2, 'hair'])
      ops.push([4, y + 4, 5, 1, 'hairLit'])
      ops.push([12, y + 4, 4, 2, 'hairShade'])
      break
  }
  return ops
}

/** Brows carry most of the expression at this size. */
function brows(exp: Expression, dy: number): Op[] {
  const y = 8 + dy
  switch (exp) {
    case 'serious':
      return [
        [6, y, 3, 1, 'hairShade'],
        [11, y, 3, 1, 'hairShade']
      ]
    case 'focused':
      return [
        [6, y, 3, 1, 'hairShade'],
        [11, y, 3, 1, 'hairShade'],
        [8, y + 1, 1, 1, 'skinShade']
      ]
    case 'skeptical':
      // One brow raised: the whole read comes from a single pixel of offset.
      return [
        [6, y - 1, 3, 1, 'hairShade'],
        [11, y, 3, 1, 'hairShade']
      ]
    case 'tired':
      return [
        [6, y, 3, 1, 'hairShade'],
        [11, y, 3, 1, 'hairShade'],
        [6, y + 4, 3, 1, 'skinShade'],
        [11, y + 4, 3, 1, 'skinShade']
      ]
    case 'friendly':
      return [
        [6, y - 1, 3, 1, 'hairShade'],
        [11, y - 1, 3, 1, 'hairShade']
      ]
    default:
      return [
        [6, y, 3, 1, 'hairShade'],
        [11, y, 3, 1, 'hairShade']
      ]
  }
}

function eyes(a: CharacterAppearance, exp: Expression, dy: number): Op[] {
  const y = 10 + dy
  const ops: Op[] = []

  if (exp === 'friendly') {
    // Creased into a smile: a two-pixel arc rather than a dot.
    ops.push([6, y, 3, 1, 'ink'])
    ops.push([11, y, 3, 1, 'ink'])
  } else if (exp === 'tired') {
    ops.push([6, y, 3, 1, 'ink'])
    ops.push([11, y, 3, 1, 'ink'])
    ops.push([6, y + 1, 1, 1, 'ink'])
    ops.push([13, y + 1, 1, 1, 'ink'])
  } else {
    ops.push([6, y, 2, 2, 'white'])
    ops.push([12, y, 2, 2, 'white'])
    ops.push([7, y, 1, 2, 'ink'])
    ops.push([12, y, 1, 2, 'ink'])
    // A single lit pixel makes the eye read as wet rather than painted.
    ops.push([6, y, 1, 1, 'skinLit'])
  }

  if (a.glasses) {
    ops.push([5, y - 1, 5, 4, 'ink2'])
    ops.push([11, y - 1, 5, 4, 'ink2'])
    ops.push([6, y, 3, 2, 'white'])
    ops.push([12, y, 3, 2, 'white'])
    ops.push([7, y, 1, 2, 'ink'])
    ops.push([12, y, 1, 2, 'ink'])
    ops.push([10, y, 1, 1, 'ink2'])
    ops.push([6, y, 1, 1, 'shirtLit'])
  }
  return ops
}

function mouth(exp: Expression, dy: number, open: boolean): Op[] {
  const y = 13 + dy
  if (open) return [[9, y - 1, 3, 2, 'ink'], [9, y - 1, 3, 1, 'skinDeep']]
  switch (exp) {
    case 'smirk':
      return [
        [8, y, 3, 1, 'skinShade'],
        [11, y - 1, 1, 1, 'skinShade']
      ]
    case 'friendly':
      return [
        [8, y, 4, 1, 'skinShade'],
        [7, y - 1, 1, 1, 'skinShade'],
        [12, y - 1, 1, 1, 'skinShade']
      ]
    case 'serious':
      return [[8, y, 4, 1, 'skinDeep']]
    case 'tired':
      return [[8, y, 3, 1, 'skinShade']]
    default:
      return [[8, y, 3, 1, 'skinShade']]
  }
}

function head(
  a: CharacterAppearance,
  facing: SpriteFacing,
  dy: number,
  mouthOpen: boolean
): Op[] {
  const exp = expressionOf(a)
  const y = 2 + dy
  const ops: Op[] = []

  ops.push(...hairBack(a, dy))

  if (facing === 'up') {
    // Back of the head: all hair, no face.
    ops.push([4, y - 1, 12, 14, 'ink'])
    ops.push([5, y, 10, 12, 'hair'])
    ops.push([5, y, 10, 2, 'hairLit'])
    ops.push([13, y, 2, 12, 'hairShade'])
    ops.push([6, y + 12, 8, 1, 'hairDeep'])
    // Ears just catch the light at the edge of the skull.
    ops.push([4, y + 6, 1, 2, 'skinShade'])
    ops.push([15, y + 6, 1, 2, 'skinShade'])
    return ops
  }

  if (facing === 'side') {
    ops.push([4, y - 1, 12, 14, 'ink'])
    ops.push([5, y, 10, 12, 'skin'])
    ops.push([5, y, 10, 4, 'hair'])
    ops.push([5, y, 6, 1, 'hairLit'])
    ops.push([5, y + 4, 4, 8, 'hair'])
    ops.push([5, y + 4, 2, 4, 'hairShade'])
    ops.push([13, y + 2, 2, 10, 'skinShade'])
    ops.push([15, y + 6, 1, 2, 'skin']) // nose in profile
    ops.push([15, y + 8, 1, 1, 'skinShade'])
    ops.push([10, y + 8, 2, 2, 'white'])
    ops.push([11, y + 8, 1, 2, 'ink'])
    ops.push([10, y + 6, 3, 1, 'hairShade'])
    if (a.glasses) {
      ops.push([9, y + 7, 6, 1, 'ink2'])
      ops.push([9, y + 8, 1, 2, 'ink2'])
    }
    ops.push([12, y + 11, 2, 1, mouthOpen ? 'ink' : 'skinShade'])
    ops.push([7, y + 6, 2, 2, 'skinShade']) // ear
    return ops
  }

  // Front view.
  ops.push([4, y - 1, 12, 14, 'ink'])
  ops.push([5, y, 10, 12, 'skin'])
  ops.push([5, y, 10, 1, 'skinLit'])
  // Cheek and jaw shading, lit from the upper left.
  ops.push([13, y + 1, 2, 11, 'skinShade'])
  ops.push([6, y + 11, 8, 1, 'skinShade'])
  ops.push([5, y + 11, 1, 1, 'skinDeep'])
  // Ears.
  ops.push([4, y + 6, 1, 3, 'skin'])
  ops.push([15, y + 6, 1, 3, 'skinShade'])
  // Nose: two pixels of shadow, no outline.
  ops.push([10, y + 9, 1, 2, 'skinShade'])
  ops.push([10, y + 11, 1, 1, 'skinDeep'])

  ops.push(...hairFront(a, dy))
  ops.push(...brows(exp, dy))
  ops.push(...eyes(a, exp, dy))
  ops.push(...mouth(exp, dy, mouthOpen))
  return ops
}

function expressionOf(a: CharacterAppearance): Expression {
  if (a.expression) return a.expression
  return a.mouth === 'smirk' ? 'smirk' : 'calm'
}

/* --------------------------------------------------------------- torso --- */

type ArmPose = 'down' | 'typing' | 'chin' | 'gesture' | 'up' | 'hold'

interface Frame {
  /** Shoulder half-width from centre. */
  half: number
  /** Vertical offset of the whole upper body. */
  lean: number
  /** Horizontal offset of the head, for posture. */
  headShift: number
}

function frameFor(a: CharacterAppearance): Frame {
  const build = a.build ?? 'regular'
  const half = build === 'slim' ? 5 : build === 'broad' ? 7 : 6

  switch (a.posture ?? 'upright') {
    case 'relaxed':
      return { half, lean: 0, headShift: 1 }
    case 'rigid':
      return { half, lean: -1, headShift: 0 }
    case 'forward':
      return { half, lean: 0, headShift: -1 }
    case 'slouched':
      return { half, lean: 1, headShift: 1 }
    default:
      return { half, lean: 0, headShift: 0 }
  }
}

/** The outer garment's shoulder line, which is most of the silhouette. */
function shoulders(a: CharacterAppearance, f: Frame, dy: number): Op[] {
  const y = 15 + dy + f.lean
  const style = a.outfitStyle ?? 'suit'
  const left = 10 - f.half
  const w = f.half * 2
  const ops: Op[] = []

  if (style === 'hoodie') {
    // The hood is the silhouette: a raised collar and a bulkier line.
    ops.push([left - 1, y - 2, w + 2, 4, 'ink'])
    ops.push([left, y - 1, w, 2, 'outfitShade'])
    ops.push([left + 1, y - 1, 3, 1, 'outfit'])
  } else if (style === 'coat') {
    ops.push([left - 2, y, w + 4, 10, 'ink'])
    ops.push([left - 1, y + 1, w + 2, 8, 'outfit'])
    ops.push([left - 1, y + 1, 2, 8, 'outfitLit'])
    ops.push([left + w - 1, y + 1, 2, 8, 'outfitDeep'])
  } else if (style === 'labcoat') {
    ops.push([left - 1, y, w + 2, 9, 'ink'])
    ops.push([left, y + 1, w, 7, 'outfitLit'])
    ops.push([left + w - 2, y + 1, 2, 7, 'outfit'])
  }
  return ops
}

function torso(
  a: CharacterAppearance,
  facing: SpriteFacing,
  dy: number,
  arms: ArmPose,
  frame: number
): Op[] {
  const f = frameFor(a)
  const ops: Op[] = []
  const y = 15 + dy + f.lean
  const left = 10 - f.half
  const w = f.half * 2
  const style = a.outfitStyle ?? 'suit'

  if (arms === 'up') {
    const lift = frame % 2 === 0 ? 0 : -1
    ops.push([left - 3, y - 4 + lift, 3, 7, 'ink'])
    ops.push([left + w, y - 4 + lift, 3, 7, 'ink'])
    ops.push([left - 2, y - 3 + lift, 2, 5, 'outfit'])
    ops.push([left + w, y - 3 + lift, 2, 5, 'outfitShade'])
    ops.push([left - 2, y - 3 + lift, 2, 1, 'skin'])
    ops.push([left + w, y - 3 + lift, 2, 1, 'skin'])
  }

  // Neck, in shadow under the jaw.
  ops.push([8, 14 + dy, 4, 2, 'skinShade'])
  ops.push([8, 14 + dy, 4, 1, 'skinDeep'])

  ops.push(...shoulders(a, f, dy))

  // Body block: outline, base, then light and shadow columns.
  ops.push([left - 1, y, w + 2, 9, 'ink'])
  ops.push([left, y + 1, w, 7, 'outfit'])
  ops.push([left, y + 1, 2, 7, 'outfitLit'])
  ops.push([left + w - 2, y + 1, 2, 7, 'outfitShade'])
  ops.push([left, y + 7, w, 1, 'outfitDeep'])

  // Sleeves, a shade darker so the arms separate from the chest.
  ops.push([left, y + 2, 2, 6, 'outfitShade'])
  ops.push([left + w - 2, y + 2, 2, 6, 'outfitDeep'])

  if (style === 'hoodie') {
    // Kangaroo pocket and drawstrings.
    ops.push([left + 2, y + 5, w - 4, 2, 'outfitShade'])
    ops.push([9, y + 1, 1, 3, 'shirtLit'])
    ops.push([11, y + 1, 1, 3, 'shirtLit'])
  } else if (style === 'cardigan') {
    ops.push([9, y + 1, 3, 7, 'shirt'])
    ops.push([9, y + 1, 1, 7, 'shirtShade'])
    ops.push([10, y + 3, 1, 1, 'acc'])
    ops.push([10, y + 6, 1, 1, 'acc'])
  } else {
    // Shirt showing in the jacket opening.
    ops.push([8, y + 1, 5, 2, 'shirt'])
    ops.push([8, y + 1, 5, 1, 'shirtLit'])
    if (a.vest) {
      ops.push([8, y + 3, 5, 5, 'vest'])
      ops.push([12, y + 3, 1, 5, 'vestShade'])
      ops.push([9, y + 5, 1, 1, 'acc'])
    }
    // Lapels: the two diagonal pixels that make a jacket read as a jacket.
    if (style === 'suit' || style === 'blazer' || style === 'vest') {
      ops.push([7, y + 1, 2, 2, 'outfitLit'])
      ops.push([12, y + 1, 2, 2, 'outfitShade'])
      ops.push([8, y + 3, 1, 2, 'outfitDeep'])
      ops.push([12, y + 3, 1, 2, 'outfitDeep'])
    }
  }

  if (a.accent) {
    ops.push([10, y + 2, 1, 1, 'accentShade'])
    ops.push([9, y + 3, 3, 4, 'accent'])
    ops.push([11, y + 3, 1, 4, 'accentShade'])
    ops.push([9, y + 3, 1, 2, 'accentShade'])
  }

  // Hands. Their position is the main read on what a character is doing.
  const handY = y + 7
  if (arms === 'down') {
    ops.push([left, handY, 2, 2, 'skin'])
    ops.push([left + w - 2, handY, 2, 2, 'skinShade'])
  } else if (arms === 'typing') {
    const l = frame % 2 === 0 ? 0 : -1
    const r = frame % 2 === 0 ? -1 : 0
    ops.push([left + 1, handY + l, 2, 2, 'skin'])
    ops.push([left + w - 3, handY + r, 2, 2, 'skinShade'])
  } else if (arms === 'chin') {
    ops.push([left + w - 1, y + 1, 3, 7, 'ink'])
    ops.push([left + w - 1, y + 2, 2, 5, 'outfitShade'])
    ops.push([12, 14 + dy - (frame % 2), 2, 2, 'skin'])
    ops.push([left, handY, 2, 2, 'skin'])
  } else if (arms === 'gesture') {
    ops.push([left, handY, 2, 2, 'skin'])
    ops.push([left + w - 2, y + 4 - (frame % 2), 3, 2, 'skin'])
  } else if (arms === 'hold') {
    ops.push([left + 1, handY - 1, 2, 2, 'skin'])
    ops.push([left + w - 3, handY - 1, 2, 2, 'skinShade'])
  }

  if (facing === 'side') {
    // Trim the far shoulder so the profile does not read as front-on.
    ops.push([left - 1, y, 2, 9, 'none'])
  }
  return ops
}

/* ------------------------------------------------------------ accessory -- */

/**
 * One memorable item per character, drawn last so it sits on top and can
 * break the silhouette — which is the point of having it.
 */
function accessory(a: CharacterAppearance, dy: number, arms: ArmPose): Op[] {
  const f = frameFor(a)
  const y = 15 + dy + f.lean
  const left = 10 - f.half
  const w = f.half * 2
  const ops: Op[] = []

  switch (a.accessory ?? 'none') {
    case 'headphones':
      // Band over the hair, cups at the ears: unmistakable in silhouette.
      ops.push([4, 1 + dy, 12, 2, 'ink'])
      ops.push([5, 1 + dy, 10, 1, 'accShade'])
      ops.push([2, 7 + dy, 3, 5, 'ink'])
      ops.push([15, 7 + dy, 3, 5, 'ink'])
      ops.push([3, 8 + dy, 2, 3, 'acc'])
      ops.push([16, 8 + dy, 2, 3, 'accShade'])
      break
    case 'notebook':
      if (arms === 'down' || arms === 'hold') {
        ops.push([left - 2, y + 4, 5, 6, 'ink'])
        ops.push([left - 1, y + 5, 3, 4, 'white'])
        ops.push([left - 1, y + 5, 3, 1, 'acc'])
      }
      break
    case 'tablet':
      if (arms === 'down' || arms === 'hold') {
        ops.push([left + w - 3, y + 3, 6, 7, 'ink'])
        ops.push([left + w - 2, y + 4, 4, 5, 'ink2'])
        ops.push([left + w - 2, y + 5, 3, 1, 'acc'])
        ops.push([left + w - 2, y + 7, 2, 1, 'accLit'])
      }
      break
    case 'mug':
      if (arms !== 'up') {
        ops.push([left + w - 1, y + 5, 4, 4, 'ink'])
        ops.push([left + w, y + 6, 2, 2, 'white'])
        ops.push([left + w + 2, y + 6, 1, 1, 'ink'])
      }
      break
    case 'badge':
      ops.push([left + 1, y + 4, 3, 4, 'ink'])
      ops.push([left + 2, y + 5, 1, 2, 'acc'])
      break
    case 'scarf':
      ops.push([7, y - 1, 7, 3, 'ink'])
      ops.push([7, y, 6, 2, 'acc'])
      ops.push([12, y, 1, 2, 'accShade'])
      ops.push([13, y + 2, 2, 5, 'acc'])
      ops.push([14, y + 2, 1, 5, 'accShade'])
      break
    case 'briefcase':
      if (arms === 'down') {
        ops.push([left + w - 1, y + 8, 6, 5, 'ink'])
        ops.push([left + w, y + 9, 4, 3, 'accShade'])
        ops.push([left + w + 1, y + 7, 2, 1, 'ink'])
      }
      break
    case 'earpiece':
      ops.push([15, 8 + dy, 2, 3, 'ink'])
      ops.push([15, 9 + dy, 1, 1, 'accLit'])
      break
    case 'pen':
      if (arms === 'down' || arms === 'hold') {
        ops.push([left - 1, y + 5, 1, 4, 'acc'])
        ops.push([left - 1, y + 5, 1, 1, 'ink'])
      }
      break
    default:
      break
  }
  return ops
}

/* ----------------------------------------------------------------- legs -- */

function standLegs(dy: number): Op[] {
  const y = 23 + dy
  return [
    [5, y, 10, 5, 'ink'],
    [6, y, 3, 5, 'trousers'],
    [11, y, 3, 5, 'trousersShade'],
    [6, y, 3, 1, 'trousers'],
    [9, y, 2, 5, 'ink'],
    [5, y + 5, 5, 2, 'ink'],
    [10, y + 5, 5, 2, 'ink'],
    [6, y + 5, 4, 1, 'shoes'],
    [11, y + 5, 3, 1, 'shoes']
  ]
}

/** 4-frame walk cycle: neutral, left lift, neutral, right lift. */
function walkLegs(dy: number, frame: number): Op[] {
  const f = frame % 4
  if (f === 0 || f === 2) return standLegs(dy)
  const y = 23 + dy
  const liftLeft = f === 1
  return [
    [5, y, 10, 5, 'ink'],
    [9, y, 2, 5, 'ink'],
    liftLeft ? [6, y, 3, 4, 'trousers'] : [6, y, 3, 5, 'trousers'],
    liftLeft ? [11, y, 3, 5, 'trousersShade'] : [11, y, 3, 4, 'trousersShade'],
    liftLeft ? [5, y + 4, 5, 2, 'ink'] : [5, y + 5, 5, 2, 'ink'],
    liftLeft ? [10, y + 5, 5, 2, 'ink'] : [10, y + 4, 5, 2, 'ink'],
    liftLeft ? [6, y + 4, 4, 1, 'shoes'] : [6, y + 5, 4, 1, 'shoes'],
    liftLeft ? [11, y + 5, 3, 1, 'shoes'] : [11, y + 4, 3, 1, 'shoes']
  ]
}

/** Seated: knees forward, so the legs read as folded rather than standing. */
function sitLegs(dy: number): Op[] {
  const y = 23 + dy
  return [
    [4, y, 12, 4, 'ink'],
    [5, y + 1, 4, 2, 'trousers'],
    [11, y + 1, 4, 2, 'trousersShade'],
    [5, y + 4, 5, 2, 'ink'],
    [10, y + 4, 5, 2, 'ink'],
    [6, y + 4, 3, 1, 'shoes'],
    [11, y + 4, 3, 1, 'shoes']
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

  const idleArms: ArmPose =
    a.accessory === 'notebook' || a.accessory === 'tablet' ? 'hold' : 'down'

  switch (state) {
    case 'walking':
      bob = frame % 2 === 1 ? -1 : 0
      arms = idleArms
      legs = walkLegs(bob, frame)
      break
    case 'working':
      arms = 'typing'
      legs = sitLegs(0)
      break
    case 'thinking':
      arms = 'chin'
      bob = frame % 2
      legs = standLegs(bob)
      break
    case 'talking':
      arms = 'gesture'
      mouthOpen = frame % 2 === 1
      bob = frame % 2
      legs = standLegs(bob)
      break
    case 'success':
      arms = 'up'
      mouthOpen = true
      bob = frame % 2 === 0 ? -1 : 0
      legs = standLegs(bob)
      break
    case 'error':
      arms = idleArms
      bob = frame % 2
      legs = standLegs(bob)
      break
    case 'waiting':
    case 'idle':
    default:
      // Breathing: the whole upper body drifts a single pixel.
      bob = frame % 2
      arms = idleArms
      legs = standLegs(bob)
      break
  }

  return [
    ...torso(a, facing, bob, arms, frame),
    ...head(a, facing, bob, mouthOpen),
    ...legs,
    ...accessory(a, bob, arms)
  ]
}
