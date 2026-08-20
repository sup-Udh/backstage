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

    /*
     * Facial hair, which is usually the hair darkened and occasionally not.
     * A grey beard under dark hair is a whole character by itself, so it gets
     * its own entry rather than being derived and then fought with.
     */
    facialHair: a.facialHairColor ?? tint(a.hair, -0.28),

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
 * Head geometry.
 *
 * Narrow, so the shoulders always win the silhouette — but no longer identical
 * for everybody. Width, jaw and the placement of every feature are derived per
 * character, because hair and clothing were carrying the whole identity: two
 * characters with different hair still had the same face underneath, and at
 * sprite size a cast read as one person in eight wigs.
 *
 * The centre line stays at x=10 whatever the width, so the nose, mouth and
 * neck line up with the torso for everyone.
 */
const HEAD_Y = 2
const HEAD_H = 9
const CENTRE = 10

interface Head {
  /** Left edge and width of the skull. */
  x: number
  w: number
  /** Top of the skull, already offset by the frame's bob. */
  y: number
  h: number
  /** Vertical centre line. Always 10. */
  cx: number
}

function headGeom(a: CharacterAppearance, dy: number): Head {
  // 7 / 8 / 9 wide. One pixel either side of the head is clearly visible at
  // this size, which is why the steps are single pixels where the shoulders'
  // are not.
  const w = a.faceWidth === 'narrow' ? 7 : a.faceWidth === 'wide' ? 9 : 8
  return { x: CENTRE - (w >> 1), w, y: HEAD_Y + dy, h: HEAD_H, cx: CENTRE }
}

/**
 * Where each eye's left edge sits.
 *
 * The pair is centred as a unit and then the gap opened out from there, which
 * is the only way to keep both eyes on the face: measuring each one out from
 * the centre line independently put a wide-set eye on a narrow head straight
 * through the outline and onto the ear.
 *
 * The gap is also capped by what the head can hold. A narrow face cannot have
 * wide-set eyes — there is nowhere for them to go — so it gets the widest
 * spacing that fits instead of one that does not.
 */
function eyeColumns(a: CharacterAppearance, head: Head): { l: number; r: number } {
  const wanted = a.eyeSpacing === 'close' ? 1 : a.eyeSpacing === 'wide' ? 3 : 2
  const gap = Math.max(1, Math.min(wanted, head.w - EYE_W * 2))

  const span = gap + EYE_W * 2
  const l = head.cx - Math.floor(span / 2)
  return { l, r: l + EYE_W + gap }
}

const EYE_W = 2

/**
 * Hair, drawn in two passes: `back` sits behind the head (length, volume) and
 * `front` over it (fringe, parting). Splitting them is what lets a silhouette
 * extend past the skull without covering the face — which is most of what
 * makes one character distinguishable from another at this size.
 */
