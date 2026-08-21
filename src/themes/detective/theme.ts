import type { Theme } from '../types'
import { detectivePalette } from './environment/palette'
import { buildDetectiveScene, detectiveScene } from './environment/scene'
import { detectiveCharacters } from './characters'

export const detectiveTheme: Theme = {
  id: 'detective',
  name: 'Detective Office',
  tagline: 'A consulting team, a corkboard, and far too much coffee.',
  palette: detectivePalette,
  scene: detectiveScene,
  buildScene: buildDetectiveScene,
  characters: detectiveCharacters,
  suggestedLeaderId: 'jane'
}
