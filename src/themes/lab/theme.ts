import type { Theme } from '../types'
import { labCharacters } from './characters'
import { labPalette, labScene } from './environment'

export const labTheme: Theme = {
  id: 'lab',
  name: 'The Lab',
  tagline: 'Your AI team, and the purity is non-negotiable.',
  palette: labPalette,
  scene: labScene,
  characters: labCharacters
}