function hairBack(a: CharacterAppearance, h: Head): Op[] {
  const { x, w, y } = h
  const right = x + w

  switch (a.hairStyle) {
    case 'long':
      return [
        [x - 3, y + 1, 3, 15, 'ink'],
        [right, y + 1, 3, 15, 'ink'],
        [x - 2, y + 2, 2, 13, 'hairShade'],
        [right, y + 2, 2, 13, 'hairDeep'],
        [x - 2, y + 2, 2, 5, 'hair']
      ]
    case 'waves':
      // Shoulder-length, but the volume is at the sides rather than the length
      // — a wider outline than 'long' and a shorter one.
      return [
        [x - 3, y + 1, 3, 10, 'ink'],
        [right, y + 1, 3, 10, 'ink'],
        [x - 3, y + 3, 2, 7, 'hair'],
        [right + 1, y + 3, 2, 7, 'hairShade'],
        [x - 4, y + 4, 1, 4, 'ink'],
        [right + 3, y + 4, 1, 4, 'ink']
      ]
    case 'bob':
      return [
        [x - 2, y + 1, 2, 10, 'ink'],
        [right, y + 1, 2, 10, 'ink'],
        [x - 2, y + 2, 2, 8, 'hairShade'],
        [right, y + 2, 2, 8, 'hairDeep']
      ]
    case 'ponytail':
      // A long tail well clear of the shoulder line.
      return [
        [right - 1, y + 1, 5, 4, 'ink'],
        [right + 1, y + 3, 4, 11, 'ink'],
        [right, y + 2, 3, 3, 'hair'],
        [right + 2, y + 4, 2, 9, 'hairShade'],
        [right + 2, y + 11, 2, 2, 'hairDeep']
      ]
    /*
     * Everything below reaches at most two rows above the skull. That is all
     * the headroom the cell has once the bob is accounted for, and a pixel
     * past it lands in the pose above rather than being clipped.
     */
    case 'bun':
      // Sits proud of the head so the outline has a bump only they have.
      return [
        [x + 1, y - 2, w - 1, 4, 'ink'],
        [x + 2, y - 1, w - 3, 3, 'hair'],
        [x + 2, y - 1, w - 3, 1, 'hairLit'],
        [x + w - 3, y - 1, 2, 3, 'hairShade']
      ]
    case 'topknot':
      // Gathered high and narrow: a spike nobody else in a cast will have.
      return [
        [h.cx - 2, y - 2, 4, 4, 'ink'],
        [h.cx - 1, y - 2, 2, 4, 'hair'],
        [h.cx - 1, y - 2, 2, 1, 'hairLit'],
        [h.cx, y - 1, 1, 3, 'hairShade']
      ]
    case 'afro':
      // Round and wide. The broadest silhouette any cast has — the volume goes
      // sideways, because sideways is where the room is.
      return [
        [x - 3, y - 2, w + 6, 9, 'ink'],
        [x - 2, y - 1, w + 4, 7, 'hair'],
        [x - 1, y - 2, w + 2, 2, 'hair'],
        [x - 2, y - 1, 3, 4, 'hairLit'],
        [x + w - 1, y - 1, 3, 6, 'hairShade']
      ]
    case 'curly':
      return [
        [x - 3, y - 1, 5, 6, 'ink'],
        [x + w - 2, y - 1, 5, 6, 'ink'],
        [x - 2, y, 3, 4, 'hair'],
        [x + w - 1, y, 3, 4, 'hairShade'],
        [x - 1, y - 2, 4, 3, 'ink'],
        [x + w - 3, y - 2, 4, 3, 'ink'],
        [x, y - 1, 2, 2, 'hair'],
        [x + w - 2, y - 1, 2, 2, 'hairShade']
      ]
    case 'messy':
      return [
        [x - 2, y - 2, 3, 4, 'ink'],
        [x + w - 1, y - 2, 3, 4, 'ink'],
        [x - 2, y - 1, 2, 3, 'hair'],
        [right, y - 1, 2, 3, 'hairShade'],
        [x + 2, y - 2, 4, 2, 'ink'],
        [x + 3, y - 1, 2, 2, 'hair']
      ]
    default:
      return []
  }
}

