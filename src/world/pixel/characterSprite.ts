import type { Op, Palette } from './ops'
import type {
  CharacterAppearance,
  CharacterState,
  Expression,
  Facing
} from '../../characters/character.types'
import { frameCount } from '../../characters/character.states'

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
 *
 * These twenty by thirty pixels are also, now, exactly what appears on screen.
 * The world used to resample them to 12x18 — a x0.6 nearest-neighbour
 * reduction, which does not "make a sprite smaller", it deletes two of every
 * five rows and columns. A brow is one pixel tall and an eye is two; a
 * reduction that drops rows at that ratio destroys a face's identity and keeps
 * whichever half of it the arithmetic happened to land on. Every character in
 * the app had a carefully specified face and none of them survived to the
 * screen. Characters are drawn 1:1 now, and the office reads as large by being
 * large rather than by shrinking the people in it.
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
  /** Vertical centre line, already offset by the frame's lean. */
  cx: number
}

function headGeom(a: CharacterAppearance, dy: number, dx = 0): Head {
  // 7 / 8 / 9 wide. One pixel either side of the head is clearly visible at
  // this size, which is why the steps are single pixels where the shoulders'
  // are not.
  const w = a.faceWidth === 'narrow' ? 7 : a.faceWidth === 'wide' ? 9 : 8
  const cx = CENTRE + dx
  return { x: cx - (w >> 1), w, y: HEAD_Y + dy, h: HEAD_H, cx }
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
 *
 * `mood` is the frame's own contribution on top of the character's: a raised
 * brow while thinking, a knitted one while an error is on the screen. It moves
 * the line by a pixel and never changes its shape, so a character's brow is
 * still recognisably theirs in every pose.
 */
function brows(
  a: CharacterAppearance,
  exp: Expression,
  h: Head,
  mood: BrowMood
): Op[] {
  const { l, r } = eyeColumns(a, h)
  const y = h.y + 4
  const shape = a.browShape ?? 'flat'

  // Mood raises or lowers the whole brow line, and tilts it.
  const lift = (exp === 'friendly' ? -1 : 0) + (mood === 'raised' ? -1 : 0)
  const inner =
    (exp === 'serious' || exp === 'focused' ? 1 : 0) + (mood === 'knit' ? 1 : 0)
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

/**
 * Eyes, and where they are looking.
 *
 * The pupil moves within the white rather than the whole eye moving, which is
 * a single pixel of difference and the whole reason a thinking character reads
 * as thinking: eyes up and off the screen is what people actually do when they
 * stop reading and start considering.
 */
function eyes(
  a: CharacterAppearance,
  exp: Expression,
  h: Head,
  gaze: Gaze
): Op[] {
  const { l, r } = eyeColumns(a, h)
  const y = h.y + 5
  const ops: Op[] = []

  const shut = gaze === 'blink' || exp === 'friendly' || exp === 'tired'

  if (shut) {
    // Creased shut: a flat line rather than a pupil.
    ops.push([l, y + 1, EYE_W, 1, 'ink'])
    ops.push([r, y + 1, EYE_W, 1, 'ink'])
  } else {
    ops.push([l, y, EYE_W, 2, 'white'])
    ops.push([r, y, EYE_W, 2, 'white'])

    /*
     * Pupils, both looking the same way so the gaze is never cross-eyed.
     * `up` and `down` move within the two rows of white; `side` moves within
     * the two columns. Off-grid gazes are not possible, which is what keeps
     * an eye from becoming a solid dark block at this size.
     */
    const px = gaze === 'side' ? 0 : 1
    const py = gaze === 'up' ? 0 : gaze === 'down' ? 1 : 0
    const ph = gaze === 'up' || gaze === 'down' ? 1 : 2
    ops.push([l + px, y + py, 1, ph, 'ink'])
    ops.push([r + px, y + py, 1, ph, 'ink'])
  }

  if (a.glasses) {
    // Frames sit around the eyes wherever they ended up, and the bridge spans
    // whatever gap the character actually has.
    ops.push([l - 1, y - 1, EYE_W + 2, 4, 'ink2'])
    ops.push([r - 1, y - 1, EYE_W + 2, 4, 'ink2'])
    ops.push([l, y, EYE_W, 2, 'white'])
    ops.push([r, y, EYE_W, 2, 'white'])
    if (shut) {
      ops.push([l, y + 1, EYE_W, 1, 'ink'])
      ops.push([r, y + 1, EYE_W, 1, 'ink'])
    } else {
      const px = gaze === 'side' ? 0 : 1
      const py = gaze === 'up' ? 0 : gaze === 'down' ? 1 : 0
      const ph = gaze === 'up' || gaze === 'down' ? 1 : 2
      ops.push([l + px, y + py, 1, ph, 'ink'])
      ops.push([r + px, y + py, 1, ph, 'ink'])
    }
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

/** Where the eyes are pointed this frame. */
type Gaze = 'ahead' | 'up' | 'down' | 'side' | 'blink'
/** The frame's contribution to the brow, on top of the character's own. */
type BrowMood = 'none' | 'raised' | 'knit'
/** The mouth this frame. `wide` is only used for a celebration. */
type Mouth = 'closed' | 'open' | 'wide'

interface Look {
  dy: number
  dx: number
  gaze: Gaze
  brow: BrowMood
  mouth: Mouth
}

function head(a: CharacterAppearance, facing: SpriteFacing, look: Look): Op[] {
  const exp = expressionOf(a)
  const h = headGeom(a, look.dy, look.dx)
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
    if (look.gaze === 'blink') {
      ops.push([x + w - 3, y + 6, 2, 1, 'ink'])
    } else {
      ops.push([x + w - 2, y + (look.gaze === 'up' ? 5 : 5), 1, 2, 'ink'])
    }
    ops.push([x + w - 3, y + 4 + (look.brow === 'raised' ? -1 : 0), 2, 1, 'hairShade'])
    if (a.glasses) ops.push([x + w - 4, y + 4, 4, 1, 'ink2'])
    ops.push([
      x + w - 3,
      y + 8,
      2,
      1,
      look.mouth === 'closed' ? 'skinShade' : 'ink'
    ])
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
  ops.push(...brows(a, exp, h, look.brow))
  ops.push(...eyes(a, exp, h, look.gaze))
  ops.push(...mouth(exp, h, look.mouth))
  ops.push(...beard(a, h))
  return ops
}

function mouth(exp: Expression, h: Head, m: Mouth): Op[] {
  const y = h.y + 8
  const x = h.cx - 1
  if (m === 'wide') return [[x - 1, y - 1, 4, 3, 'ink']]
  if (m === 'open') return [[x - 1, y - 1, 3, 2, 'ink']]

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

/**
 * What the arms are doing.
 *
 * Every one of these is a *readable silhouette* rather than a shade of the
 * same one. That is the whole test the old sprite failed: `working` and
 * `waiting` both drew a body with its arms at its sides and differed by one
 * pixel of hand, so the only thing telling the user which was which was the
 * word printed underneath.
 */
type ArmPose =
  /** Hanging at the sides. */
  | 'down'
  /** Swinging, for the walk cycle. Driven by the frame's `swing`. */
  | 'swing'
  /** Forward and low, on a keyboard. */
  | 'typing'
  /** One hand at the chin, the other folded across. */
  | 'chin'
  /** One hand raised and moving: speech. */
  | 'gesture'
  /** Both up: a celebration. */
  | 'up'
  /** Carrying the character's item. */
  | 'hold'
  /** Crossed. Reads as waiting from right across the room. */
  | 'folded'
  /** One arm out to a board or a wall. */
  | 'reach'
  /** Resting on the desk edge, off the keys. */
  | 'rest'
  /** One hand up at the temple, the body low: something went wrong. */
  | 'slump'

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

/**
 * The arms.
 *
 * Drawn as their own limbs rather than as two darker columns of the jacket,
 * which is what the sprite used to do. A column cannot swing, cannot fold and
 * cannot reach — so every pose that needed an arm to be somewhere had to be
 * expressed by moving a two-pixel hand, and none of them read.
 *
 * The upper arm hugs the torso's outer column and the forearm is what moves.
 * Both stay inside the cell for the widest build: broad shoulders put the
 * outer column at x=15..16, and a full swing outwards lands on 17 — one clear
 * of the edge.
 */
function arms(
  a: CharacterAppearance,
  facing: SpriteFacing,
  pose: ArmPose,
  swing: number,
  y: number,
  left: number,
  w: number,
  bodyH: number
): Op[] {
  const ops: Op[] = []
  const lx = left
  const rx = left + w - 2
  const shoulder = y + 1
  const handY = y + bodyH - 3

  /** One arm: sleeve from the shoulder down, then a hand. */
  const limb = (
    x: number,
    top: number,
    len: number,
    hx: number,
    hy: number,
    sleeve: string,
    skin: string
  ) => {
    if (len > 0) ops.push([x, top, 2, len, sleeve])
    ops.push([hx, hy, 2, 2, skin])
  }

  switch (pose) {
    case 'swing': {
      /*
       * Front-on, an arm swing is mostly depth, so it is drawn as the hands
       * rising and falling a pixel and the elbows opening a pixel outwards.
       * In profile it is the real thing: the forward arm crosses the body and
       * the trailing one clears the hip.
       */
      const s = Math.round(swing)
      if (facing === 'side') {
        limb(rx, shoulder, bodyH - 5, rx + s, handY - Math.abs(s), 'outfitShade', 'skin')
        limb(lx, shoulder, bodyH - 5, lx - s, handY - Math.abs(s), 'outfitDeep', 'skinShade')
      } else {
        limb(lx, shoulder, bodyH - 5, lx - (s > 0 ? 1 : 0), handY - (s > 0 ? 1 : 0), 'outfitShade', 'skin')
        limb(rx, shoulder, bodyH - 5, rx + (s < 0 ? 1 : 0), handY - (s < 0 ? 1 : 0), 'outfitDeep', 'skinShade')
      }
      break
    }

    case 'typing': {
      /*
       * Forearms angled in and forward, hands at the keyboard line — inside
       * the shoulders, not outside them, because that is where a keyboard is.
       * The two hands are driven from opposite ends of `swing` so they never
       * strike together, which is the single thing that makes typing read as
       * typing rather than as a twitch.
       */
      const l = swing > 0.5 ? 0 : 1
      const r = swing > 0.5 ? 1 : 0
      ops.push([lx, shoulder, 2, bodyH - 6, 'outfitShade'])
      ops.push([rx, shoulder, 2, bodyH - 6, 'outfitDeep'])
      ops.push([lx + 1, handY - 2, 2, 2, 'outfitShade'])
      ops.push([rx - 1, handY - 2, 2, 2, 'outfitDeep'])
      ops.push([lx + 2, handY - l, 2, 2, 'skin'])
      ops.push([rx - 2, handY - r, 2, 2, 'skinShade'])
      break
    }

    case 'rest': {
      // Off the keys, forearms laid on the desk edge, hands together.
      ops.push([lx, shoulder, 2, bodyH - 5, 'outfitShade'])
      ops.push([rx, shoulder, 2, bodyH - 5, 'outfitDeep'])
      ops.push([lx + 2, handY, 2, 2, 'skin'])
      ops.push([rx - 2, handY, 2, 2, 'skinShade'])
      break
    }

    case 'chin': {
      /*
       * One forearm folded across the chest, the other rising from it to the
       * chin. This is the pose the whole thinking state rests on, and it is
       * the only one where a hand appears above the shoulder line — which is
       * exactly why it is legible at twenty pixels.
       */
      ops.push([lx, shoulder, 2, bodyH - 5, 'outfitShade'])
      ops.push([lx + 2, y + bodyH - 5, w - 4, 2, 'outfitShade'])
      ops.push([rx, shoulder, 2, 3, 'outfitDeep'])
      // The forearm climbing to the face, and the hand at the chin.
      ops.push([rx - 1, y - 2 + Math.round(swing), 2, 5, 'outfitDeep'])
      ops.push([rx - 1, y - 3 + Math.round(swing), 2, 2, 'skin'])
      break
    }

    case 'gesture': {
      // One hand up and open, moving; the other stays down.
      const lift = Math.round(swing * 2)
      ops.push([lx, shoulder, 2, bodyH - 5, 'outfitShade'])
      ops.push([lx, handY, 2, 2, 'skin'])
      ops.push([rx, shoulder, 2, 3, 'outfitDeep'])
      ops.push([rx, y + 3 - lift, 2, 3, 'outfitDeep'])
      ops.push([rx + 1, y + 1 - lift, 2, 2, 'skinShade'])
      break
    }

    case 'reach': {
      // One arm out and up to a board; the body stays square to it.
      const lift = Math.round(swing * 2)
      ops.push([lx, shoulder, 2, bodyH - 5, 'outfitShade'])
      ops.push([lx, handY, 2, 2, 'skin'])
      ops.push([rx, y - 1 - lift, 2, 6, 'outfitDeep'])
      ops.push([rx + 1, y - 3 - lift, 2, 2, 'skinShade'])
      break
    }

    case 'folded': {
      // Crossed at the chest: two horizontal bars and two hands tucked in.
      ops.push([lx, shoulder, 2, 3, 'outfitShade'])
      ops.push([rx, shoulder, 2, 3, 'outfitDeep'])
      ops.push([lx, y + 4, w, 2, 'outfitShade'])
      ops.push([lx, y + 6, w - 2, 2, 'outfitDeep'])
      ops.push([lx + 1, y + 6, 2, 2, 'skin'])
      ops.push([rx, y + 4, 2, 2, 'skinShade'])
      break
    }

    case 'up': {
      const lift = Math.round(swing)
      ops.push([lx - 3, y - 4 + lift, 3, 7, 'ink'])
      ops.push([rx + 2, y - 4 + lift, 3, 7, 'ink'])
      ops.push([lx - 2, y - 3 + lift, 2, 5, 'outfit'])
      ops.push([rx + 2, y - 3 + lift, 2, 5, 'outfitShade'])
      ops.push([lx - 2, y - 3 + lift, 2, 1, 'skin'])
      ops.push([rx + 2, y - 3 + lift, 2, 1, 'skin'])
      break
    }

    case 'slump': {
      // One hand at the temple, the other hanging. Read as "not again".
      ops.push([lx, shoulder, 2, bodyH - 5, 'outfitShade'])
      ops.push([lx, handY, 2, 2, 'skin'])
      ops.push([rx, shoulder, 2, 2, 'outfitDeep'])
      ops.push([rx, y - 2, 2, 4, 'outfitDeep'])
      ops.push([rx - 1, y - 4, 2, 2, 'skinShade'])
      break
    }

    case 'hold': {
      ops.push([lx, shoulder, 2, bodyH - 5, 'outfitShade'])
      ops.push([rx, shoulder, 2, bodyH - 5, 'outfitDeep'])
      ops.push([lx + 1, handY, 2, 2, 'skin'])
      ops.push([rx - 1, handY, 2, 2, 'skinShade'])
      break
    }

    default: {
      ops.push([lx, shoulder, 2, bodyH - 5, 'outfitShade'])
      ops.push([rx, shoulder, 2, bodyH - 5, 'outfitDeep'])
      ops.push([lx, handY, 2, 2, 'skin'])
      ops.push([rx, handY, 2, 2, 'skinShade'])
      break
    }
  }
  return ops
}

function torso(
  a: CharacterAppearance,
  facing: SpriteFacing,
  dy: number,
  dx: number,
  arm: ArmPose,
  swing: number
): Op[] {
  const f = frameFor(a)
  const ops: Op[] = []
  const y = TORSO_Y + dy + f.lean
  const left = Math.round(10 + dx - f.half)
  const w = Math.round(f.half * 2)
  const style = a.outfitStyle ?? 'suit'
  // A coat hangs past the hips, which lengthens the silhouette.
  const bodyH = style === 'coat' || style === 'labcoat' ? TORSO_H + 3 : TORSO_H

  // Neck, in shadow under the jaw.
  ops.push([9 + dx, 11 + dy, 3, 2, 'skinShade'])

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

  if (style === 'hoodie') {
    ops.push([left + 2, y + 4, w - 4, 2, 'outfitShade'])
    ops.push([9 + dx, y, 1, 3, 'shirtLit'])
    ops.push([11 + dx, y, 1, 3, 'shirtLit'])
  } else if (style === 'cardigan') {
    ops.push([9 + dx, y, 3, bodyH - 1, 'shirt'])
    ops.push([9 + dx, y, 1, bodyH - 1, 'shirtShade'])
    ops.push([10 + dx, y + 2, 1, 1, 'acc'])
    ops.push([10 + dx, y + 5, 1, 1, 'acc'])
  } else {
    // Shirt showing in the jacket opening.
    ops.push([9 + dx, y, 3, 2, 'shirt'])
    ops.push([9 + dx, y, 3, 1, 'shirtLit'])
    if (a.vest) {
      ops.push([9 + dx, y + 2, 3, bodyH - 4, 'vest'])
      ops.push([11 + dx, y + 2, 1, bodyH - 4, 'vestShade'])
    }
    if (style === 'suit' || style === 'blazer' || style === 'vest' || style === 'coat') {
      // Lapels: the two diagonal pixels that make a jacket read as a jacket.
      ops.push([8 + dx, y, 1, 2, 'outfitLit'])
      ops.push([12 + dx, y, 1, 2, 'outfitShade'])
      ops.push([8 + dx, y + 2, 1, 1, 'outfitDeep'])
      ops.push([12 + dx, y + 2, 1, 1, 'outfitDeep'])
    }
  }

  if (a.accent) {
    ops.push([10 + dx, y + 1, 1, 1, 'accentShade'])
    ops.push([10 + dx, y + 2, 1, 4, 'accent'])
  }

  ops.push(...arms(a, facing, arm, swing, y, left, w, bodyH))

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
function accessory(
  a: CharacterAppearance,
  dy: number,
  dx: number,
  arm: ArmPose
): Op[] {
  const f = frameFor(a)
  const y = TORSO_Y + dy + f.lean
  const left = Math.round(10 + dx - f.half)
  const w = Math.round(f.half * 2)
  const ops: Op[] = []
  const handY = y + TORSO_H - 3
  const free = arm === 'down' || arm === 'hold'

  // Anything worn on the head has to follow the head, which is no longer the
  // same width for everybody.
  const h = headGeom(a, dy, dx)

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
      if (arm !== 'up' && arm !== 'typing' && arm !== 'folded') {
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
      if (arm === 'down' || arm === 'swing') {
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
/** The row the soles rest on. Feet occupy this row and the one below it. */
const GROUND = LEG_Y + 6

/**
 * Two legs with a two-pixel gap, so the lower body is never a solid slab.
 *
 * `bob` lowers the *hips* only: the feet stay on `GROUND` and the legs get
 * shorter. That is the difference between a character who is walking and one
 * who is being slid up and down the screen — which is what the previous cycle
 * did, because it moved the whole leg group including the shoes.
 */
function legPair(
  bob: number,
  liftL: number,
  liftR: number,
  offL: number,
  offR: number
): Op[] {
  const top = LEG_Y + bob
  const ops: Op[] = []

  const leg = (x: number, lift: number, trousers: string, shoe: string) => {
    const footTop = GROUND - lift
    const len = Math.max(1, footTop - top)
    ops.push([x, top, 4, len, 'ink'])
    ops.push([x + 1, top, 2, Math.max(1, len - 1), trousers])
    ops.push([x, footTop, 5, 2, 'ink'])
    ops.push([x + 1, footTop, 3, 1, shoe])
  }

  leg(5 + offL, liftL, 'trousers', 'shoes')
  leg(11 + offR, liftR, 'trousersShade', 'shoes')
  return ops
}

function standLegs(bob: number): Op[] {
  return legPair(bob, 0, 0, 0, 0)
}

/**
 * The walk cycle, as eight held poses.
 *
 * Contact, down, passing, up — twice, once per leg. The hips drop on `down`
 * and rise on `up`, which is where a walk gets its rhythm; the legs spread on
 * contact and close on passing, which is where it gets its stride. In profile
 * the spread is doubled and the trailing leg is drawn dark, so the two legs
 * read as one in front of the other rather than as a pair side by side.
 */
const WALK: { bob: number; liftL: number; liftR: number; spread: number }[] = [
  { bob: 1, liftL: 0, liftR: 0, spread: 1 },
  { bob: 2, liftL: 0, liftR: 0, spread: 1 },
  { bob: 1, liftL: 2, liftR: 0, spread: 0 },
  { bob: 0, liftL: 1, liftR: 0, spread: -1 },
  { bob: 1, liftL: 0, liftR: 0, spread: -1 },
  { bob: 2, liftL: 0, liftR: 0, spread: -1 },
  { bob: 1, liftL: 0, liftR: 2, spread: 0 },
  { bob: 0, liftL: 0, liftR: 1, spread: 1 }
]

function walkLegs(frame: number, side: boolean): Op[] {
  const s = WALK[frame % WALK.length]
  const spread = side ? s.spread * 2 : s.spread
  return legPair(s.bob, s.liftL, s.liftR, -spread, spread)
}

/** Seated: knees forward, so the legs read as folded rather than standing. */
function sitLegs(bob: number): Op[] {
  const y = LEG_Y + bob
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

/* ------------------------------------------------------------- postures -- */

/**
 * One frame of one state, as a set of held offsets.
 *
 * This table *is* the animation. Everything above it is a way of drawing a
 * body in a given attitude; everything below it is a way of getting the right
 * row out of a sprite sheet. The reason it is a table rather than a switch
 * full of `frame % 2` arithmetic is that a switch cannot be read: nobody
 * looking at `bob = frame % 2` can tell whether the resulting animation is
 * meant to be breathing or typing, and the old sprite had six states that were
 * all exactly that expression.
 *
 * Read a row across and it says what the character looks like at that moment.
 */
interface Posture {
  /** Whole-body drop, in pixels. Never negative: the cell has no headroom. */
  bob: number
  /** Horizontal shift of the upper body — turning, leaning, slumping. */
  lean: number
  /** Extra head-only drop, for a nod or a hang. */
  headDy: number
  /** Extra head-only shift, for a tilt. */
  headDx: number
  arm: ArmPose
  /** Free parameter the arm pose interprets: swing, lift, strike. */
  swing: number
  legs: 'stand' | 'walk' | 'sit'
  gaze: Gaze
  brow: BrowMood
  mouth: Mouth
}

/** Defaults, so a posture row only states what makes it different. */
function P(p: Partial<Posture>): Posture {
  return {
    bob: 0,
    lean: 0,
    headDy: 0,
    headDx: 0,
    arm: 'down',
    swing: 0,
    legs: 'stand',
    gaze: 'ahead',
    brow: 'none',
    mouth: 'closed',
    ...p
  }
}

/**
 * Every pose, frame by frame.
 *
 * The frame counts here have to match the clip lengths in `ANIMATIONS`, which
 * `assertPostures` below checks at module load — a state whose table is one
 * row short would otherwise silently freeze on its last frame.
 */
const POSTURES: Record<CharacterState, Posture[]> = {
  /* --- standing ------------------------------------------------------- */

  /** Breathing, a blink, and a glance around the room. */
  idle: [
    P({ bob: 0 }),
    P({ bob: 1 }),
    P({ bob: 1, gaze: 'blink' }),
    P({ bob: 0 }),
    P({ bob: 0, gaze: 'side', headDx: 1 }),
    P({ bob: 1 })
  ],

  walking: [
    P({ legs: 'walk', bob: 1, arm: 'swing', swing: 1 }),
    P({ legs: 'walk', bob: 2, arm: 'swing', swing: 1 }),
    P({ legs: 'walk', bob: 1, arm: 'swing', swing: 0 }),
    P({ legs: 'walk', bob: 0, arm: 'swing', swing: -1 }),
    P({ legs: 'walk', bob: 1, arm: 'swing', swing: -1 }),
    P({ legs: 'walk', bob: 2, arm: 'swing', swing: -1 }),
    P({ legs: 'walk', bob: 1, arm: 'swing', swing: 0 }),
    P({ legs: 'walk', bob: 0, arm: 'swing', swing: 1 })
  ],

  /** Standing work: reading a board, reaching up to it, marking it. */
  working: [
    P({ arm: 'reach', swing: 0, gaze: 'up' }),
    P({ arm: 'reach', swing: 1, gaze: 'up', bob: 1 }),
    P({ arm: 'reach', swing: 1, gaze: 'up' }),
    P({ arm: 'reach', swing: 0, gaze: 'side' }),
    P({ arm: 'reach', swing: 1, gaze: 'up', bob: 1 }),
    P({ arm: 'reach', swing: 0, gaze: 'ahead' })
  ],

  /** Stop, hand to the chin, look up, hold it, come back. */
  thinking: [
    P({ arm: 'down', gaze: 'ahead', bob: 1 }),
    P({ arm: 'chin', swing: 1, gaze: 'ahead', bob: 1 }),
    P({ arm: 'chin', swing: 0, gaze: 'up', brow: 'raised', headDy: 0 }),
    P({ arm: 'chin', swing: 0, gaze: 'up', brow: 'raised', bob: 1 }),
    P({ arm: 'chin', swing: 0, gaze: 'side', headDx: 1, brow: 'raised' }),
    P({ arm: 'chin', swing: 1, gaze: 'ahead', bob: 1 })
  ],

  talking: [
    P({ arm: 'gesture', swing: 0, mouth: 'open' }),
    P({ arm: 'gesture', swing: 0.5, mouth: 'closed' }),
    P({ arm: 'gesture', swing: 1, mouth: 'open', bob: 1 }),
    P({ arm: 'gesture', swing: 1, mouth: 'closed' }),
    P({ arm: 'gesture', swing: 0.5, mouth: 'open' }),
    P({ arm: 'gesture', swing: 0, mouth: 'closed', bob: 1 })
  ],

  /** Arms crossed, weight shifting, the occasional glance at the door. */
  waiting: [
    P({ arm: 'folded' }),
    P({ arm: 'folded', bob: 1 }),
    P({ arm: 'folded', bob: 1, lean: 1 }),
    P({ arm: 'folded', lean: 1, gaze: 'side', headDx: 1 }),
    P({ arm: 'folded', lean: 1 }),
    P({ arm: 'folded', gaze: 'blink' })
  ],

  success: [
    P({ arm: 'up', swing: 0, mouth: 'wide', bob: 1 }),
    P({ arm: 'up', swing: 1, mouth: 'wide' }),
    P({ arm: 'up', swing: 0, mouth: 'wide', bob: 1 }),
    P({ arm: 'up', swing: 1, mouth: 'open' }),
    P({ arm: 'up', swing: 0, mouth: 'wide', bob: 1 }),
    P({ arm: 'down', mouth: 'closed', bob: 1 })
  ],

  /** Stop dead, hand to the temple, a small shake of the head. */
  error: [
    P({ arm: 'down', bob: 1, gaze: 'down', brow: 'knit' }),
    P({ arm: 'slump', bob: 2, gaze: 'down', brow: 'knit', headDx: -1 }),
    P({ arm: 'slump', bob: 2, gaze: 'down', brow: 'knit', headDx: 1 }),
    P({ arm: 'slump', bob: 2, gaze: 'down', brow: 'knit' })
  ],

  /* --- seated --------------------------------------------------------- */

  /** In the chair with nothing running. Breathing, a blink, a look round. */
  sitting: [
    P({ legs: 'sit', bob: 1, arm: 'rest' }),
    P({ legs: 'sit', bob: 2, arm: 'rest' }),
    P({ legs: 'sit', bob: 2, arm: 'rest', gaze: 'blink' }),
    P({ legs: 'sit', bob: 1, arm: 'rest' }),
    P({ legs: 'sit', bob: 1, arm: 'rest', gaze: 'side', headDx: 1 }),
    P({ legs: 'sit', bob: 2, arm: 'rest' })
  ],

  /**
   * Typing. Neutral, left hand, strike, posture shift, right hand, neutral —
   * with the head dipping towards the screen on the strikes, because that is
   * what somebody actually does.
   */
  sitWorking: [
    P({ legs: 'sit', bob: 1, arm: 'typing', swing: 0, gaze: 'down' }),
    P({ legs: 'sit', bob: 1, arm: 'typing', swing: 1, gaze: 'down' }),
    P({ legs: 'sit', bob: 2, arm: 'typing', swing: 0, gaze: 'down', headDy: 1 }),
    P({ legs: 'sit', bob: 1, arm: 'typing', swing: 1, gaze: 'ahead' }),
    P({ legs: 'sit', bob: 2, arm: 'typing', swing: 0, gaze: 'down', headDy: 1 }),
    P({ legs: 'sit', bob: 1, arm: 'typing', swing: 1, gaze: 'down' })
  ],

  /** Reading: hands off the keys, eyes tracking down the screen. */
  sitReading: [
    P({ legs: 'sit', bob: 1, arm: 'rest', gaze: 'down' }),
    P({ legs: 'sit', bob: 2, arm: 'rest', gaze: 'down', headDy: 1 }),
    P({ legs: 'sit', bob: 2, arm: 'typing', swing: 1, gaze: 'down' }),
    P({ legs: 'sit', bob: 1, arm: 'rest', gaze: 'down' }),
    P({ legs: 'sit', bob: 1, arm: 'rest', gaze: 'blink' }),
    P({ legs: 'sit', bob: 1, arm: 'rest', gaze: 'ahead', brow: 'knit' })
  ],

  /**
   * Push back from the desk, hand to the chin, look up and away, hold, return.
   * `lean` moves the whole upper body back off the keyboard, which is the part
   * that reads at a glance even when the desk hides everything below the
   * chest.
   */
  sitThinking: [
    P({ legs: 'sit', bob: 1, arm: 'rest', gaze: 'down' }),
    P({ legs: 'sit', bob: 2, arm: 'chin', swing: 1, gaze: 'ahead', lean: 1 }),
    P({ legs: 'sit', bob: 2, arm: 'chin', swing: 0, gaze: 'up', brow: 'raised', lean: 1 }),
    P({ legs: 'sit', bob: 2, arm: 'chin', swing: 0, gaze: 'up', brow: 'raised', lean: 1, headDx: 1 }),
    P({ legs: 'sit', bob: 2, arm: 'chin', swing: 0, gaze: 'side', brow: 'raised', lean: 1 }),
    P({ legs: 'sit', bob: 1, arm: 'chin', swing: 1, gaze: 'ahead', lean: 1 })
  ],

  /** Turned away from the screen, one hand moving, talking. */
  sitTalking: [
    P({ legs: 'sit', bob: 1, arm: 'gesture', swing: 0, mouth: 'open', lean: 1 }),
    P({ legs: 'sit', bob: 1, arm: 'gesture', swing: 0.5, lean: 1 }),
    P({ legs: 'sit', bob: 2, arm: 'gesture', swing: 1, mouth: 'open', lean: 1 }),
    P({ legs: 'sit', bob: 1, arm: 'gesture', swing: 1, lean: 1 }),
    P({ legs: 'sit', bob: 1, arm: 'gesture', swing: 0.5, mouth: 'open', lean: 1 }),
    P({ legs: 'sit', bob: 2, arm: 'gesture', swing: 0, lean: 1 })
  ],

  /** Seated and blocked: a finger tap, then back to watching the screen. */
  sitWaiting: [
    P({ legs: 'sit', bob: 1, arm: 'rest', gaze: 'ahead' }),
    P({ legs: 'sit', bob: 1, arm: 'typing', swing: 1, gaze: 'ahead' }),
    P({ legs: 'sit', bob: 1, arm: 'typing', swing: 0, gaze: 'ahead' }),
    P({ legs: 'sit', bob: 2, arm: 'rest', gaze: 'down' }),
    P({ legs: 'sit', bob: 2, arm: 'rest', gaze: 'blink' }),
    P({ legs: 'sit', bob: 1, arm: 'rest', gaze: 'side', headDx: 1 })
  ],

  sitError: [
    P({ legs: 'sit', bob: 1, arm: 'rest', gaze: 'down', brow: 'knit' }),
    P({ legs: 'sit', bob: 2, arm: 'slump', gaze: 'down', brow: 'knit', headDx: -1 }),
    P({ legs: 'sit', bob: 2, arm: 'slump', gaze: 'down', brow: 'knit', headDx: 1 }),
    P({ legs: 'sit', bob: 2, arm: 'slump', gaze: 'down', brow: 'knit' })
  ]
}

/**
 * The postures and the clips have to agree.
 *
 * They are two halves of one animation — one says how long a frame is held,
 * the other says what is drawn — and they live apart because timing is a
 * property of the state and drawing is a property of the sprite. A mismatch
 * is not a visual bug you would notice: the clip simply runs off the end of
 * the table and the last pose sticks. Checked once, at load.
 */
function assertPostures(): void {
  for (const key of Object.keys(POSTURES) as CharacterState[]) {
    const rows = POSTURES[key].length
    const frames = frameCount(key)
    if (rows !== frames) {
      throw new Error(
        `character sprite: ${key} has ${rows} postures but ${frames} clip frames`
      )
    }
  }
}
assertPostures()

/* -------------------------------------------------------------- compose -- */

/**
 * Build one animation frame. `frame` has already been reduced to the clip
 * length by the caller.
 *
 * Draw order is torso, head, legs, accessory — the head over the collar, the
 * legs over the jacket's hem, the item over everything. The bob never goes
 * negative: the sheet packs frames directly above one another, so a pixel that
 * escapes the top of the cell is not clipped, it appears in somebody else's
 * pose, and tall hair already uses both spare rows.
 */
export function buildCharacterOps(
  a: CharacterAppearance,
  state: CharacterState,
  frame: number,
  facing: SpriteFacing
): Op[] {
  const table = POSTURES[state]
  const p = table[frame % table.length]

  const legs =
    p.legs === 'walk'
      ? walkLegs(frame, facing === 'side')
      : p.legs === 'sit'
        ? sitLegs(p.bob)
        : standLegs(p.bob)

  const look: Look = {
    dy: p.bob + p.headDy,
    dx: p.lean + p.headDx,
    gaze: p.gaze,
    brow: p.brow,
    mouth: p.mouth
  }

  return [
    ...torso(a, facing, p.bob, p.lean, p.arm, p.swing),
    ...head(a, facing, look),
    ...legs,
    ...accessory(a, p.bob, p.lean, p.arm)
  ]
}
