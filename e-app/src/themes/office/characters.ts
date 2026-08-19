import { defineCast } from '../../characters/defineCast'
import type { CharacterDef } from '../../characters/character.types'

/** A paper-company branch. Same agents, different job titles. */
export const officeCharacters: CharacterDef[] = [
  {
    id: 'michael',
    agentId: 'agent-1',
    name: 'Michael',
    role: 'Regional Manager',
    homeDesk: 0,
    appearance: {
      skin: '#F0C6A0',
      skinShade: '#D2A177',
      hair: '#33251C',
      hairShade: '#1F1611',
      hairStyle: 'short',
      outfit: '#3C4657',
      outfitShade: '#2B3341',
      shirt: '#FFFFFF',
      accent: '#8C3F3F',
      vest: null,
      trousers: '#2E3542',
      shoes: '#20242B',
      glasses: false,
      mouth: 'smirk'
    }
  },
  {
    id: 'dwight',
    agentId: 'agent-2',
    name: 'Dwight',
    role: 'Sales Lead',
    homeDesk: 1,
    appearance: {
      skin: '#EFC49F',
      skinShade: '#D0A075',
      hair: '#8A6A3A',
      hairShade: '#6A5029',
      hairStyle: 'short',
      outfit: '#6E7043',
      outfitShade: '#54562F',
      shirt: '#EDE6CE',
      accent: '#7A5A2E',
      vest: null,
      trousers: '#4A4B2C',
      shoes: '#20242B',
      glasses: true,
      mouth: 'neutral'
    }
  },
  {
    id: 'pam',
    agentId: 'agent-3',
    name: 'Pam',
    role: 'Coordinator',
    homeDesk: 2,
    appearance: {
      skin: '#F3CBA4',
      skinShade: '#D6A67C',
      hair: '#8A6134',
      hairShade: '#654524',
      hairStyle: 'long',
      outfit: '#7F8F9E',
      outfitShade: '#63717E',
      shirt: '#FFFFFF',
      accent: null,
      vest: null,
      trousers: '#41505C',
      shoes: '#20242B',
      glasses: false,
      mouth: 'neutral'
    }
  },
  {
    id: 'jim',
    agentId: 'agent-4',
    name: 'Jim',
    role: 'Analyst',
    homeDesk: 0,
    appearance: {
      skin: '#EDBE93',
      skinShade: '#C99A67',
      hair: '#4A3524',
      hairShade: '#2F2116',
      hairStyle: 'swept',
      outfit: '#4E5A6B',
      outfitShade: '#3A4452',
      shirt: '#DDE6EE',
      accent: '#5C6B8A',
      vest: null,
      trousers: '#39424F',
      shoes: '#20242B',
      glasses: false,
      mouth: 'smirk'
    }
  }
]

/** The rest of the branch, brought in as the workload grows. */
const officeReserves = defineCast([
  { id: 'stanley', agentId: 'agent-5', name: 'Stanley', role: 'Sales', homeDesk: 1,
    skin: '#7A5236', hair: '#2A2320', hairStyle: 'short', outfit: '#4A4A55',
    shirt: '#E4E8EE', accent: '#7A3A3A', trousers: '#3A3A44', glasses: true },
  { id: 'kevin', agentId: 'agent-6', name: 'Kevin', role: 'Accounting', homeDesk: 2,
    skin: '#EFC49F', hair: '#4A3524', hairStyle: 'short', outfit: '#6A7A5A',
    shirt: '#F2F2F0', trousers: '#4A5240' },
  { id: 'angela', agentId: 'agent-7', name: 'Angela', role: 'Accounting Lead', homeDesk: 0,
    skin: '#F3CBA4', hair: '#C7A45E', hairStyle: 'bun', outfit: '#5A7A6A',
    shirt: '#FFFFFF', trousers: '#3E5248' },
  { id: 'oscar', agentId: 'agent-8', name: 'Oscar', role: 'Analyst', homeDesk: 1,
    skin: '#C08A5A', hair: '#241A16', hairStyle: 'short', outfit: '#3E4A5E',
    shirt: '#E8EDF3', accent: '#5C6B8A', trousers: '#333E4E', glasses: true }
])

officeCharacters.push(...officeReserves)