function hairFront(a: CharacterAppearance, h: Head): Op[] {
  const { x, w, y } = h
  const ops: Op[] = []

  /*
   * A bald head has no cap at all — the skull is the silhouette, and drawing
   * one in skin tones would be drawing hair the colour of a forehead.
   */
  if (a.hairStyle === 'bald') {
    ops.push([x + 1, y, w - 2, 1, 'skinLit'])
    return ops
  }

  /*
   * The cap every style shares, so the skull reads as one shape.
   *
   * Two rows, not three. The head is nine rows tall and the features need
   * five of them — brow, two of eye, nose, mouth — so a three-row cap plus a
   * fringe left the brow with nowhere to move and every expression pushed it
   * into the hair. Two rows buys a row of forehead, which is what lets a
   * raised brow read as a raised brow.
   */
  ops.push([x, y, w, 2, 'hair'])
  ops.push([x, y, w, 1, 'hairLit'])
  ops.push([x + w - 2, y + 1, 2, 1, 'hairShade'])

  switch (a.hairStyle) {
    case 'swept':
      // Side parting: thick over one brow, sweeping across and thinning.
      ops.push([x, y + 2, w - 3, 1, 'hair'])
      ops.push([x, y + 2, 3, 1, 'hairLit'])
      ops.push([x + w - 3, y + 2, 3, 1, 'hairShade'])
      break
    case 'parted':
      /*
       * A hard parting: a full fringe with one column of shadow cut through
       * it. The clearest hairline of any style, and the reason it exists — a
       * face needs somewhere the hair visibly stops.
       */
      ops.push([x, y + 2, w, 1, 'hair'])
      ops.push([x, y + 1, 3, 2, 'hairLit'])
      ops.push([x + 2, y, 1, 3, 'hairDeep'])
      ops.push([x + 3, y + 2, w - 3, 1, 'hairShade'])
      break
    case 'slick':
      // Combed flat back: the hairline is a hard horizontal edge.
      ops.push([x, y + 2, w, 1, 'hairShade'])
      ops.push([x + 1, y, w - 3, 1, 'hairLit'])
      break
    case 'short':
      ops.push([x, y + 2, w, 1, 'hair'])
      ops.push([x, y + 2, 3, 1, 'hairLit'])
      break
    case 'buzz':
      // Cropped: no fringe at all, so the whole forehead and the skull's
      // shape are visible. The most face of any style.
      ops.push([x, y + 1, w, 1, 'hairShade'])
      break
    case 'messy':
      // Uneven: the fringe covers one side and not the other.
      ops.push([x, y + 2, 3, 1, 'hair'])
      ops.push([x + 4, y + 2, w - 4, 1, 'hairShade'])
      break
    case 'curly':
    case 'afro':
      ops.push([x, y + 2, w, 1, 'hair'])
      ops.push([x + 1, y + 1, 2, 1, 'hairLit'])
      ops.push([x + w - 3, y + 1, 2, 1, 'hairLit'])
      break
    case 'waves':
      ops.push([x, y + 2, w, 1, 'hair'])
      ops.push([x + 1, y + 2, 2, 1, 'hairLit'])
      ops.push([x + w - 4, y + 1, 3, 2, 'hairShade'])
      break
    default:
      ops.push([x, y + 2, w, 1, 'hair'])
      ops.push([x, y + 2, 3, 1, 'hairLit'])
      break
  }
  return ops
}

/**
 * Brows.
 *
 * The single most expressive two pixels on the sprite, and now the most
 * *identifying* — shape comes from the character and only the offsets come
 * from their mood, so a sceptical Wainwright and a sceptical Bertram do not
 * arrive at the same eyebrows.
 */
function brows(a: CharacterAppearance, exp: Expression, h: Head): Op[] {
  const { l, r } = eyeColumns(a, h)
  const y = h.y + 4
  const shape = a.browShape ?? 'flat'

  // Mood raises or lowers the whole brow line, and tilts it.
  const lift = exp === 'friendly' ? -1 : 0
  const inner = exp === 'serious' || exp === 'focused' ? 1 : 0
  // One brow a pixel higher. The whole read of "sceptical" is that offset.
  const cocked = exp === 'skeptical' ? -1 : 0

  const ops: Op[] = []
  const colour = a.facialHairColor && shape === 'heavy' ? 'facialHair' : 'hairShade'

  if (shape === 'heavy') {
    /*
     * Two rows of brow, sitting on the forehead rather than on the eyes, and
     * exactly as wide as the eye beneath it.
     *
     * Both of those are corrections. Starting on the brow row put the lower
     * half through the eye, and running a pixel wider than the eye meant that
     * on a close-set face the two brows met in the middle — a unibrow on every
     * heavy-browed character, which is not what "heavy" was supposed to mean.
     */
    ops.push([l, y - 1 + lift + cocked, EYE_W, 2, colour])
    ops.push([r, y - 1 + lift, EYE_W, 2, colour])
  } else if (shape === 'angled') {
    // Inner ends dropped: permanently unimpressed.
    ops.push([l, y - 1 + lift + cocked, EYE_W, 1, colour])
    ops.push([l + EYE_W - 1, y + lift + cocked, 1, 1, colour])
    ops.push([r + 1, y - 1 + lift, EYE_W - 1, 1, colour])
    ops.push([r, y + lift, 1, 1, colour])
  } else if (shape === 'arched') {
    // Outer ends dropped, middle raised: open and a little surprised.
    ops.push([l, y + lift + cocked, 1, 1, colour])
    ops.push([l + 1, y - 1 + lift + cocked, EYE_W - 1, 1, colour])
    ops.push([r, y - 1 + lift, EYE_W - 1, 1, colour])
    ops.push([r + EYE_W - 1, y + lift, 1, 1, colour])
  } else {
    ops.push([l, y + lift + inner + cocked, EYE_W, 1, colour])
    ops.push([r, y + lift + inner, EYE_W, 1, colour])
  }

  // Tired eyes carry a shadow under them as well as a flat brow.
  if (exp === 'tired') {
    ops.push([l, y + 3, EYE_W, 1, 'skinShade'])
    ops.push([r, y + 3, EYE_W, 1, 'skinShade'])
  }
  return ops
}

