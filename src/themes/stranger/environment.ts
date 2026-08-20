import type { Prop, SceneDef, ThemePalette } from '../types'
import { backdrop } from '../shared/room'
import { clockFace, deskUnit, plant, rug, windowUnit, whiteboard, shelfUnit, DESK_BASE, SEAT_DX, SEAT_DY } from '../shared/props'
import {
  arcadeCabinet,
  armchair,
  coffeeTable,
  couch,
  crtSet,
  poster,
  stringLights
} from '../shared/furniture'

/** A basement at night: wood panelling, navy dark, fairy lights, CRT glow. */
export const strangerPalette: ThemePalette = {
  brand: '#FFC94F',
  brandLite: '#FFE29A',
  brandPale: '#F4E1AE',
  brandDeep: '#D8983C',
  brandShadow: '#A16A1E',

  ink: '#12141F',
  ink2: '#1F2434',
  ink3: '#39415A',

  cream: '#E2DCCC',
  cream2: '#C7C0AE',
  white: '#F2EEE2',

  wall: '#2E3550',
  wallLite: '#3B4466',
  wallShade: '#232941',

  floor: '#6B5340',
  floorLit: '#7E6450',
  floorAlt: '#5D4736',
  floorLine: '#4B392B',
  floorShadow: '#382A20',

  wood: '#7A5A3C',
  woodDark: '#553F29',
  woodLite: '#9A7550',

  screen: '#101726',
  screenLite: '#1E2C42',

  sage: '#5F8F6A',
  sageDark: '#436A4C',
  sageLite: '#84B58E',

  rust: '#B03A3A',
  cork: '#8A6A46',
  corkDark: '#684F34',

  accent: '#B03A3A',
  accentLite: '#D25757',
  accentDark: '#7E2626',

  paper: '#EDE7D6',
  paperShade: '#CDC5B0',

  steel: '#8B93A8',
  steelDark: '#5C6479'
}

const STATIONS = [30, 100, 170, 240, 310, 380]
const STATION_Y = 100
const HORIZON = 72

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 510 + i * 23))

function props(): Prop[] {
  const list: Prop[] = []
  
  // Window on left
  list.push({ id: 'window', ops: windowUnit(20, 10, 60, 50), baseY: 0 })
  
  // Wider string lights across full wall.
  list.push({ id: 'lights-1', ops: stringLights(0, 8, 240, 77), baseY: 0 })
  list.push({ id: 'lights-2', ops: stringLights(240, 8, 240, 88), baseY: 0 })
  
  // Map wall area
  list.push({ id: 'map-board', ops: whiteboard(100, 20, 80, 40), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(200, 34, 7), baseY: 0 })
  
  // Additional posters
  list.push({ id: 'poster-1', ops: poster(230, 24, 30, 26, 61), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(270, 26, 34, 24, 72), baseY: 0 })
  list.push({ id: 'poster-3', ops: poster(320, 20, 24, 34, 83), baseY: 0 })
  list.push({ id: 'poster-4', ops: poster(360, 24, 30, 26, 94), baseY: 0 })
  list.push({ id: 'poster-5', ops: poster(410, 26, 32, 24, 105), baseY: 0 })

  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))

  // Arcade cabinets
  list.push({ id: 'arcade-1', ops: arcadeCabinet(30, 150), baseY: 150 })
  list.push({ id: 'arcade-2', ops: arcadeCabinet(62, 144), baseY: 144 })
  list.push({ id: 'arcade-3', ops: arcadeCabinet(94, 150), baseY: 150 })

  // Radio corner
  list.push({ id: 'radio-shelf', ops: shelfUnit(380, 120, 40), baseY: 152 })
  list.push({ id: 'crt-table', ops: coffeeTable(425, 150), baseY: 149 })
  list.push({ id: 'crt', ops: crtSet(431, 148), baseY: 148 })

  // Blanket/fort area with rug
  list.push({ id: 'fort-rug', ops: rug(180, 160, 120, 70), baseY: 0 })
  list.push({ id: 'fort-couch', ops: couch(190, 190, 50), baseY: 190 })
  list.push({ id: 'fort-armchair', ops: armchair(270, 190), baseY: 190 })

  list.push({ id: 'plant-1', ops: plant(140, 160, 37), baseY: 160 })
  list.push({ id: 'plant-2', ops: plant(350, 180, 42), baseY: 180 })

  return list
}

export const strangerScene: SceneDef = {
  width: 480,
  height: 240,
  horizon: HORIZON,
  background: backdrop({
    width: 480,
    height: 240,
    horizon: HORIZON,
    floorStyle: 'concrete',
    wallStyle: 'stripe'
  }),
  props: props(),
  desks: STATIONS.map((x) => ({
    x: x + SEAT_DX,
    y: STATION_Y + SEAT_DY,
    facing: 'down'
  })),
  deskBaseY: STATION_Y + DESK_BASE,
  boardSpots: [
    { x: 110, y: 90, facing: 'up' },
    { x: 140, y: 90, facing: 'up' },
    { x: 170, y: 90, facing: 'up' }
  ],
  talkSpots: [
    [{ x: 40, y: 190, facing: 'right' }, { x: 64, y: 190, facing: 'left' }],
    [{ x: 140, y: 180, facing: 'right' }, { x: 164, y: 180, facing: 'left' }],
    [{ x: 220, y: 200, facing: 'right' }, { x: 244, y: 200, facing: 'left' }],
    [{ x: 300, y: 195, facing: 'right' }, { x: 324, y: 195, facing: 'left' }],
    [{ x: 380, y: 180, facing: 'right' }, { x: 404, y: 180, facing: 'left' }]
  ],
  coffeeSpots: [
    { x: 430, y: 180, facing: 'up' },
    { x: 450, y: 180, facing: 'up' },
    { x: 410, y: 170, facing: 'up' }
  ],
  wanderSpots: [
    { x: 40, y: 170, facing: 'down' },
    { x: 100, y: 175, facing: 'down' },
    { x: 180, y: 160, facing: 'right' },
    { x: 260, y: 155, facing: 'left' },
    { x: 340, y: 160, facing: 'up' },
    { x: 420, y: 165, facing: 'down' },
    { x: 60, y: 210, facing: 'right' },
    { x: 120, y: 205, facing: 'left' },
    { x: 200, y: 215, facing: 'down' },
    { x: 280, y: 210, facing: 'down' },
    { x: 360, y: 205, facing: 'left' },
    { x: 440, y: 210, facing: 'up' },
    { x: 80, y: 185, facing: 'right' },
    { x: 320, y: 175, facing: 'left' }
  ],
  laneY: 135,
  monitors: desks.map((d) => d.monitor),
  steamVents: [],
  leds: [...desks.map((d) => d.led), { x: 46, y: 110 }, { x: 78, y: 104 }], // Extra LEDs for arcades
  clock: { x: 200, y: 34, r: 7 }
}
