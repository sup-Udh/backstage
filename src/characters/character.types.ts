/**
 * The character layer: how an agent is *portrayed*.
 *
 * A character belongs to a theme. The same agent is a detective in one world
 * and a barista in another, without the agent runtime knowing either exists.
 */

/**
 * Semantic animation states.
 *
 * Two families, and the split is the whole point. A character who is at their
 * workstation and a character who is standing in the middle of the room are
 * doing the same *job* in different *bodies*: one thinks by leaning back in a
 * chair with a hand at their chin, the other by standing at the board with a
 * hand at their chin. Collapsing the two is what produced the old behaviour
 * where an agent's model call sent its body walking across the office.
 *
 * `seatedFor` maps one onto the other, so the director decides only whether
 * somebody is at their desk and never which of fourteen rows to draw.
 */
export type CharacterState =
  /* --- standing --- */
  | 'idle'
  | 'walking'
  | 'working'
  | 'thinking'
  | 'talking'
  | 'waiting'
  | 'success'
  | 'error'
  /* --- at a workstation --- */
  /** Seated, settled, not currently on anything. */
  | 'sitting'
  /** Seated, hands on the keyboard. */
  | 'sitWorking'
  /** Seated, hands off the keyboard, reading the screen. */
  | 'sitReading'
  /** Seated, leaning back, hand at the chin, looking up. */
  | 'sitThinking'
  /** Seated, turned away from the screen towards somebody. */
  | 'sitTalking'
  /** Seated, still, blocked on something that is not theirs to finish. */
  | 'sitWaiting'
  /** Seated, slumped, looking at what went wrong. */
  | 'sitError'

/** True for the states that draw a character in a chair. */
export function isSeated(state: CharacterState): boolean {
  return state.startsWith('sit')
}

/** Which way the sprite faces. `side` is mirrored for left/right. */
export type Facing = 'down' | 'up' | 'left' | 'right'

/**
 * Hair silhouette. This is the single strongest identity cue at sprite size —
 * a character should be recognisable from their hair outline alone, before
 * colour or clothing is considered.
 */
export type HairStyle =
  | 'swept'
  | 'short'
  | 'bun'
  | 'long'
  | 'messy'
  | 'slick'
  | 'curly'
  | 'bob'
  | 'ponytail'
  | 'buzz'
  /** A hard side parting with a defined hairline. */
  | 'parted'
  /** Shoulder-length with volume at the sides rather than length. */
  | 'waves'
  /** Round and tall; the widest silhouette in any cast. */
  | 'afro'
  /** Gathered high, so the outline has a spike only they have. */
  | 'topknot'
  /** No hair at all. The skull *is* the silhouette. */
  | 'bald'

/* ------------------------------------------------------------------ face -- */

/**
 * The face.
 *
 * These exist because hair and clothing were carrying the whole identity: two
 * characters with different hair still had the same face underneath, so at
 * sprite size a cast read as one person in eight wigs. Each of these moves a
 * handful of pixels, and together they are what makes a face belong to
 * somebody rather than to the skeleton.
 *
 * Every one is optional and every default reproduces the original face, so a
 * character is still one line until somebody decides to draw them properly.
 */

/** Head width. Changes the silhouette above the shoulders. */
export type FaceWidth = 'narrow' | 'regular' | 'wide'

/** How far apart the eyes sit. One pixel either way reads as a different person. */
export type EyeSpacing = 'close' | 'regular' | 'wide'

/** Brow shape. Carries most of the expression, and most of the character. */
export type BrowShape = 'flat' | 'angled' | 'arched' | 'heavy'

export type NoseShape = 'small' | 'straight' | 'broad'

/** The bottom of the head, which decides whether a face reads as soft or hard. */
export type JawShape = 'soft' | 'square' | 'narrow'

export type FacialHair = 'none' | 'stubble' | 'moustache' | 'beard' | 'goatee'

/** Shoulder width and torso mass. Changes the silhouette, not the height. */
export type Build = 'slim' | 'regular' | 'broad'

/** How the character stands. Read as personality even when idle. */
export type Posture = 'upright' | 'relaxed' | 'rigid' | 'forward' | 'slouched'

/** The garment stack. Each one has its own silhouette at the shoulders. */
export type Outfit =
  | 'suit'
  | 'vest'
  | 'blazer'
  | 'hoodie'
  | 'cardigan'
  | 'coat'
  | 'shirt'
  | 'labcoat'

/** One memorable item. Deliberately singular: two is clutter at this size. */
export type Accessory =
  | 'none'
  | 'notebook'
  | 'headphones'
  | 'mug'
  | 'badge'
  | 'tablet'
  | 'briefcase'
  | 'scarf'
  | 'earpiece'
  | 'pen'

/** Face. Small pixel shifts in brow and mouth, not new features. */
export type Expression =
  | 'calm'
  | 'serious'
  | 'focused'
  | 'friendly'
  | 'skeptical'
  | 'tired'
  | 'smirk'

/**
 * Pixel appearance parameters.
 *
 * Every character is generated from one sprite skeleton, so proportions,
 * outline weight, pixel density and lighting are identical across the cast by
 * construction. They differ in silhouette, palette and detail — which is what
 * makes them tell apart, rather than being recolours of each other.
 *
 * Shading tints are derived from the base colours, so a character is declared
 * in six or seven colours and still gets three to four shades per material.
 */
export interface CharacterAppearance {
  skin: string
  /** Optional; derived from `skin` when absent. */
  skinShade?: string

  hair: string
  hairShade?: string
  hairStyle: HairStyle

  /** Jacket / outer layer. */
  outfit: string
  outfitShade?: string
  /** Which garment silhouette to draw. */
  outfitStyle?: Outfit

  /** Shirt showing at the collar and cuffs. */
  shirt: string
  /** Tie or scarf. null for an open collar. */
  accent: string | null
  /** Waistcoat, drawn under the tie. */
  vest: string | null

  trousers: string
  shoes: string

  glasses: boolean
  /** Legacy field kept so existing themes compile; `expression` supersedes it. */
  mouth?: 'neutral' | 'smirk'

  build?: Build
  posture?: Posture
  accessory?: Accessory
  /** Accent colour for the accessory, so it can carry the brand yellow. */
  accessoryColor?: string
  expression?: Expression

  /* --- the face. Every default reproduces the original head. --- */
  faceWidth?: FaceWidth
  eyeSpacing?: EyeSpacing
  browShape?: BrowShape
  noseShape?: NoseShape
  jaw?: JawShape
  facialHair?: FacialHair
  /**
   * Facial hair colour. Defaults to the hair, which is right for most people
   * and wrong for exactly the ones worth drawing — a grey beard under dark
   * hair is a whole character on its own.
   */
  facialHairColor?: string
}

export interface CharacterDef {
  id: string
  /** Which agent this character portrays. */
  agentId: string
  name: string
  role: string
  appearance: CharacterAppearance
  /** Index of the preferred desk in the scene's desk list. */
  homeDesk: number
}