function eyes(a: CharacterAppearance, exp: Expression, h: Head): Op[] {
  const { l, r } = eyeColumns(a, h)
  const y = h.y + 5
  const ops: Op[] = []

  if (exp === 'friendly' || exp === 'tired') {
    // Creased shut: a flat line rather than a pupil.
    ops.push([l, y + 1, EYE_W, 1, 'ink'])
    ops.push([r, y + 1, EYE_W, 1, 'ink'])
  } else {
    ops.push([l, y, EYE_W, 2, 'white'])
    ops.push([r, y, EYE_W, 2, 'white'])
    // Pupils, both looking the same way so the gaze is not cross-eyed.
    ops.push([l + 1, y, 1, 2, 'ink'])
    ops.push([r + 1, y, 1, 2, 'ink'])
  }

  if (a.glasses) {
    // Frames sit around the eyes wherever they ended up, and the bridge spans
    // whatever gap the character actually has.
    ops.push([l - 1, y - 1, EYE_W + 2, 4, 'ink2'])
    ops.push([r - 1, y - 1, EYE_W + 2, 4, 'ink2'])
    ops.push([l, y, EYE_W, 2, 'white'])
    ops.push([r, y, EYE_W, 2, 'white'])
    ops.push([l + 1, y, 1, 2, 'ink'])
    ops.push([r + 1, y, 1, 2, 'ink'])
    const bridge = r - 1 - (l + EYE_W + 1)
    if (bridge > 0) ops.push([l + EYE_W + 1, y, bridge, 1, 'ink2'])
  }
  return ops
}

/** One to two pixels, and the difference between three different faces. */
function nose(a: CharacterAppearance, h: Head): Op[] {
  const y = h.y + 7
  switch (a.noseShape ?? 'small') {
    case 'straight':
      return [
        [h.cx, y - 1, 1, 2, 'skinShade'],
        [h.cx, y, 1, 1, 'skinDeep']
      ]
    case 'broad':
      return [
        [h.cx - 1, y, 2, 1, 'skinShade'],
        [h.cx - 1, y, 1, 1, 'skinDeep']
      ]
    default:
      return [[h.cx, y, 1, 1, 'skinShade']]
  }
}

/**
 * The bottom of the head.
 *
 * Whether a face reads as soft or hard is decided almost entirely here, in the
 * last two rows — which is why it is worth having three of them rather than
 * shading every chin the same way.
 */
function jawLine(a: CharacterAppearance, h: Head): Op[] {
  const { x, w, y } = h
  const bottom = y + h.h - 1

  switch (a.jaw ?? 'soft') {
    case 'square':
      // Full width to the chin, flat across: heavy and deliberate.
      return [[x, bottom, w, 1, 'skinShade']]
    case 'narrow':
      // Tapered: the last row is inset a pixel on each side.
      return [
        [x, bottom, 1, 1, 'none'],
        [x + w - 1, bottom, 1, 1, 'none'],
        [x + 1, bottom, w - 2, 1, 'skinShade'],
        [x, bottom - 1, 1, 1, 'skinShade'],
        [x + w - 1, bottom - 1, 1, 1, 'skinShade']
      ]
    default:
      // Rounded: shaded corners only, so the chin reads as curved.
      return [
        [x, bottom, 2, 1, 'skinShade'],
        [x + w - 2, bottom, 2, 1, 'skinShade']
      ]
  }
}

