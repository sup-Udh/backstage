import type { Prop, SceneDef, ThemePalette } from '../types'
import type { Op } from '../../world/pixel/ops'
import { backdrop } from '../shared/room'
import { cabinet, clockFace, deskUnit, wallSign } from '../shared/props'
import { barrel, glassware, labBench, poster, waterCooler } from '../shared/furniture'

/** An industrial lab: pale institutional walls, concrete, acid green. */
export const labPalette: ThemePalette = {
  brand: '#FFC94F',
  brandLite: '#FFE29A',
  brandPale: '#FCF0CC',
  brandDeep: '#E0A230',
  brandShadow: '#A8761A',

  ink: '#1B2019',
  ink2: '#2C3329',
  ink3: '#4A5346',

  cream: '#EFEEE0',
  cream2: '#DAD9C6',
  white: '#FBFBF2',

  wall: '#BCC0A8',
  wallLite: '#CED2BA',
  wallShade: '#A2A78E',

  floor: '#9C9C92',
  floorLit: '#ACACA2',
  floorAlt: '#909086',
  floorLine: '#7C7C73',
  floorShadow: '#6C6C64',

  wood: '#9CA29C',
  woodDark: '#767C76',
  woodLite: '#B6BCB4',

  screen: '#1A231E',
  screenLite: '#2A382E',

  sage: '#7BA05B',
  sageDark: '#5A7A40',
  sageLite: '#9DC178',

  rust: '#A8623A',
  cork: '#A98C5E',
  corkDark: '#846B45',

  accent: '#6E8F4A',
  accentLite: '#8CB065',
  accentDark: '#4F6C33',

  paper: '#FBFBF2',
  paperShade: '#DEDDCC',

  steel: '#B4B8B8',
  steelDark: '#7F8484'
}

const STATIONS = [32, 96, 160, 224, 288, 352]
const STATION_Y = 84
const HORIZON = 72
const WIDTH = 480
const HEIGHT = 240
const DESK_BASE = 22
const SEAT_DX = 30
const SEAT_DY = 5

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 610 + i * 29))

function fumeHood(x: number, y: number, w: number): Op[] {
  return [
    // Back interior
    [x, y - 50, w, 50, 'screen'],
    // Glass sash (half open)
    [x, y - 50, w, 20, 'screenLite'],
    // Work surface
    ...labBench(x, y, w),
    // Side panels
    [x - 2, y - 50, 2, 50, 'steelDark'],
    [x + w, y - 50, 2, 50, 'steelDark'],
    // Top vent
    [x, y - 60, w, 10, 'steel']
  ]
}

function safetyShower(x: number, y: number): Op[] {
  return [
    // Pipe up the wall
    [x, y - 60, 2, 60, 'steel'],
    // Shower head
    [x - 6, y - 60, 14, 4, 'steelDark'],
    [x - 4, y - 56, 10, 2, 'steel'],
    // Pull handle
    [x + 4, y - 56, 1, 30, 'steel'],
    [x + 2, y - 26, 5, 4, 'brand'] // yellow pull base
  ]
}

