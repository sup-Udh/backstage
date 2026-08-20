import { defineCast } from '../../characters/defineCast'
import type { CharacterDef } from '../../characters/character.types'

/** A lab crew. Same four agents, in aprons and respirator straps. */
export const labCharacters: CharacterDef[] = [
  {
    id: 'walter',
    agentId: 'agent-1',
    name: 'Walter',
    role: 'Lead Chemist',
    homeDesk: 0,
    appearance: {
      skin: '#EFC49F',
      skinShade: '#D0A075',
      hair: '#7D7A74',
      hairShade: '#5C5A55',
      hairStyle: 'short',
      outfit: '#D6D8C6',
      outfitShade: '#AFB2A0',
      shirt: '#FBFBF2',
      accent: '#6E8F4A',
      vest: null,
      trousers: '#4A5348',
      shoes: '#1B2019',
      glasses: true,
      mouth: 'neutral'
    }
  },
  {
    id: 'jesse',
    agentId: 'agent-2',
    name: 'Jesse',
    role: 'Lab Technician',
    homeDesk: 1,
    appearance: {
      skin: '#EDBE93',
      skinShade: '#C99A67',
      hair: '#C7A45E',
      hairShade: '#9A7C3E',
      hairStyle: 'short',
      outfit: '#7BA05B',
      outfitShade: '#5A7A40',
      shirt: '#EFEEE0',
      accent: null,
      vest: null,
      trousers: '#3E4A3C',
      shoes: '#1B2019',
      glasses: false,
      mouth: 'smirk'
    }
  },
  {
    id: 'gus',
    agentId: 'agent-3',
    name: 'Gus',
    role: 'Operations',
    homeDesk: 2,
    appearance: {
      skin: '#B8865C',
      skinShade: '#94683F',
      hair: '#221A14',
      hairShade: '#130D09',
      hairStyle: 'short',
      outfit: '#3B4A44',
      outfitShade: '#2A3630',
      shirt: '#E4E6DA',
      accent: '#6E8F4A',
      vest: null,
      trousers: '#2F3A35',
      shoes: '#1B2019',
      glasses: true,
      mouth: 'neutral'
    }
  },
  {
    id: 'saul',
    agentId: 'agent-4',
    name: 'Saul',
    role: 'Negotiator',
    homeDesk: 0,
    appearance: {
      skin: '#F0C6A0',
      skinShade: '#D2A177',
      hair: '#6A4E30',
      hairShade: '#4A3620',
      hairStyle: 'swept',
      outfit: '#9A8248',
      outfitShade: '#77642F',
      shirt: '#FBFBF2',
      accent: '#A8623A',
      vest: null,
      trousers: '#5E5233',
      shoes: '#1B2019',
      glasses: false,
      mouth: 'smirk'
    }
  }
]

/** Extra hands on the bench, brought in as the workload grows. */
const labReserves = defineCast([
  { id: 'mike', agentId: 'agent-5', name: 'Mike', role: 'Security', homeDesk: 1,
    skin: '#EFC49F', hair: '#9A9A94', hairStyle: 'short', outfit: '#4A4A48',
    shirt: '#E4E6DA', trousers: '#3A3A38' },
  { id: 'skyler', agentId: 'agent-6', name: 'Skyler', role: 'Bookkeeping', homeDesk: 2,
    skin: '#F6D2AE', hair: '#D7B96A', hairStyle: 'long', outfit: '#5A7A9A',
    shirt: '#FBFBF2', trousers: '#3E5266' },
  { id: 'hank', agentId: 'agent-7', name: 'Hank', role: 'Compliance', homeDesk: 0,
    skin: '#EDBE93', hair: '#7A6A54', hairStyle: 'short', outfit: '#7A6A4A',
    shirt: '#EFEEE0', trousers: '#4A4234' },
  { id: 'todd', agentId: 'agent-8', name: 'Todd', role: 'Assistant', homeDesk: 1,
    skin: '#F0C6A0', hair: '#8A6A3A', hairStyle: 'short', outfit: '#9AA08A',
    shirt: '#FBFBF2', trousers: '#4A5248' }
])

labCharacters.push(...labReserves)
