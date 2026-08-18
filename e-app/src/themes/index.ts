import type { Op } from '../world/pixel/ops'
import type { Theme, ThemeTeaser } from './types'
import { detectiveTheme } from './detective/theme'

/**
 * The theme registry. Only one theme is built, but the landing page reads
 * from this list rather than importing the detective theme directly, so
 * adding a second world is a registry entry rather than a refactor.
 */
export const themes: Record<string, Theme> = {
  detective: detectiveTheme
}

export const defaultThemeId = 'detective'

export function getTheme(id: string = defaultThemeId): Theme {
  return themes[id] ?? detectiveTheme
}

/* --------------------------------------------------------------- teasers -- */

const PW = 56
const PH = 34

/**
 * Previews for worlds that do not exist yet. They are drawn in the brand
 * palette rather than in each world's imagined colours, so the "choose your
 * world" row reads as one coherent set instead of four clashing thumbnails.
 */
function frame(): Op[] {
  return [
    [0, 0, PW, PH, 'ink'],
    [1, 1, PW - 2, PH - 2, 'cream'],
    [1, PH - 9, PW - 2, 8, 'cream2'],
    [1, PH - 9, PW - 2, 1, 'ink']
  ]
}

/**
 * A stand-in figure, so every world reads as inhabited rather than as an
 * empty set. Head and shoulders touch: a gap between them reads as two
 * unrelated blocks at this size. `y` is the figure's feet.
 */
function figure(x: number, y: number, body = 'brandDeep'): Op[] {
  return [
    [x, y - 12, 5, 5, 'ink'],
    [x + 1, y - 11, 3, 3, 'brandLite'],
    [x - 1, y - 7, 7, 7, 'ink'],
    [x, y - 6, 5, 5, body]
  ]
}

const detectivePreview: Op[] = [
  ...frame(),
  // Corkboard and desk.
  [8, 5, 16, 12, 'ink'],
  [9, 6, 14, 10, 'brandDeep'],
  [11, 8, 4, 3, 'cream'],
  [17, 9, 4, 4, 'brand'],
  [32, 14, 16, 5, 'ink'],
  [33, 15, 14, 3, 'brand'],
  [36, 7, 9, 7, 'ink'],
  [37, 8, 7, 5, 'brandLite'],
  ...figure(17, 31),
  ...figure(33, 31, 'brand')
]

const spacePreview: Op[] = [
  ...frame(),
  // Porthole and console.
  [8, 4, 18, 16, 'ink'],
  [9, 5, 16, 14, 'brandPale'],
  [12, 8, 2, 2, 'brand'],
  [18, 12, 2, 2, 'brand'],
  [15, 15, 2, 2, 'brandDeep'],
  [34, 10, 16, 10, 'ink'],
  [35, 11, 14, 8, 'brandLite'],
  [37, 13, 4, 1, 'ink'],
  [37, 15, 8, 1, 'ink'],
  ...figure(29, 31, 'brand')
]

const cyberPreview: Op[] = [
  ...frame(),
  // Stacked signage and a rain-streaked window.
  [6, 4, 10, 16, 'ink'],
  [7, 5, 8, 14, 'brand'],
  [20, 3, 6, 18, 'ink'],
  [21, 4, 4, 16, 'brandDeep'],
  [31, 6, 18, 12, 'ink'],
  [32, 7, 16, 10, 'brandPale'],
  [34, 9, 12, 1, 'brandShadow'],
  [34, 12, 8, 1, 'brandShadow'],
  [40, 2, 1, 20, 'brandLite'],
  [45, 4, 1, 16, 'brandLite'],
  ...figure(25, 31, 'brandLite')
]

const customPreview: Op[] = [
  ...frame(),
  // An empty grid waiting to be filled in.
  ...Array.from({ length: 5 }, (_, i): Op => [8 + i * 10, 5, 1, 16, 'cream2']),
  ...Array.from({ length: 3 }, (_, i): Op => [8, 5 + i * 8, 41, 1, 'cream2']),
  [24, 10, 9, 3, 'ink'],
  [27, 7, 3, 9, 'ink'],
  [25, 11, 7, 1, 'brand'],
  [28, 8, 1, 7, 'brand']
]

export const themeTeasers: ThemeTeaser[] = [
  {
    id: 'detective',
    name: 'Detective Office',
    blurb: 'Corkboards, case files and a consulting team.',
    preview: { width: PW, height: PH, ops: detectivePreview }
  },
  {
    id: 'space',
    name: 'Space Station',
    blurb: 'A long-haul crew running ops in orbit.',
    preview: { width: PW, height: PH, ops: spacePreview }
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk HQ',
    blurb: 'A back-alley crew and a wall of rented compute.',
    preview: { width: PW, height: PH, ops: cyberPreview }
  },
  {
    id: 'custom',
    name: 'Your World',
    blurb: 'Bring your own cast, rooms and rules.',
    preview: { width: PW, height: PH, ops: customPreview }
  }
]
