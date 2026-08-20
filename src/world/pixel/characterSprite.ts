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
 *   y2..y10   head — 8 wide, narrower than the shoulders
 *   y11       neck
 *   y12..y20  torso, shoulders and arms
 *   y21..y26  legs, with a visible gap between them
 *   y27..y28  feet
 *
 * The head is deliberately narrower than the torso. An equal-width head and
 * body is what made the first attempt read as a rectangle rather than a
 * person, and no amount of detail rescues a silhouette that shape.
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

/** Head geometry. Narrow, so the shoulders always win the silhouette. */
const HEAD_X = 6
const HEAD_W = 8
const HEAD_Y = 2
const HEAD_H = 9

/**
 * Hair, drawn in two passes: `back` sits behind the head (length, volume) and
 * `front` over it (fringe, parting). Splitting them is what lets a silhouette
 * extend past the skull without covering the face — which is most of what
 * makes one character distinguishable from another at this size.
 */
function hairBack(a: CharacterAppearance, dy: number): Op[] {
  const y = HEAD_Y + dy
  switch (a.hairStyle) {
    case 'long':
      return [
        [3, y + 1, 3, 15, 'ink'],
        [14, y + 1, 3, 15, 'ink'],
        [4, y + 2, 2, 13, 'hairShade'],
        [14, y + 2, 2, 13, 'hairDeep'],
        [4, y + 2, 2, 5, 'hair']
      ]
    case 'bob':
      return [
        [4, y + 1, 2, 10, 'ink'],
        [14, y + 1, 2, 10, 'ink'],
        [4, y + 2, 2, 8, 'hairShade'],
        [14, y + 2, 2, 8, 'hairDeep']
      ]
    case 'ponytail':
      // A long tail well clear of the shoulder line.
      return [
        [13, y + 1, 5, 4, 'ink'],
        [15, y + 3, 4, 11, 'ink'],
        [14, y + 2, 3, 3, 'hair'],
        [16, y + 4, 2, 9, 'hairShade'],
        [16, y + 11, 2, 2, 'hairDeep']
      ]
    case 'bun':
      // Sits proud of the head so the outline has a bump only she has.
      return [
        [7, y - 5, 7, 6, 'ink'],
        [8, y - 4, 5, 4, 'hair'],
        [8, y - 4, 5, 1, 'hairLit'],
        [11, y - 4, 2, 4, 'hairShade']
      ]
    case 'curly':
      return [
        [3, y - 1, 5, 6, 'ink'],
        [12, y - 1, 5, 6, 'ink'],
        [4, y, 3, 4, 'hair'],
        [13, y, 3, 4, 'hairShade'],
        [5, y - 2, 4, 3, 'ink'],
        [11, y - 2, 4, 3, 'ink'],
        [6, y - 1, 2, 2, 'hair'],
        [12, y - 1, 2, 2, 'hairShade']
      ]
    case 'messy':
      return [
        [4, y - 2, 3, 4, 'ink'],
        [13, y - 2, 3, 4, 'ink'],
        [4, y - 1, 2, 3, 'hair'],
        [14, y - 1, 2, 3, 'hairShade'],
        [8, y - 3, 4, 3, 'ink'],
        [9, y - 2, 2, 2, 'hair']
      ]
    default:
      return []
  }
}

function hairFront(a: CharacterAppearance, dy: number): Op[] {
  const y = HEAD_Y + dy
  const ops: Op[] = []

  // The cap every style shares, so the skull reads as one shape.
  ops.push([HEAD_X, y, HEAD_W, 3, 'hair'])
  ops.push([HEAD_X, y, HEAD_W, 1, 'hairLit'])
  ops.push([HEAD_X + HEAD_W - 2, y + 1, 2, 2, 'hairShade'])

  switch (a.hairStyle) {
    case 'swept':
      // Side parting: thick over the left brow, sweeping right and thinning.
      ops.push([HEAD_X, y + 3, 5, 1, 'hair'])
      ops.push([HEAD_X, y + 3, 3, 1, 'hairLit'])
      ops.push([HEAD_X + 5, y + 3, 3, 1, 'hairShade'])
      break
    case 'slick':
      ops.push([HEAD_X, y + 3, HEAD_W, 1, 'hairShade'])
      ops.push([HEAD_X + 1, y, HEAD_W - 3, 1, 'hairLit'])
      break
    case 'short':
      ops.push([HEAD_X, y + 3, HEAD_W, 1, 'hair'])
      ops.push([HEAD_X, y + 3, 3, 1, 'hairLit'])
      break
    case 'buzz':
      // Cropped: the hair barely clears the brow, so the skull shape shows.
      ops.push([HEAD_X, y + 2, HEAD_W, 1, 'hairShade'])
      break
    case 'messy':
      ops.push([HEAD_X, y + 3, 3, 1, 'hair'])
      ops.push([HEAD_X + 4, y + 3, 4, 1, 'hairShade'])
      break
    case 'curly':
      ops.push([HEAD_X, y + 3, HEAD_W, 1, 'hair'])
      ops.push([HEAD_X + 1, y + 2, 2, 1, 'hairLit'])
      ops.push([HEAD_X + 5, y + 2, 2, 1, 'hairLit'])
      break
    default:
      ops.push([HEAD_X, y + 3, HEAD_W, 1, 'hair'])
      ops.push([HEAD_X, y + 3, 3, 1, 'hairLit'])
      break
  }
  return ops
}

