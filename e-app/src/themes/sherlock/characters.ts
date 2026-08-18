import type { CharacterDef } from '../../characters/character.types'

/** A consulting practice in a dark London flat. */
export const sherlockCharacters: CharacterDef[] = [
  {
    id: 'holmes',
    agentId: 'agent-1',
    name: 'Holmes',
    role: 'Consulting Detective',
    homeDesk: 0,
    appearance: {
      skin: '#EBC49E',
      skinShade: '#C79C71',
      hair: '#241A16',
      hairShade: '#140E0B',
      hairStyle: 'swept',
      outfit: '#242B34',
      outfitShade: '#171D24',
      shirt: '#E9E2D2',
      accent: null,
      vest: null,
      trousers: '#1C2229',
      shoes: '#14191C',
      glasses: false,
      mouth: 'smirk'
    }
  },
  {
    id: 'watson',
    agentId: 'agent-2',
    name: 'Watson',
    role: 'Field Chronicler',
    homeDesk: 1,
    appearance: {
      skin: '#EFC49F',
      skinShade: '#D0A075',
      hair: '#7A6042',
      hairShade: '#5A462F',
      hairStyle: 'short',
      outfit: '#4A5A4A',
      outfitShade: '#354034',
      shirt: '#F0EADA',
      accent: '#8C3A3A',
      vest: null,
      trousers: '#3A4239',
      shoes: '#14191C',
      glasses: false,
      mouth: 'neutral'
    }
  },
  {
    id: 'lestrade',
    agentId: 'agent-3',
    name: 'Lestrade',
    role: 'Inspector',
    homeDesk: 2,
    appearance: {
      skin: '#DDAE84',
      skinShade: '#B98A5F',
      hair: '#3A3A3E',
      hairShade: '#252528',
      hairStyle: 'short',
      outfit: '#3F4A57',
      outfitShade: '#2C343E',
      shirt: '#D9DEE4',
      accent: '#2E3A48',
      vest: null,
      trousers: '#333B45',
      shoes: '#14191C',
      glasses: false,
      mouth: 'neutral'
    }
  },
  {
    id: 'hooper',
    agentId: 'agent-4',
    name: 'Hooper',
    role: 'Pathologist',
    homeDesk: 0,
    appearance: {
      skin: '#F3CBA4',
      skinShade: '#D6A67C',
      hair: '#5A3E28',
      hairShade: '#3E2A1A',
      hairStyle: 'long',
      outfit: '#C8CBC4',
      outfitShade: '#A2A69E',
      shirt: '#F6F1E4',
      accent: null,
      vest: null,
      trousers: '#4A5058',
      shoes: '#14191C',
      glasses: false,
      mouth: 'neutral'
    }
  }
]
