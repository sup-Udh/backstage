import type { ThemePalette } from '../../types'

/**
 * Built around #FFC94F. The yellow is the accent, never the field: the room
 * is mostly warm cream and off-white, held together by very dark outlines,
 * with yellow reserved for light sources, signage, screens and sticky notes.
 */
export const detectivePalette: ThemePalette = {
  brand: '#FFC94F',
  brandLite: '#FFE29A',
  brandPale: '#FFF3D0',
  brandDeep: '#E8A128',
  brandShadow: '#C97F1C',

  ink: '#1B1B2A',
  ink2: '#2E2E45',
  ink3: '#4A4A63',

  cream: '#FFF6E4',
  cream2: '#F5E7CC',
  white: '#FFFFFF',

  wall: '#FBF1DC',
  wallLite: '#FFF8E9',
  wallShade: '#EEDFC1',

  floor: '#E7D7B8',
  floorLit: '#EDE1C4',
  floorAlt: '#E0CEAA',
  floorLine: '#D0BA92',
  floorShadow: '#C9B189',

  wood: '#B98A55',
  woodDark: '#8A6236',
  woodLite: '#D3A972',

  screen: '#232338',
  screenLite: '#31314F',

  sage: '#7E9C6B',
  sageDark: '#5C7A4C',
  sageLite: '#9EBB87',

  rust: '#B4553F',
  cork: '#C9A06B',
  corkDark: '#A9834F',

  paper: '#FFFDF5',
  paperShade: '#E7DFC9',

  steel: '#AFAFC0',
  steelDark: '#7B7B8F'
}
