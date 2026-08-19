import { defineCast } from '../../characters/defineCast'
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

/** The reserves: more of the building, arriving as the workload grows. */
const friendsReserves = defineCast([
  { id: 'ross', agentId: 'agent-5', name: 'Ross', role: 'Researcher', homeDesk: 1,
    skin: '#EDBE93', hair: '#2F211C', hairStyle: 'short', outfit: '#5A4A7A',
    shirt: '#FFF3E2', accent: '#3E3358', trousers: '#3E3358' },
  { id: 'joey', agentId: 'agent-6', name: 'Joey', role: 'Frontman', homeDesk: 2,
    skin: '#E8B98D', hair: '#241A16', hairStyle: 'swept', outfit: '#7A4A3A',
    shirt: '#F2EEE2', trousers: '#3A3242', smirk: true },
  { id: 'gunther', agentId: 'agent-7', name: 'Gunther', role: 'Support', homeDesk: 0,
    skin: '#F6D2AE', hair: '#E8DCA8', hairStyle: 'short', outfit: '#4A6E6A',
    shirt: '#FFFFFF', trousers: '#38504E' },
  { id: 'janice', agentId: 'agent-8', name: 'Janice', role: 'Escalations', homeDesk: 1,
    skin: '#F0C6A0', hair: '#3A2A24', hairStyle: 'long', outfit: '#A8467A',
    shirt: '#FFF3E2', trousers: '#5A2E48' }
])

friendsCharacters.push(...friendsReserves)
