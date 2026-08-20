import type { Theme } from '../types'
import { sherlockCharacters } from './characters'
import { sherlockPalette, sherlockScene } from './environment'

export const sherlockTheme: Theme = {
  id: 'sherlock',
  name: 'Baker Street',
  tagline: 'Your AI team, and one of them is insufferable about it.',
  palette: sherlockPalette,
  scene: sherlockScene,
  characters: sherlockCharacters
}