function props(): Prop[] {
  const list: Prop[] = []
  
  // Posters and signs on the top wall
  list.push({ id: 'poster-1', ops: poster(18, 12, 36, 30, 101), baseY: 0 })
  list.push({ id: 'sign-1', ops: wallSign(112, 22), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(160, 12, 32, 30, 112), baseY: 0 })
  list.push({ id: 'poster-3', ops: poster(244, 14, 40, 26, 123), baseY: 0 })
  list.push({ id: 'poster-4', ops: poster(320, 16, 28, 28, 134), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(450, 24, 7), baseY: 0 })

  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))

  // Fume hood area on the far right top wall
  list.push({ id: 'fume-hood', ops: fumeHood(410, 84, 50), baseY: 84 })
  
  // Hazmat storage cabinet on far left top wall
  list.push({ id: 'hazmat-cabinet', ops: cabinet(8, 100), baseY: 100 })
  
  // Safety shower near fume hood
  list.push({ id: 'safety-shower', ops: safetyShower(470, 84), baseY: 84 })

  // Middle benches
  list.push({ id: 'bench-mid', ops: labBench(80, 136, 120), baseY: 136 })
  list.push({ id: 'glass-mid-1', ops: glassware(88, 118, 137), baseY: 136.5 })
  list.push({ id: 'glass-mid-2', ops: glassware(140, 118, 149), baseY: 136.5 })

  list.push({ id: 'bench-mid-2', ops: labBench(260, 136, 100), baseY: 136 })
  list.push({ id: 'glass-mid-3', ops: glassware(270, 118, 155), baseY: 136.5 })
  list.push({ id: 'glass-mid-4', ops: glassware(310, 118, 166), baseY: 136.5 })

  // Lower benches
  list.push({ id: 'bench-low', ops: labBench(140, 210, 160), baseY: 210 })
  list.push({ id: 'glass-low-1', ops: glassware(150, 192, 177), baseY: 210.5 })
  list.push({ id: 'glass-low-2', ops: glassware(200, 192, 188), baseY: 210.5 })
  list.push({ id: 'glass-low-3', ops: glassware(250, 192, 199), baseY: 210.5 })

  // Additional barrels and hazmat feel
  list.push({ id: 'barrel-1', ops: barrel(20, 210), baseY: 210 })
  list.push({ id: 'barrel-2', ops: barrel(44, 206), baseY: 206 })
  list.push({ id: 'barrel-3', ops: barrel(32, 222), baseY: 222 })
  
  list.push({ id: 'barrel-4', ops: barrel(420, 200), baseY: 200 })
  list.push({ id: 'barrel-5', ops: barrel(444, 210), baseY: 210 })

  list.push({ id: 'cooler', ops: waterCooler(450, 140), baseY: 140 })

  return list
}

export const labScene: SceneDef = {
  width: WIDTH,
  height: HEIGHT,
  horizon: HORIZON,
  background: backdrop({
    width: WIDTH,
    height: HEIGHT,
    horizon: HORIZON,
    floorStyle: 'concrete',
    wallStyle: 'brick'
  }),
  props: props(),
  
  desks: STATIONS.map((x) => ({
    x: x + SEAT_DX,
    y: STATION_Y + SEAT_DY,
    facing: 'down'
  })),
  deskBaseY: STATION_Y + DESK_BASE,
  
  boardSpots: [
    { x: 410, y: 104, facing: 'up' },
    { x: 430, y: 104, facing: 'up' },
    { x: 450, y: 104, facing: 'up' }
  ],
  
  talkSpots: [
    [
      { x: 60, y: 160, facing: 'right' },
      { x: 84, y: 160, facing: 'left' }
    ],
    [
      { x: 220, y: 160, facing: 'right' },
      { x: 244, y: 160, facing: 'left' }
    ],
    [
      { x: 380, y: 160, facing: 'right' },
      { x: 404, y: 160, facing: 'left' }
    ],
    [
      { x: 100, y: 220, facing: 'right' },
      { x: 124, y: 220, facing: 'left' }
    ],
    [
      { x: 340, y: 220, facing: 'right' },
      { x: 364, y: 220, facing: 'left' }
    ]
  ],
  
  coffeeSpots: [
    { x: 430, y: 154, facing: 'right' },
    { x: 466, y: 154, facing: 'left' },
    { x: 450, y: 166, facing: 'up' }
  ],
  
  wanderSpots: [
    { x: 40, y: 120, facing: 'down' },
    { x: 210, y: 110, facing: 'down' },
    { x: 380, y: 110, facing: 'right' },
    { x: 50, y: 175, facing: 'right' },
    { x: 140, y: 170, facing: 'up' },
    { x: 260, y: 175, facing: 'left' },
    { x: 360, y: 170, facing: 'up' },
    { x: 420, y: 175, facing: 'left' },
    { x: 80, y: 190, facing: 'down' },
    { x: 320, y: 190, facing: 'down' },
    { x: 440, y: 190, facing: 'up' },
    { x: 160, y: 230, facing: 'right' },
    { x: 280, y: 230, facing: 'left' }
  ],
  
  laneY: 175,
  
  monitors: desks.map((d) => d.monitor),
  steamVents: [
    { x: 420, y: 72, baseY: 84 },
    { x: 440, y: 72, baseY: 84 },
    { x: 100, y: 124, baseY: 136 },
    { x: 160, y: 124, baseY: 136 },
    { x: 280, y: 124, baseY: 136 },
    { x: 180, y: 198, baseY: 210 },
    { x: 240, y: 198, baseY: 210 }
  ],
  leds: [...desks.map((d) => d.led), { x: 420, y: 92 }],
  clock: { x: 450, y: 24, r: 7 }
}
