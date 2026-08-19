/**
 * The character layer: how an agent is *portrayed*.
 *
 * A character belongs to a theme. The same agent is a detective in one world
 * and a barista in another, without the agent runtime knowing either exists.
 */

/** Semantic animation states. Deliberately mirrors AgentStatus + locomotion. */
export type CharacterState =
  | 'idle'
  | 'walking'
  | 'working'
  | 'thinking'
  | 'talking'
  | 'waiting'
  | 'success'
  | 'error'

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
