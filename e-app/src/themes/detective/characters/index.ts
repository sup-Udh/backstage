import type { CharacterDef } from '../../../characters/character.types'

/**
 * The detective-office cast.
 *
 * Pixel-art interpretations of role archetypes, not portraits. Each one is
 * specified deliberately rather than recoloured, and the test is whether you
 * can tell them apart as black silhouettes before colour is considered:
 *
 *   Jane        swept fair hair, three-piece, notebook   slim, relaxed
 *   Lisbon      dark bun, blazer, badge                  regular, upright
 *   Cho         buzz cut, plain dark suit, nothing else  regular, rigid
 *   Van Pelt    long auburn hair, cardigan, tablet       slim, upright
 *   Rigsby      short hair, shirt and tie, coffee mug    broad, slouched
 *   Wainwright  slicked hair, long coat, briefcase       regular, rigid
 *   Hightower   ponytail, blazer, earpiece               regular, upright
 *   Bertram     grey messy hair, cardigan, glasses, pen  slim, forward
 *
 * `agentId` is the only link back to the runtime. Another theme binds a
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
      // Warm fair hair swept to one side; the only three-piece in the room.
      skin: '#F0C9A4',
      hair: '#D8B26A',
      hairStyle: 'swept',
      outfit: '#4C577A',
      outfitStyle: 'vest',
      shirt: '#FBF7EE',
      accent: '#A8442F',
      vest: '#6A749A',
      trousers: '#3B4462',
      shoes: '#2A2F45',
      glasses: false,
      build: 'slim',
      posture: 'relaxed',
      accessory: 'notebook',
      accessoryColor: '#FFC94F',
      expression: 'smirk'
    }
  },
  {
    id: 'lisbon',
    agentId: 'agent-2',
    name: 'Lisbon',
    role: 'Team Lead',
    homeDesk: 0,
    appearance: {
      // Dark hair up, restrained charcoal, badge at the chest.
      skin: '#EDC49E',
      hair: '#33241E',
      hairStyle: 'bun',
      outfit: '#333A4E',
      outfitStyle: 'blazer',
      shirt: '#F2F3F7',
      accent: null,
      vest: null,
      trousers: '#272C3C',
      shoes: '#1B1B2A',
      glasses: false,
      build: 'regular',
      posture: 'upright',
      accessory: 'badge',
      accessoryColor: '#FFC94F',
      expression: 'serious'
    }
  },
  {
    id: 'cho',
    agentId: 'agent-3',
    name: 'Cho',
    role: 'Technical Investigator',
    homeDesk: 1,
    appearance: {
      // Buzz cut, plain suit, no accessory. Deliberately the most austere
      // silhouette on the team.
      skin: '#E4B489',
      hair: '#1E1917',
      hairStyle: 'buzz',
      outfit: '#3E4454',
      outfitStyle: 'suit',
      shirt: '#C9D0DA',
      accent: '#2C3242',
      vest: null,
      trousers: '#2F3441',
      shoes: '#1B1B2A',
      glasses: false,
      build: 'regular',
      posture: 'rigid',
      accessory: 'none',
      expression: 'serious'
    }
  },
  {
    id: 'vanpelt',
    agentId: 'agent-4',
    name: 'Van Pelt',
    role: 'Research Specialist',
    homeDesk: 2,
    appearance: {
      // Long auburn hair past the shoulders: the tallest outline.
      skin: '#F4D0AB',
      hair: '#A85B33',
      hairStyle: 'long',
      outfit: '#5E6E5A',
      outfitStyle: 'cardigan',
      shirt: '#FFF6E4',
      accent: null,
      vest: null,
      trousers: '#3C4438',
      shoes: '#1B1B2A',
      glasses: false,
      build: 'slim',
      posture: 'upright',
      accessory: 'tablet',
      accessoryColor: '#FFC94F',
      expression: 'focused'
    }
  },
  {
    id: 'rigsby',
    agentId: 'agent-5',
    name: 'Rigsby',
    role: 'Field Agent',
    homeDesk: 1,
    appearance: {
      // Broadest shoulders in the office, no jacket, coffee always in hand.
      skin: '#EABB91',
      hair: '#4A3524',
      hairStyle: 'short',
      outfit: '#7E8EA6',
      outfitStyle: 'shirt',
      shirt: '#E8EDF3',
      accent: '#3A4557',
      vest: null,
      trousers: '#39424F',
      shoes: '#1B1B2A',
      glasses: false,
      build: 'broad',
      posture: 'slouched',
      accessory: 'mug',
      accessoryColor: '#FFFFFF',
      expression: 'friendly'
    }
  },
  {
    id: 'wainwright',
    agentId: 'agent-6',
    name: 'Wainwright',
    role: 'Supervisor',
    homeDesk: 2,
    appearance: {
      // Slicked hair and a long coat: the outline reads as management.
      skin: '#EFC6A0',
      hair: '#6E5334',
      hairStyle: 'slick',
      outfit: '#2F3A4A',
      outfitStyle: 'coat',
      shirt: '#FFFFFF',
      accent: '#7A2E2E',
      vest: '#445063',
      trousers: '#28313E',
      shoes: '#1B1B2A',
      glasses: false,
      build: 'regular',
      posture: 'rigid',
      accessory: 'briefcase',
      accessoryColor: '#8A6236',
      expression: 'skeptical'
    }
  },
  {
    id: 'hightower',
    agentId: 'agent-7',
    name: 'Hightower',
    role: 'Director',
    homeDesk: 0,
    appearance: {
      // Ponytail off to one side and an earpiece: senior, always on a call.
      skin: '#8A5F3C',
      hair: '#2A1D16',
      hairStyle: 'ponytail',
      outfit: '#4A3B58',
      outfitStyle: 'blazer',
      shirt: '#F2EDE2',
      accent: null,
      vest: null,
      trousers: '#332A3C',
      shoes: '#1B1B2A',
      glasses: false,
      build: 'regular',
      posture: 'upright',
      accessory: 'earpiece',
      accessoryColor: '#FFC94F',
      expression: 'calm'
    }
  },
  {
    id: 'bertram',
    agentId: 'agent-8',
    name: 'Bertram',
    role: 'Liaison',
    homeDesk: 1,
    appearance: {
      // Grey untidy hair and glasses: the oldest silhouette in the room.
      skin: '#EDC4A0',
      hair: '#9A9A94',
      hairStyle: 'messy',
      outfit: '#5A5A66',
      outfitStyle: 'cardigan',
      shirt: '#FFFFFF',
      accent: null,
      vest: null,
      trousers: '#3A3A44',
      shoes: '#1B1B2A',
      glasses: true,
      build: 'slim',
      posture: 'forward',
      accessory: 'pen',
      accessoryColor: '#FFC94F',
      expression: 'tired'
    }
  }
]