/** Brows carry most of the expression at this size: one row, two clusters. */
function brows(exp: Expression, dy: number): Op[] {
  const y = HEAD_Y + 4 + dy
  const l = HEAD_X + 1
  const r = HEAD_X + 5
  switch (exp) {
    case 'serious':
    case 'focused':
      return [
        [l, y, 2, 1, 'hairShade'],
        [r, y, 2, 1, 'hairShade']
      ]
    case 'skeptical':
      // One brow a pixel higher. The whole read is that single offset.
      return [
        [l, y - 1, 2, 1, 'hairShade'],
        [r, y, 2, 1, 'hairShade']
      ]
    case 'friendly':
      return [
        [l, y - 1, 2, 1, 'hairShade'],
        [r, y - 1, 2, 1, 'hairShade']
      ]
    case 'tired':
      return [
        [l, y, 2, 1, 'hairShade'],
        [r, y, 2, 1, 'hairShade'],
        [l, y + 3, 2, 1, 'skinShade'],
        [r, y + 3, 2, 1, 'skinShade']
      ]
    default:
      return [
        [l, y, 2, 1, 'hairShade'],
        [r, y, 2, 1, 'hairShade']
      ]
  }
}

function eyes(a: CharacterAppearance, exp: Expression, dy: number): Op[] {
  const y = HEAD_Y + 5 + dy
  const l = HEAD_X + 1
  const r = HEAD_X + 5
  const ops: Op[] = []

  if (exp === 'friendly' || exp === 'tired') {
    // Creased shut: a flat line rather than a pupil.
    ops.push([l, y + 1, 2, 1, 'ink'])
    ops.push([r, y + 1, 2, 1, 'ink'])
  } else {
    ops.push([l, y, 2, 2, 'white'])
    ops.push([r, y, 2, 2, 'white'])
    ops.push([l + 1, y, 1, 2, 'ink'])
    ops.push([r + 1, y, 1, 2, 'ink'])
  }

  if (a.glasses) {
    ops.push([l - 1, y - 1, 4, 4, 'ink2'])
    ops.push([r - 1, y - 1, 4, 4, 'ink2'])
    ops.push([l, y, 2, 2, 'white'])
    ops.push([r, y, 2, 2, 'white'])
    ops.push([l + 1, y, 1, 2, 'ink'])
    ops.push([r + 1, y, 1, 2, 'ink'])
    ops.push([l + 3, y, 1, 1, 'ink2'])
  }
  return ops
}

function mouth(exp: Expression, dy: number, open: boolean): Op[] {
  const y = HEAD_Y + 8 + dy
  const x = HEAD_X + 2
  if (open) return [[x, y - 1, 3, 2, 'ink']]
  switch (exp) {
    case 'smirk':
      return [
        [x, y, 3, 1, 'skinShade'],
        [x + 3, y - 1, 1, 1, 'skinShade']
      ]
    case 'friendly':
      return [
        [x, y, 4, 1, 'skinShade'],
        [x - 1, y - 1, 1, 1, 'skinShade']
      ]
    case 'serious':
      return [[x, y, 4, 1, 'skinDeep']]
    default:
      return [[x, y, 3, 1, 'skinShade']]
  }
}