function beard(a: CharacterAppearance, h: Head): Op[] {
  const { x, w, y } = h
  const chin = y + h.h - 1
  const colour = a.facialHairColor ? 'facialHair' : 'hairShade'

  switch (a.facialHair ?? 'none') {
    case 'stubble':
      // Speckled rather than solid, so it reads as growth and not as a beard.
      return [
        [x + 1, chin, w - 2, 1, colour],
        [x, chin - 1, 1, 1, colour],
        [x + w - 1, chin - 1, 1, 1, colour]
      ]
    case 'moustache':
      return [[h.cx - 2, y + 7, 4, 1, colour]]
    case 'goatee':
      return [
        [h.cx - 1, y + 8, 3, 1, colour],
        [h.cx - 1, chin, 3, 1, colour]
      ]
    case 'beard':
      // Down the jaw and across the chin: the tallest facial silhouette.
      return [
        [x, y + 6, 1, 3, colour],
        [x + w - 1, y + 6, 1, 3, colour],
        [x, chin, w, 1, colour],
        [x + 1, chin + 1, w - 2, 1, 'ink'],
        [h.cx - 2, y + 7, 4, 1, colour]
      ]
    default:
      return []
  }
}

function head(
  a: CharacterAppearance,
  facing: SpriteFacing,
  dy: number,
  mouthOpen: boolean
): Op[] {
  const exp = expressionOf(a)
  const h = headGeom(a, dy)
  const { x, w, y } = h
  const ops: Op[] = []

  ops.push(...hairBack(a, h))

  if (facing === 'up') {
    ops.push([x - 1, y - 1, w + 2, h.h + 2, 'ink'])
    const crown = a.hairStyle === 'bald' ? 'skin' : 'hair'
    ops.push([x, y, w, h.h, crown])
    ops.push([x, y, w, 1, a.hairStyle === 'bald' ? 'skinLit' : 'hairLit'])
    ops.push([x + w - 2, y, 2, h.h, a.hairStyle === 'bald' ? 'skinShade' : 'hairShade'])
    ops.push([x - 1, y + 5, 1, 2, 'skinShade'])
    ops.push([x + w, y + 5, 1, 2, 'skinShade'])
    return ops
  }

  if (facing === 'side') {
    ops.push([x - 1, y - 1, w + 2, h.h + 2, 'ink'])
    ops.push([x, y, w, h.h, 'skin'])
    if (a.hairStyle !== 'bald') {
      ops.push([x, y, w, 3, 'hair'])
      ops.push([x, y, 5, 1, 'hairLit'])
      ops.push([x, y + 3, 3, 6, 'hair'])
    }
    ops.push([x + w - 1, y + 2, 1, 7, 'skinShade'])
    // The nose in profile is the one place it breaks the silhouette.
    ops.push([x + w, y + 5, 1, a.noseShape === 'broad' ? 2 : 1, 'skin'])
    ops.push([x + w - 3, y + 5, 2, 2, 'white'])
    ops.push([x + w - 2, y + 5, 1, 2, 'ink'])
    ops.push([x + w - 3, y + 4, 2, 1, 'hairShade'])
    if (a.glasses) ops.push([x + w - 4, y + 4, 4, 1, 'ink2'])
    ops.push([x + w - 3, y + 8, 2, 1, mouthOpen ? 'ink' : 'skinShade'])
    ops.push([x + 2, y + 5, 2, 2, 'skinShade']) // ear
    ops.push(...beard(a, h))
    return ops
  }

  // Front view.
  ops.push([x - 1, y - 1, w + 2, h.h + 2, 'ink'])
  ops.push([x, y, w, h.h, 'skin'])
  ops.push([x, y, w, 1, 'skinLit'])
  // Cheek, lit from the upper left.
  ops.push([x + w - 1, y + 1, 1, h.h - 1, 'skinShade'])
  ops.push(...jawLine(a, h))
  // Ears.
  ops.push([x - 1, y + 4, 1, 2, 'skin'])
  ops.push([x + w, y + 4, 1, 2, 'skinShade'])

  ops.push(...nose(a, h))
  ops.push(...hairFront(a, h))
  ops.push(...brows(a, exp, h))
  ops.push(...eyes(a, exp, h))
  ops.push(...mouth(exp, h, mouthOpen))
  ops.push(...beard(a, h))
  return ops
}

function mouth(exp: Expression, h: Head, open: boolean): Op[] {
  const y = h.y + 8
  const x = h.cx - 1
  if (open) return [[x - 1, y - 1, 3, 2, 'ink']]

  switch (exp) {
    case 'smirk':
      // Level on one side, lifted on the other. Half a smile, deliberately.
      return [
        [x - 1, y, 3, 1, 'skinShade'],
        [x + 2, y - 1, 1, 1, 'skinShade']
      ]
    case 'friendly':
      return [
        [x - 1, y, 4, 1, 'skinShade'],
        [x - 2, y - 1, 1, 1, 'skinShade'],
        [x + 3, y - 1, 1, 1, 'skinShade']
      ]
    case 'serious':
      return [[x - 1, y, 4, 1, 'skinDeep']]
    default:
      return [[x - 1, y, 3, 1, 'skinShade']]
  }
}

