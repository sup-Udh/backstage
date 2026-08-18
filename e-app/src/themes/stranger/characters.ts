import type { CharacterDef } from '../../characters/character.types'

/** A basement crew running an investigation after school. */
export const strangerCharacters: CharacterDef[] = [
  {
    id: 'el',
    agentId: 'agent-1',
    name: 'Eleven',
    role: 'Signal Analyst',
    homeDesk: 0,
    appearance: {
      skin: '#F0C6A0',
      skinShade: '#D2A177',
      hair: '#3A2A22',
      hairShade: '#241812',
      hairStyle: 'short',
      outfit: '#D8CFC0',
      outfitShade: '#B3A996',
      shirt: '#F2EEE2',
      accent: '#B03A3A',
      vest: null,
      trousers: '#3C4A63',
      shoes: '#12141F',
      glasses: false,
      mouth: 'neutral'
    }
  },
  {
    id: 'mike',
    agentId: 'agent-2',
    name: 'Mike',
    role: 'Strategist',
    homeDesk: 1,
    appearance: {
      skin: '#EDBE93',
      skinShade: '#C99A67',
      hair: '#241A16',
      hairShade: '#140E0B',
      hairStyle: 'swept',
      outfit: '#3F5A8C',
      outfitShade: '#2C4269',
      shirt: '#E2DCCC',
      accent: null,
      vest: null,
      trousers: '#2E3A52',
      shoes: '#12141F',
      glasses: false,
      mouth: 'neutral'
    }
  },
  {
    id: 'dustin',
    agentId: 'agent-3',
    name: 'Dustin',
    role: 'Researcher',
    homeDesk: 2,
    appearance: {
      skin: '#F3CBA4',
      skinShade: '#D6A67C',
      hair: '#5A3E28',
      hairShade: '#3E2A1A',
      hairStyle: 'short',
      outfit: '#7FA05F',
      outfitShade: '#5E7C43',
      shirt: '#EDE7D6',
      accent: null,
      vest: null,
      trousers: '#4A5266',
      shoes: '#12141F',
      glasses: false,
      mouth: 'smirk'
    }
  },
  {
    id: 'nancy',
    agentId: 'agent-4',
    name: 'Nancy',
    role: 'Investigator',
    homeDesk: 0,
    appearance: {
      skin: '#F6D2AE',
      skinShade: '#DBAC84',
      hair: '#6A4526',
      hairShade: '#4A2F19',
      hairStyle: 'long',
      outfit: '#B04A6A',
      outfitShade: '#88334E',
      shirt: '#F2EEE2',
      accent: null,
      vest: null,
      trousers: '#3A4258',
      shoes: '#12141F',
      glasses: false,
      mouth: 'neutral'
    }
  }
]
