import type { Theme } from '../types'
import { strangerCharacters } from './characters'
import { strangerPalette, strangerScene } from './environment'

export const strangerTheme: Theme = {
  id: 'stranger',
  name: 'The Basement',
  tagline: 'Your AI team, after dark, on a school night.',
  palette: strangerPalette,
  scene: strangerScene,
  characters: strangerCharacters
}
