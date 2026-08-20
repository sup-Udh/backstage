import type { Theme } from '../types'
import { friendsCharacters } from './characters'
import { friendsPalette, friendsScene } from './environment'

export const friendsTheme: Theme = {
  id: 'friends',
  name: 'The Apartment',
  tagline: 'Your AI team, but nobody ever leaves the couch.',
  palette: friendsPalette,
  scene: friendsScene,
  characters: friendsCharacters
}
