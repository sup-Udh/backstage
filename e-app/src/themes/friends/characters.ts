import type { CharacterDef } from '../../characters/character.types'

/**
 * The apartment ensemble. Same four agents as every other world - only the
 * people they are portrayed by change.
 */
export const friendsCharacters: CharacterDef[] = [
  {
    id: 'rachel',
    agentId: 'agent-1',
    name: 'Rachel',
    role: 'Coordinator',
    homeDesk: 0,
    appearance: {
      skin: '#F3CBA4',
      skinShade: '#D6A67C',
      hair: '#A9763E',
      hairShade: '#82582A',
      hairStyle: 'long',
      outfit: '#D8DDE4',
      outfitShade: '#B4BBC6',
      shirt: '#FFFFFF',
      accent: null,
      vest: null,
      trousers: '#3F4A63',
      shoes: '#241C2E',
      glasses: false,
      mouth: 'smirk'
    }
  },
  {
    id: 'monica',
    agentId: 'agent-2',
    name: 'Monica',
    role: 'Organiser',
    homeDesk: 1,
    appearance: {
      skin: '#EFC49F',
      skinShade: '#D0A075',
      hair: '#2F211C',
      hairShade: '#1D1310',
      hairStyle: 'bun',
      outfit: '#5E7FA8',
      outfitShade: '#44608A',
      shirt: '#FFF3E2',
      accent: null,
      vest: null,
      trousers: '#2C3550',
      shoes: '#241C2E',
      glasses: false,
      mouth: 'neutral'
    }
  },
  {
    id: 'chandler',
    agentId: 'agent-3',
    name: 'Chandler',
    role: 'Analyst',
    homeDesk: 2,
    appearance: {
      skin: '#EDBE93',
      skinShade: '#C99A67',
      hair: '#3B2A20',
      hairShade: '#241812',
      hairStyle: 'short',
      outfit: '#8C6E4A',
      outfitShade: '#6B5236',
      shirt: '#FFFDF5',
      accent: '#5C6B8A',
      vest: '#A98657',
      trousers: '#4A4034',
      shoes: '#241C2E',
      glasses: false,
      mouth: 'smirk'
    }
  },
  {
    id: 'phoebe',
    agentId: 'agent-4',
    name: 'Phoebe',
    role: 'Wildcard',
    homeDesk: 0,
    appearance: {
      skin: '#F6D2AE',
      skinShade: '#DBAC84',
      hair: '#D7B96A',
      hairShade: '#AE9145',
      hairStyle: 'long',
      outfit: '#B4693F',
      outfitShade: '#8E4F2C',
      shirt: '#FFF3E2',
      accent: null,
      vest: null,
      trousers: '#7A5A78',
      shoes: '#241C2E',
      glasses: false,
      mouth: 'neutral'
    }
  }
]
