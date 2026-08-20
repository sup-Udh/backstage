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
 * The *faces* are specified too, and that is what changed most recently. Hair
 * and clothing used to carry the whole identity, so eight characters shared
 * one face and the cast read as one person in eight wigs — fine at the size
 * they were drawn, useless once they shrank to twelve pixels wide. Every one
 * now has its own head width, eye spacing, brow, nose and jaw, so the second
 * test is whether you can tell them apart from the neck up alone.
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
      // Narrow face, wide-set eyes and an arched brow: reads as amused before
      // the smirk is even drawn, which is the entire character.
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
      expression: 'smirk',
      faceWidth: 'narrow',
      eyeSpacing: 'wide',
      browShape: 'arched',
      noseShape: 'straight',
      jaw: 'narrow'
    }
  },
  {
    id: 'lisbon',
    agentId: 'agent-2',
    name: 'Lisbon',
    role: 'Team Lead',
    homeDesk: 0,
    appearance: {
      // Dark hair up, restrained charcoal, badge at the chest. Close-set eyes
      // under a flat brow: the most level face on the team.
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
      expression: 'serious',
      faceWidth: 'narrow',
      eyeSpacing: 'close',
      browShape: 'flat',
      noseShape: 'small',
      jaw: 'soft'
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
      // outline on the team — recognisable by being the least. A square jaw
      // and a heavy brow do the work the hair refuses to.
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
      build: 'slim',
      posture: 'rigid',
      accessory: 'none',
      expression: 'serious',
      faceWidth: 'regular',
      eyeSpacing: 'regular',
      browShape: 'heavy',
      noseShape: 'straight',
      jaw: 'square'
    }
  },
  {
    id: 'vanpelt',
    agentId: 'agent-4',
    name: 'Van Pelt',
    role: 'Research Specialist',
    homeDesk: 2,
    appearance: {
      // Long auburn hair past the shoulders: the tallest outline. A narrow
      // face inside it, so the hair reads as volume rather than as a head.
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
      expression: 'focused',
      faceWidth: 'narrow',
      eyeSpacing: 'regular',
      browShape: 'arched',
      noseShape: 'small',
      jaw: 'narrow'
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
      // The face matches the build: wide, square-jawed, stubbled.
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
      accessoryColor: '#E8E4DA',
      expression: 'friendly',
      faceWidth: 'wide',
      eyeSpacing: 'wide',
      browShape: 'flat',
      noseShape: 'broad',
      jaw: 'square',
      facialHair: 'stubble'
    }
  },
  {
    id: 'wainwright',
    agentId: 'agent-6',
    name: 'Wainwright',
    role: 'Supervisor',
    homeDesk: 2,
    appearance: {
      // Slicked hair and a long coat: the outline reads as management. The
      // angled brow and thin moustache are the rest of the impression.
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
      expression: 'skeptical',
      faceWidth: 'regular',
      eyeSpacing: 'close',
      browShape: 'angled',
      noseShape: 'straight',
      jaw: 'square',
      facialHair: 'moustache'
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
      // The only wide-set, arched-brow face with a square jaw — composed
      // rather than soft.
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
      expression: 'calm',
      faceWidth: 'regular',
      eyeSpacing: 'wide',
      browShape: 'arched',
      noseShape: 'broad',
      jaw: 'square'
    }
  },
  {
    id: 'bertram',
    agentId: 'agent-8',
    name: 'Bertram',
    role: 'Liaison',
    homeDesk: 1,
    appearance: {
      // Grey untidy hair, glasses and a grey beard: the oldest silhouette in
      // the room, and the only one whose facial hair is a different colour
      // from what is left on top.
      skin: '#EDC4A0',
      hair: '#8C8C86',
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
      expression: 'tired',
      faceWidth: 'wide',
      eyeSpacing: 'close',
      browShape: 'heavy',
      noseShape: 'broad',
      jaw: 'soft',
      facialHair: 'beard',
      facialHairColor: '#9A9A93'
    }
  }
]
