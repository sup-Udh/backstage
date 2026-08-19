import { defineCast } from '../../../characters/defineCast'
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

/**
 * The reserves. They join the office one at a time as the user gives the team
 * more work, so a busy day visibly fills the room.
 */
const detectiveReserves = defineCast([
  { id: 'rigsby', agentId: 'agent-5', name: 'Rigsby', role: 'Field Agent', homeDesk: 1,
    skin: '#EDBE93', hair: '#4A3524', hairStyle: 'short', outfit: '#4A5568',
    shirt: '#E8EDF3', accent: '#3A4557', trousers: '#39424F' },
  { id: 'wainwright', agentId: 'agent-6', name: 'Wainwright', role: 'Supervisor', homeDesk: 2,
    skin: '#F0C6A0', hair: '#8A6A3A', hairStyle: 'swept', outfit: '#2F3A4A',
    shirt: '#FFFFFF', accent: '#7A2E2E', vest: '#445063', trousers: '#28313E' },
  { id: 'hightower', agentId: 'agent-7', name: 'Hightower', role: 'Director', homeDesk: 0,
    skin: '#8A5F3C', hair: '#2A1D16', hairStyle: 'bun', outfit: '#3E3348',
    shirt: '#F2EDE2', trousers: '#332A3C' },
  { id: 'bertram', agentId: 'agent-8', name: 'Bertram', role: 'Liaison', homeDesk: 1,
    skin: '#EFC49F', hair: '#9A9A94', hairStyle: 'short', outfit: '#4A4A55',
    shirt: '#FFFFFF', accent: '#5C6B8A', trousers: '#3A3A44', glasses: true }
])

detectiveCharacters.push(...detectiveReserves)