function head(
  a: CharacterAppearance,
  facing: SpriteFacing,
  dy: number,
  mouthOpen: boolean
): Op[] {
  const exp = expressionOf(a)
  const y = HEAD_Y + dy
  const ops: Op[] = []

  ops.push(...hairBack(a, dy))

  if (facing === 'up') {
    ops.push([HEAD_X - 1, y - 1, HEAD_W + 2, HEAD_H + 2, 'ink'])
    ops.push([HEAD_X, y, HEAD_W, HEAD_H, 'hair'])
    ops.push([HEAD_X, y, HEAD_W, 1, 'hairLit'])
    ops.push([HEAD_X + HEAD_W - 2, y, 2, HEAD_H, 'hairShade'])
    ops.push([HEAD_X - 1, y + 5, 1, 2, 'skinShade'])
    ops.push([HEAD_X + HEAD_W, y + 5, 1, 2, 'skinShade'])
    return ops
  }

  if (facing === 'side') {
    ops.push([HEAD_X - 1, y - 1, HEAD_W + 2, HEAD_H + 2, 'ink'])
    ops.push([HEAD_X, y, HEAD_W, HEAD_H, 'skin'])
    ops.push([HEAD_X, y, HEAD_W, 3, 'hair'])
    ops.push([HEAD_X, y, 5, 1, 'hairLit'])
    ops.push([HEAD_X, y + 3, 3, 6, 'hair'])
    ops.push([HEAD_X + HEAD_W - 1, y + 2, 1, 7, 'skinShade'])
    ops.push([HEAD_X + HEAD_W, y + 5, 1, 1, 'skin']) // nose
    ops.push([HEAD_X + 5, y + 5, 2, 2, 'white'])
    ops.push([HEAD_X + 6, y + 5, 1, 2, 'ink'])
    ops.push([HEAD_X + 5, y + 4, 2, 1, 'hairShade'])
    if (a.glasses) ops.push([HEAD_X + 4, y + 4, 4, 1, 'ink2'])
    ops.push([HEAD_X + 5, y + 8, 2, 1, mouthOpen ? 'ink' : 'skinShade'])
    ops.push([HEAD_X + 2, y + 5, 2, 2, 'skinShade']) // ear
    return ops
  }

  // Front view.
  ops.push([HEAD_X - 1, y - 1, HEAD_W + 2, HEAD_H + 2, 'ink'])
  ops.push([HEAD_X, y, HEAD_W, HEAD_H, 'skin'])
  ops.push([HEAD_X, y, HEAD_W, 1, 'skinLit'])
  // Cheek and jaw, lit from the upper left.
  ops.push([HEAD_X + HEAD_W - 1, y + 1, 1, HEAD_H - 1, 'skinShade'])
  ops.push([HEAD_X, y + HEAD_H - 1, 2, 1, 'skinShade'])
  ops.push([HEAD_X + HEAD_W - 2, y + HEAD_H - 1, 2, 1, 'skinShade'])
  // Ears.
  ops.push([HEAD_X - 1, y + 4, 1, 2, 'skin'])
  ops.push([HEAD_X + HEAD_W, y + 4, 1, 2, 'skinShade'])
  // Nose: one pixel of shadow on the centre line.
  ops.push([HEAD_X + 4, y + 7, 1, 1, 'skinShade'])

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

const TORSO_Y = 12
const TORSO_H = 9

interface Frame {
  /** Shoulder half-width from the centre line at x=10. */
  half: number
  /** Vertical offset of the whole upper body. */
  lean: number
}

function frameFor(a: CharacterAppearance): Frame {
  const build = a.build ?? 'regular'
  // 9 / 12 / 16 wide. The steps are deliberately large: a one-pixel
  // difference in shoulder width is invisible at sprite size.
  const half = build === 'slim' ? 4.5 : build === 'broad' ? 7 : 6
  switch (a.posture ?? 'upright') {
    case 'relaxed':
      return { half, lean: 1 }
    case 'rigid':
      return { half, lean: -1 }
    case 'slouched':
      return { half, lean: 1 }
    default:
      return { half, lean: 0 }
  }
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
  const y = TORSO_Y + dy + f.lean
  const left = Math.round(10 - f.half)
  const w = Math.round(f.half * 2)
  const style = a.outfitStyle ?? 'suit'
  // A coat hangs past the hips, which lengthens the silhouette.
  const bodyH = style === 'coat' || style === 'labcoat' ? TORSO_H + 3 : TORSO_H

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
  ops.push([9, 11 + dy, 3, 2, 'skinShade'])

  if (style === 'hoodie') {
    // The hood is the silhouette: a raised collar behind the neck.
    ops.push([left, y - 3, w, 4, 'ink'])
    ops.push([left + 1, y - 2, w - 2, 2, 'outfitShade'])
  }

  // Body block: outline, base, then light and shadow columns.
  ops.push([left - 1, y - 1, w + 2, bodyH + 1, 'ink'])
  ops.push([left, y, w, bodyH - 1, 'outfit'])
  ops.push([left, y, 2, bodyH - 1, 'outfitLit'])
  ops.push([left + w - 2, y, 2, bodyH - 1, 'outfitShade'])
  ops.push([left, y + bodyH - 2, w, 1, 'outfitDeep'])

  // Sleeves, a shade darker so the arms separate from the chest.
  ops.push([left, y + 2, 2, bodyH - 4, 'outfitShade'])
  ops.push([left + w - 2, y + 2, 2, bodyH - 4, 'outfitDeep'])

  if (style === 'hoodie') {
    ops.push([left + 2, y + 4, w - 4, 2, 'outfitShade'])
    ops.push([9, y, 1, 3, 'shirtLit'])
    ops.push([11, y, 1, 3, 'shirtLit'])
  } else if (style === 'cardigan') {
    ops.push([9, y, 3, bodyH - 1, 'shirt'])
    ops.push([9, y, 1, bodyH - 1, 'shirtShade'])
    ops.push([10, y + 2, 1, 1, 'acc'])
    ops.push([10, y + 5, 1, 1, 'acc'])
  } else {
    // Shirt showing in the jacket opening.
    ops.push([9, y, 3, 2, 'shirt'])
    ops.push([9, y, 3, 1, 'shirtLit'])
    if (a.vest) {
      ops.push([9, y + 2, 3, bodyH - 4, 'vest'])
      ops.push([11, y + 2, 1, bodyH - 4, 'vestShade'])
    }
    if (style === 'suit' || style === 'blazer' || style === 'vest' || style === 'coat') {
      // Lapels: the two diagonal pixels that make a jacket read as a jacket.
      ops.push([8, y, 1, 2, 'outfitLit'])
      ops.push([12, y, 1, 2, 'outfitShade'])
      ops.push([8, y + 2, 1, 1, 'outfitDeep'])
      ops.push([12, y + 2, 1, 1, 'outfitDeep'])
    }
  }

  if (a.accent) {
    ops.push([10, y + 1, 1, 1, 'accentShade'])
    ops.push([10, y + 2, 1, 4, 'accent'])
  }

  // Hands. Their position is the main read on what a character is doing.
  const handY = y + bodyH - 3
  if (arms === 'down') {
    ops.push([left, handY, 2, 2, 'skin'])
    ops.push([left + w - 2, handY, 2, 2, 'skinShade'])
  } else if (arms === 'typing') {
    const l = frame % 2 === 0 ? 0 : -1
    const r = frame % 2 === 0 ? -1 : 0
    ops.push([left + 1, handY + l, 2, 2, 'skin'])
    ops.push([left + w - 3, handY + r, 2, 2, 'skinShade'])
  } else if (arms === 'chin') {
    ops.push([left + w - 1, y, 2, bodyH - 2, 'ink'])
    ops.push([left + w - 1, y + 1, 2, bodyH - 4, 'outfitShade'])
    ops.push([12, 11 + dy - (frame % 2), 2, 2, 'skin'])
    ops.push([left, handY, 2, 2, 'skin'])
  } else if (arms === 'gesture') {
    ops.push([left, handY, 2, 2, 'skin'])
    ops.push([left + w - 1, y + 2 - (frame % 2), 3, 2, 'skin'])
  } else if (arms === 'hold') {
    ops.push([left + 1, handY, 2, 2, 'skin'])
    ops.push([left + w - 3, handY, 2, 2, 'skinShade'])
  }

  if (facing === 'side') {
    // Trim the far shoulder so the profile does not read as front-on.
    ops.push([left - 1, y - 1, 2, bodyH + 1, 'none'])
  }
  return ops
}

/* ------------------------------------------------------------ accessory -- */

/**
 * One memorable item per character, drawn last so it sits on top and can
 * break the silhouette — which is the point of having it. Everything here is
 * placed outside the torso block, so nothing ever covers the chest.
 */
function accessory(a: CharacterAppearance, dy: number, arms: ArmPose): Op[] {
  const f = frameFor(a)
  const y = TORSO_Y + dy + f.lean
  const left = Math.round(10 - f.half)
  const w = Math.round(f.half * 2)
  const ops: Op[] = []
  const handY = y + TORSO_H - 3
  const free = arms === 'down' || arms === 'hold'

  switch (a.accessory ?? 'none') {
    case 'headphones':
      // Band over the hair, cups at the ears: unmistakable in silhouette.
      ops.push([HEAD_X - 1, dy, HEAD_W + 2, 2, 'ink'])
      ops.push([HEAD_X, dy, HEAD_W, 1, 'accShade'])
      ops.push([HEAD_X - 3, 5 + dy, 3, 4, 'ink'])
      ops.push([HEAD_X + HEAD_W, 5 + dy, 3, 4, 'ink'])
      ops.push([HEAD_X - 2, 6 + dy, 2, 2, 'acc'])
      ops.push([HEAD_X + HEAD_W + 1, 6 + dy, 2, 2, 'accShade'])
      break
    case 'notebook':
      if (free) {
        ops.push([left - 4, handY - 1, 4, 5, 'ink'])
        ops.push([left - 3, handY, 2, 3, 'white'])
        ops.push([left - 3, handY, 2, 1, 'acc'])
      }
      break
    case 'tablet':
      if (free) {
        ops.push([left + w, handY - 2, 4, 6, 'ink'])
        ops.push([left + w + 1, handY - 1, 2, 4, 'ink2'])
        ops.push([left + w + 1, handY, 2, 1, 'acc'])
      }
      break
    case 'mug':
      if (arms !== 'up') {
        ops.push([left + w, handY, 4, 4, 'ink'])
        ops.push([left + w + 1, handY + 1, 2, 2, 'white'])
        ops.push([left + w + 3, handY + 1, 1, 1, 'ink'])
      }
      break
    case 'badge':
      ops.push([left + 1, y + 3, 2, 3, 'ink'])
      ops.push([left + 1, y + 4, 1, 1, 'acc'])
      break
    case 'scarf':
      ops.push([left, y - 2, w, 3, 'ink'])
      ops.push([left + 1, y - 1, w - 2, 2, 'acc'])
      ops.push([left + w - 3, y - 1, 2, 2, 'accShade'])
      ops.push([left + w - 2, y + 1, 2, 5, 'ink'])
      ops.push([left + w - 2, y + 1, 1, 4, 'acc'])
      break
    case 'briefcase':
      if (arms === 'down') {
        ops.push([left + w, handY + 2, 5, 5, 'ink'])
        ops.push([left + w + 1, handY + 3, 3, 3, 'accShade'])
        ops.push([left + w + 2, handY + 1, 1, 1, 'ink'])
      }
      break
    case 'earpiece':
      ops.push([HEAD_X + HEAD_W, 5 + dy, 2, 3, 'ink'])
      ops.push([HEAD_X + HEAD_W, 6 + dy, 1, 1, 'accLit'])
      break
    case 'pen':
      if (free) {
        ops.push([left - 2, handY - 1, 1, 4, 'acc'])
        ops.push([left - 2, handY - 1, 1, 1, 'ink'])
      }
      break
    default:
      break
  }
  return ops
}

/* ----------------------------------------------------------------- legs -- */

const LEG_Y = 21

/** Two legs with a two-pixel gap, so the lower body is never a solid slab. */
function standLegs(dy: number): Op[] {
  const y = LEG_Y + dy
  return [
    [5, y, 4, 6, 'ink'],
    [11, y, 4, 6, 'ink'],
    [6, y, 2, 5, 'trousers'],
    [12, y, 2, 5, 'trousersShade'],
    [6, y, 2, 1, 'trousers'],
    [5, y + 6, 5, 2, 'ink'],
    [10, y + 6, 5, 2, 'ink'],
    [6, y + 6, 3, 1, 'shoes'],
    [11, y + 6, 3, 1, 'shoes']
  ]
}

/** 4-frame walk cycle: neutral, left lift, neutral, right lift. */
function walkLegs(dy: number, frame: number): Op[] {
  const f = frame % 4
  if (f === 0 || f === 2) return standLegs(dy)
  const y = LEG_Y + dy
  const liftLeft = f === 1
  return [
    [5, y, 4, liftLeft ? 5 : 6, 'ink'],
    [11, y, 4, liftLeft ? 6 : 5, 'ink'],
    [6, y, 2, liftLeft ? 4 : 5, 'trousers'],
    [12, y, 2, liftLeft ? 5 : 4, 'trousersShade'],
    liftLeft ? [5, y + 5, 5, 2, 'ink'] : [5, y + 6, 5, 2, 'ink'],
    liftLeft ? [10, y + 6, 5, 2, 'ink'] : [10, y + 5, 5, 2, 'ink'],
    liftLeft ? [6, y + 5, 3, 1, 'shoes'] : [6, y + 6, 3, 1, 'shoes'],
    liftLeft ? [11, y + 6, 3, 1, 'shoes'] : [11, y + 5, 3, 1, 'shoes']
  ]
}

/** Seated: knees forward, so the legs read as folded rather than standing. */
function sitLegs(dy: number): Op[] {
  const y = LEG_Y + dy
  return [
    [5, y, 10, 4, 'ink'],
    [6, y + 1, 3, 2, 'trousers'],
    [11, y + 1, 3, 2, 'trousersShade'],
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
