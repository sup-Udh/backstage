import type { Theme } from '../types'
import { sherlockCharacters } from './characters'
import { sherlockPalette, buildSherlockScene, sherlockScene } from './environment'

export const sherlockTheme: Theme = {
  id: 'sherlock',
  name: 'Baker Street',
  tagline: 'Your AI team, and one of them is insufferable about it.',
  palette: sherlockPalette,
  scene: sherlockScene,
  buildScene: buildSherlockScene,
  characters: sherlockCharacters,
  suggestedLeaderId: 'holmes'
}
