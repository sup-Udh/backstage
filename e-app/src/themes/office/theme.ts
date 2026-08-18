import type { Theme } from '../types'
import { officeCharacters } from './characters'
import { officePalette, officeScene } from './environment'

export const officeTheme: Theme = {
  id: 'office',
  name: 'The Branch',
  tagline: 'Your AI team has a meeting about the meeting.',
  palette: officePalette,
  scene: officeScene,
  characters: officeCharacters
}
