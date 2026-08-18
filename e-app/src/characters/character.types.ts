/**
 * The character layer: how an agent is *portrayed*.
 *
 * A character belongs to a theme. The same agent is Patrick Jane in the
 * detective theme and could be an astronaut in a sci-fi theme, without the
 * agent runtime knowing either exists.
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

export type HairStyle = 'swept' | 'bun' | 'short' | 'long'

/**
 * Pixel appearance parameters. Every character is generated from the same
 * sprite skeleton, so proportions, outline weight and pixel density are
 * identical across the cast by construction rather than by discipline.
 */
export interface CharacterAppearance {
  skin: string
  skinShade: string
  hair: string
  hairShade: string
  hairStyle: HairStyle
  /** Jacket / outer layer. */
  outfit: string
  outfitShade: string
  /** Shirt showing at the collar. */
  shirt: string
  /** Tie or scarf. Set to null for an open collar. */
  accent: string | null
  /** Optional waistcoat, drawn under the tie. */
  vest: string | null
  trousers: string
  shoes: string
  glasses: boolean
  /** Resting mouth shape. The consultant wears a permanent slight smirk. */
  mouth: 'neutral' | 'smirk'
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
