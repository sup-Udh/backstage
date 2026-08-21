import type { Theme } from '../types'
import { labCharacters } from './characters'
import { labPalette, buildLabScene, labScene } from './environment'

export const labTheme: Theme = {
  id: 'lab',
  name: 'The Lab',
  tagline: 'Your AI team, and the purity is non-negotiable.',
  palette: labPalette,
  scene: labScene,
  buildScene: buildLabScene,
  characters: labCharacters,
  suggestedLeaderId: 'walter'
}
