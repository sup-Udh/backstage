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
