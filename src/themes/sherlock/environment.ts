import type { Prop, SceneDef, ThemePalette } from '../types'
import { backdrop } from '../shared/room'
import { clockFace, deskUnit, plant, windowUnit, rug, SEAT_DX, SEAT_DY, DESK_BASE } from '../shared/props'
import { armchair, bookcase, fireplace, poster, wallLamp, labBench, glassware, coffeeStation } from '../shared/furniture'
import type { Op } from '../../world/pixel/ops'

/** A dark London study: deep teal walls, dark wood, lamplight and firelight. */
export const sherlockPalette: ThemePalette = {
  brand: '#FFC94F',
  brandLite: '#FFE29A',
  brandPale: '#F6E3B4',
  brandDeep: '#D9973A',
  brandShadow: '#A56B1E',

  ink: '#14191C',
  ink2: '#232C30',
  ink3: '#3E4A50',

  cream: '#E5DCC8',
  cream2: '#CFC4AB',
  white: '#F6F1E4',

  wall: '#3A4A4E',
  wallLite: '#485B60',
  wallShade: '#2B383B',

  floor: '#5B4632',
  floorLit: '#6E5740',
  floorAlt: '#4F3D2B',
  floorLine: '#3F3123',
  floorShadow: '#2E241A',

  wood: '#7A5636',
  woodDark: '#553A24',
  woodLite: '#9C7248',

  screen: '#161D22',
  screenLite: '#24303A',

  sage: '#5E7A55',
  sageDark: '#42583B',
  sageLite: '#7E9B72',

  rust: '#8C3A3A',
  cork: '#8F6E45',
  corkDark: '#6D5233',

  accent: '#8C3A3A',
  accentLite: '#AC5252',
  accentDark: '#642727',

  paper: '#EFE7D4',
  paperShade: '#D2C8B0',

  steel: '#8D959A',
  steelDark: '#5E686D'
}

const STATIONS = [80, 135, 190, 245, 300, 355]
const STATION_Y = 88
const HORIZON = 72

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 410 + i * 19))

function violinStand(x: number, y: number): Op[] {
  return [
    [x - 3, y - 1, 8, 3, 'floorShadow'],
    [x, y - 24, 2, 24, 'woodDark'],
    [x - 4, y - 2, 10, 2, 'ink'],
    [x - 2, y - 20, 6, 14, 'wood'],
    [x - 1, y - 22, 4, 2, 'woodDark'],
    [x, y - 26, 2, 4, 'ink']
  ]
}

function props(): Prop[] {
  const list: Prop[] = []

  // Walls
  list.push({ id: 'window-1', ops: windowUnit(80, 12, 100, 40), baseY: 0 })
  list.push({ id: 'window-2', ops: windowUnit(280, 12, 100, 40), baseY: 0 })
  list.push({ id: 'lamp-1', ops: wallLamp(40, 24), baseY: 0 })
  list.push({ id: 'lamp-2', ops: wallLamp(230, 24), baseY: 0 })
  list.push({ id: 'lamp-3', ops: wallLamp(430, 24), baseY: 0 })
  list.push({ id: 'poster-1', ops: poster(195, 16, 26, 30, 11), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(400, 16, 26, 30, 22), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(250, 24, 8), baseY: 0 })

  // Back row
  list.push({ id: 'fireplace', ops: fireplace(16, 110, 46), baseY: 110 })
  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))
  list.push({ id: 'lab-bench', ops: labBench(418, 110, 54), baseY: 110 })
  list.push({ id: 'glassware', ops: glassware(426, 110, 42), baseY: 110 })

  // Left Nook
  list.push({ id: 'rug-l', ops: rug(16, 180, 80, 40), baseY: 0 })
  list.push({ id: 'bookcase-l', ops: bookcase(16, 185, 30, 46), baseY: 185 })
  list.push({ id: 'armchair-l1', ops: armchair(24, 215), baseY: 216 })
  list.push({ id: 'armchair-l2', ops: armchair(70, 215), baseY: 216 })
  list.push({ id: 'plant-1', ops: plant(94, 200, 27), baseY: 200 })

  // Center
  const coffee = coffeeStation(240, 190)
  list.push({ id: 'coffee-station', ops: coffee.ops, baseY: 190 })
  list.push({ id: 'violin', ops: violinStand(160, 200), baseY: 200 })
  list.push({ id: 'plant-2', ops: plant(200, 195, 42), baseY: 195 })

  // Right Nook
  list.push({ id: 'rug-r', ops: rug(384, 180, 80, 40), baseY: 0 })
  list.push({ id: 'bookcase-r', ops: bookcase(434, 185, 30, 46), baseY: 185 })
  list.push({ id: 'armchair-r1', ops: armchair(390, 215), baseY: 216 })
  list.push({ id: 'armchair-r2', ops: armchair(436, 215), baseY: 216 })

  return list
}

export const sherlockScene: SceneDef = {
  width: 480,
  height: 240,
  horizon: HORIZON,
  background: backdrop({
    width: 480,
    height: 240,
    horizon: HORIZON,
    floorStyle: 'planks',
    wallStyle: 'panelled',
    lightPools: [
      [130, 100],
      [330, 100]
    ]
  }),
  props: props(),
  desks: STATIONS.map((x) => ({
    x: x + SEAT_DX,
    y: STATION_Y + SEAT_DY,
    facing: 'down'
  })),
  deskBaseY: STATION_Y + DESK_BASE,
  boardSpots: [
    { x: 30, y: 124, facing: 'up' },
    { x: 54, y: 124, facing: 'up' },
    { x: 440, y: 124, facing: 'up' }
  ],
  talkSpots: [
    [
      { x: 120, y: 160, facing: 'right' },
      { x: 144, y: 160, facing: 'left' }
    ],
    [
      { x: 200, y: 154, facing: 'right' },
      { x: 224, y: 154, facing: 'left' }
    ],
    [
      { x: 300, y: 160, facing: 'right' },
      { x: 324, y: 160, facing: 'left' }
    ],
    [
      { x: 160, y: 220, facing: 'right' },
      { x: 184, y: 220, facing: 'left' }
    ],
    [
      { x: 320, y: 220, facing: 'right' },
      { x: 344, y: 220, facing: 'left' }
    ]
  ],
  coffeeSpots: [
    { x: 240, y: 204, facing: 'up' },
    { x: 260, y: 204, facing: 'up' },
    { x: 280, y: 204, facing: 'up' }
  ],
  wanderSpots: [
    { x: 60, y: 150, facing: 'right' },
    { x: 90, y: 160, facing: 'down' },
    { x: 170, y: 156, facing: 'down' },
    { x: 250, y: 150, facing: 'left' },
    { x: 350, y: 158, facing: 'down' },
    { x: 410, y: 150, facing: 'left' },
    { x: 450, y: 156, facing: 'up' },
    { x: 110, y: 210, facing: 'right' },
    { x: 140, y: 220, facing: 'left' },
    { x: 210, y: 215, facing: 'right' },
    { x: 360, y: 210, facing: 'left' },
    { x: 380, y: 224, facing: 'down' },
    { x: 460, y: 220, facing: 'up' }
  ],
  laneY: 160,
  monitors: desks.map((d) => d.monitor),
  steamVents: [
    { x: 38, y: 102, baseY: 110 },
    { x: 253, y: 165, baseY: 190 }
  ],
  leds: desks.map((d) => d.led),
  clock: { x: 250, y: 24, r: 8 }
}
