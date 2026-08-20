import type {
  Accessory,
  Build,
  CharacterDef,
  Expression,
  HairStyle,
  Outfit,
  Posture
} from './character.types'

/**
 * A compact way to declare cast members.
 *
 * The sprite skeleton needs a shade for skin, hair and outfit, but those are
 * always the same colour darkened — hand-picking them per character invited
 * drift. Here they are derived, so a new character is one line and the
 * lighting stays consistent across every world by construction.
 */

/** Darken a hex colour by a fraction, staying on the same hue. */
export function shade(hex: string, amount = 0.22): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)))
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)))
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export interface CastSpec {
  id: string
  agentId: string
  name: string
  role: string
  homeDesk: number
  skin: string
  hair: string
  hairStyle: HairStyle
  outfit: string
  shirt: string
  trousers: string
  /** Tie or scarf. Omit for an open collar. */
  accent?: string
  /** Waistcoat, drawn under the tie. */
  vest?: string
  glasses?: boolean
  smirk?: boolean
  shoes?: string

  /** Silhouette and personality. Defaults keep older casts working. */
  build?: Build
  posture?: Posture
  outfitStyle?: Outfit
  accessory?: Accessory
  accessoryColor?: string
  expression?: Expression
}

export function defineCast(specs: CastSpec[]): CharacterDef[] {
  return specs.map((s) => ({
    id: s.id,
    agentId: s.agentId,
    name: s.name,
    role: s.role,
    homeDesk: s.homeDesk,
    appearance: {
      skin: s.skin,
      skinShade: shade(s.skin, 0.16),
      hair: s.hair,
      hairShade: shade(s.hair, 0.3),
      hairStyle: s.hairStyle,
      outfit: s.outfit,
      outfitShade: shade(s.outfit, 0.26),
      shirt: s.shirt,
      accent: s.accent ?? null,
      vest: s.vest ?? null,
      trousers: s.trousers,
      shoes: s.shoes ?? '#1B1B2A',
      glasses: s.glasses ?? false,
      mouth: s.smirk ? 'smirk' : 'neutral',
      build: s.build ?? 'regular',
      posture: s.posture ?? 'upright',
      outfitStyle: s.outfitStyle ?? (s.vest ? 'vest' : s.accent ? 'suit' : 'blazer'),
      accessory: s.accessory ?? 'none',
      accessoryColor: s.accessoryColor,
      expression: s.expression ?? (s.smirk ? 'smirk' : 'calm')
    }
  }))
}
