import type { Op } from '../../world/pixel/ops'
import type { Prop, SceneDef, ThemePalette } from '../types'
import { backdrop, standardLayout } from '../shared/room'
import { clockFace, deskUnit, plant, windowUnit, rug, coffeeStation } from '../shared/props'
import { armchair, couch, kitchenCounter, poster, coffeeTable, bookcase } from '../shared/furniture'

/** A warm sitcom apartment: purple walls, an orange couch, late afternoon. */
export const friendsPalette: ThemePalette = {
  brand: '#FFC94F',
  brandLite: '#FFE29A',
  brandPale: '#FFF3D0',
  brandDeep: '#E8A128',
  brandShadow: '#C97F1C',

  ink: '#241C2E',
  ink2: '#3A2E48',
  ink3: '#5B4A6B',

  cream: '#FFF3E2',
  cream2: '#F2E0C8',
  white: '#FFFFFF',

  wall: '#9C7FB0',
  wallLite: '#B294C4',
  wallShade: '#816497',

  floor: '#D9BB90',
  floorLit: '#E7CDA8',
  floorAlt: '#CCAC7E',
  floorLine: '#B69163',
  floorShadow: '#A67F52',

  wood: '#B48A55',
  woodDark: '#8A6236',
  woodLite: '#D2A46E',

  screen: '#2A2338',
  screenLite: '#3B3150',

  sage: '#7E9C6B',
  sageDark: '#5C7A4C',
  sageLite: '#9EBB87',

  rust: '#C6642F',
  cork: '#C9A06B',
  corkDark: '#A9834F',

  accent: '#C6642F',
  accentLite: '#E08348',
  accentDark: '#96461E',

  paper: '#FFFDF5',
  paperShade: '#E7DFC9',

  steel: '#B9B2C4',
  steelDark: '#847C93'
}

const STATIONS = [20, 94, 168, 242, 316, 390]
const STATION_Y = 96
const HORIZON = 72

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 210 + i * 13))
const coffee = coffeeStation(380, 146)

/** The apartment's signature: an empty gilt frame hung on the wall. */
function giltFrame(x: number, y: number, w: number, h: number): Op[] {
  return [
    [x, y, w, h, 'brandShadow'],
    [x + 2, y + 2, w - 4, h - 4, 'brand'],
    [x + 4, y + 4, w - 8, h - 8, 'brandShadow'],
    [x + 5, y + 5, w - 10, h - 10, 'wall']
  ]
}

function background(): Op[] {
  return backdrop({
    width: 480,
    height: 240,
    horizon: HORIZON,
    floorStyle: 'planks',
    wallStyle: 'plain',
    lightPools: [
      [32, 44],
      [112, 44],
      [312, 44],
      [392, 44]
    ]
  })
}

function props(): Prop[] {
  const list: Prop[] = []
  // Left Area: Living Space
  list.push({ id: 'rug', ops: rug(30, 160, 200, 70), baseY: 0 })
  list.push({ id: 'couch', ops: couch(110, 210, 80), baseY: 211 })
  list.push({ id: 'armchair-1', ops: armchair(50, 190), baseY: 191 })
  list.push({ id: 'armchair-2', ops: armchair(200, 200), baseY: 201 })
  list.push({ id: 'coffee-table', ops: coffeeTable(120, 196), baseY: 197 })
  
  // Right Area: Kitchen
  list.push({ id: 'kitchen', ops: kitchenCounter(270, 146, 100), baseY: 147 })
  list.push({ id: 'coffee', ops: coffee.ops, baseY: 147 })
  list.push({ id: 'bookcase', ops: bookcase(446, 120, 26, 50), baseY: 121 })

  // Wall Decor & Windows
  list.push({ id: 'window-1', ops: windowUnit(30, 14, 46, 34), baseY: 0 })
  list.push({ id: 'window-2', ops: windowUnit(110, 14, 46, 34), baseY: 0 })
  list.push({ id: 'poster-1', ops: poster(170, 16, 26, 26, 5), baseY: 0 })
  list.push({ id: 'frame', ops: giltFrame(220, 18, 34, 30), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(270, 14, 30, 24, 12), baseY: 0 })
  list.push({ id: 'window-3', ops: windowUnit(310, 14, 46, 34), baseY: 0 })
  list.push({ id: 'window-4', ops: windowUnit(390, 14, 46, 34), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(460, 36, 8), baseY: 0 })

  // Desks
  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))

  // Plants
  list.push({ id: 'plant-1', ops: plant(14, 140, 6), baseY: 140 })
  list.push({ id: 'plant-2', ops: plant(460, 210, 12), baseY: 210 })
  list.push({ id: 'plant-3', ops: plant(250, 140, 15), baseY: 140 })
  
  return list
}

export const friendsScene: SceneDef = {
  width: 480,
  height: 240,
  horizon: HORIZON,
  background: background(),
  props: props(),
  ...standardLayout({ stations: STATIONS, stationY: STATION_Y }),
  talkSpots: [
    [
      { x: 70, y: 170, facing: 'right' },
      { x: 94, y: 170, facing: 'left' }
    ],
    [
      { x: 230, y: 180, facing: 'right' },
      { x: 254, y: 180, facing: 'left' }
    ],
    [
      { x: 300, y: 180, facing: 'right' },
      { x: 324, y: 180, facing: 'left' }
    ],
    [
      { x: 380, y: 190, facing: 'right' },
      { x: 404, y: 190, facing: 'left' }
    ],
    [
      { x: 150, y: 140, facing: 'right' },
      { x: 174, y: 140, facing: 'left' }
    ]
  ],
  boardSpots: [
    { x: 206, y: 104, facing: 'up' },
    { x: 226, y: 104, facing: 'up' },
    { x: 246, y: 104, facing: 'up' }
  ],
  coffeeSpots: [
    { x: 370, y: 160, facing: 'up' },
    { x: 390, y: 160, facing: 'up' },
    { x: 410, y: 160, facing: 'up' }
  ],
  wanderSpots: [
    { x: 40, y: 140, facing: 'down' },
    { x: 90, y: 140, facing: 'down' },
    { x: 140, y: 135, facing: 'down' },
    { x: 200, y: 140, facing: 'down' },
    { x: 260, y: 145, facing: 'left' },
    { x: 280, y: 135, facing: 'down' },
    { x: 320, y: 140, facing: 'down' },
    { x: 360, y: 135, facing: 'down' },
    { x: 420, y: 145, facing: 'down' },
    { x: 440, y: 170, facing: 'left' },
    { x: 280, y: 190, facing: 'up' },
    { x: 180, y: 210, facing: 'up' },
    { x: 50, y: 150, facing: 'right' },
    { x: 130, y: 150, facing: 'right' },
    { x: 450, y: 200, facing: 'up' }
  ],
  laneY: 150,
  monitors: desks.map((d) => d.monitor),
  steamVents: [{ ...coffee.steam, baseY: 147 }],
  leds: [...desks.map((d) => d.led)],
  clock: { x: 460, y: 36, r: 8 }
}