function expressionOf(a: CharacterAppearance): Expression {
  if (a.expression) return a.expression
  return a.mouth === 'smirk' ? 'smirk' : 'calm'
}

/* --------------------------------------------------------------- torso --- */

type ArmPose = 'down' | 'typing' | 'chin' | 'gesture' | 'up' | 'hold'

/** How much room a held object needs beside the hand, in pixels. */
const HELD_W = 4

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

  // Anything worn on the head has to follow the head, which is no longer the
  // same width for everybody.
  const h = headGeom(a, dy)

  /*
   * Where a held object may start, so it still fits.
   *
   * Broad shoulders put the hand far enough out that a mug or a briefcase ran
   * off the side of the cell — and the sheet packs frames side by side, so
   * that pixel appears in the next frame of the walk rather than being
   * clipped. Held items are tucked back against the body instead.
   */
  const heldRight = Math.min(left + w, SPRITE_W - HELD_W)
  const heldLeft = Math.max(left, HELD_W)

  switch (a.accessory ?? 'none') {
    case 'headphones':
      // Band over the hair, cups at the ears: unmistakable in silhouette.
      ops.push([h.x - 1, dy, h.w + 2, 2, 'ink'])
      ops.push([h.x, dy, h.w, 1, 'accShade'])
      ops.push([h.x - 3, 5 + dy, 3, 4, 'ink'])
      ops.push([h.x + h.w, 5 + dy, 3, 4, 'ink'])
      ops.push([h.x - 2, 6 + dy, 2, 2, 'acc'])
      ops.push([h.x + h.w + 1, 6 + dy, 2, 2, 'accShade'])
      break
    case 'notebook':
      if (free) {
        ops.push([heldLeft - 4, handY - 1, 4, 5, 'ink'])
        ops.push([heldLeft - 3, handY, 2, 3, 'white'])
        ops.push([heldLeft - 3, handY, 2, 1, 'acc'])
      }
      break
    case 'tablet':
      if (free) {
        ops.push([heldRight, handY - 2, 4, 6, 'ink'])
        ops.push([heldRight + 1, handY - 1, 2, 4, 'ink2'])
        ops.push([heldRight + 1, handY, 2, 1, 'acc'])
      }
      break
    case 'mug':
      if (arms !== 'up') {
        ops.push([heldRight, handY, 4, 4, 'ink'])
        ops.push([heldRight + 1, handY + 1, 2, 2, 'white'])
        ops.push([heldRight + 3, handY + 1, 1, 1, 'ink'])
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
        const bx = Math.min(left + w, SPRITE_W - 5)
        ops.push([bx, handY + 2, 5, 5, 'ink'])
        ops.push([bx + 1, handY + 3, 3, 3, 'accShade'])
        ops.push([bx + 2, handY + 1, 1, 1, 'ink'])
      }
      break
    case 'earpiece':
      ops.push([h.x + h.w, 5 + dy, 2, 3, 'ink'])
      ops.push([h.x + h.w, 6 + dy, 1, 1, 'accLit'])
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
  /*
   * The bob never goes negative.
   *
   * It used to lift the upper body by a pixel on alternate frames, which is
   * visually identical to dropping it on the others — and is the difference
   * between having two rows of headroom above the skull and having one. Tall
   * hair needs those two rows: a bun, a topknot and an afro all sit proud of
   * the head, and the sheet packs frames directly above one another, so a
   * pixel that escapes the cell is not clipped, it appears in somebody else's
   * pose.
   */
  let bob = 0
  let arms: ArmPose = 'down'
  let mouthOpen = false
  let legs: Op[]

  const idleArms: ArmPose =
    a.accessory === 'notebook' || a.accessory === 'tablet' ? 'hold' : 'down'

  switch (state) {
    case 'walking':
      bob = frame % 2 === 1 ? 0 : 1
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
      bob = frame % 2 === 0 ? 0 : 1
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
