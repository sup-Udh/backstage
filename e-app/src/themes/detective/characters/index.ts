import type { CharacterDef } from '../../../characters/character.types'

/**
 * The detective-office cast: pixel-art interpretations of the role
 * archetypes, not portraits. All four are generated from the same sprite
 * skeleton, so they differ by silhouette and palette only.
 *
 * `agentId` is the only link back to the runtime. Another theme can bind a
 * completely different character to the same agent.
 */
export const detectiveCharacters: CharacterDef[] = [
  {
    id: 'jane',
    agentId: 'agent-1',
    name: 'Jane',
    role: 'Consultant',
    homeDesk: 0,
    appearance: {
      skin: '#F3C9A0',
      skinShade: '#D6A377',
      hair: '#D9B26A',
      hairShade: '#B48C45',
      hairStyle: 'swept',
      // Three-piece: the most relaxed, least police-like of the four.
      outfit: '#48536E',
      outfitShade: '#353F58',
      shirt: '#FFFFFF',
      accent: '#B4553F',
      vest: '#5D6A88',
      trousers: '#3C4560',
      shoes: '#2A3145',
      glasses: false,
      mouth: 'smirk'
    }
  },
  {
    id: 'lisbon',
    agentId: 'agent-2',
    name: 'Lisbon',
    role: 'Team Lead',
    homeDesk: 0,
    appearance: {
      skin: '#EFC49F',
      skinShade: '#D0A075',
      hair: '#3A2A24',
      hairShade: '#261B17',
      hairStyle: 'bun',
      // Restrained charcoal. Reads as authority next to Jane's blue-grey.
      outfit: '#3D4257',
      outfitShade: '#2B2F3F',
      shirt: '#F2F2F6',
      accent: null,
      vest: null,
      trousers: '#272A38',
      shoes: '#1B1B2A',
      glasses: false,
      mouth: 'neutral'
    }
  },
  {
    id: 'cho',
    agentId: 'agent-3',
    name: 'Cho',
    role: 'Technical Investigator',
    homeDesk: 1,
    appearance: {
      skin: '#E8B98D',
      skinShade: '#C4935F',
      hair: '#231C1A',
      hairShade: '#151011',
      hairStyle: 'short',
      // No tie, softer collar: the developer of the group.
      outfit: '#474D5E',
      outfitShade: '#343948',
      shirt: '#C7CDD8',
      accent: null,
      vest: null,
      trousers: '#2E323D',
      shoes: '#1B1B2A',
      glasses: true,
      mouth: 'neutral'
    }
  },
  {
    id: 'vanpelt',
    agentId: 'agent-4',
    name: 'Van Pelt',
    role: 'Research Specialist',
    homeDesk: 2,
    appearance: {
      skin: '#F6D2AE',
      skinShade: '#DBAC84',
      hair: '#A75B33',
      hairShade: '#7E4223',
      hairStyle: 'long',
      // Warm brown, tying her to the room's wood tones.
      outfit: '#4E4436',
      outfitShade: '#3A3228',
      shirt: '#FFF6E4',
      accent: null,
      vest: null,
      trousers: '#3A3228',
      shoes: '#1B1B2A',
      glasses: false,
      mouth: 'neutral'
    }
  }
]
