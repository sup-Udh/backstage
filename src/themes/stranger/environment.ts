import type { Prop, SceneDef, ThemePalette } from '../types'
import { backdrop, standardLayout } from '../shared/room'
import { clockFace, deskUnit, plant } from '../shared/props'
import {
  arcadeCabinet,
  coffeeTable,
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

const STATIONS = [8, 66, 190]
const STATION_Y = 80
const HORIZON = 60

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 510 + i * 23))

function props(): Prop[] {
  const list: Prop[] = []
  // The signature of the room: a run of fairy lights along the wall.
  list.push({ id: 'lights', ops: stringLights(6, 8, 308, 77), baseY: 0 })
  list.push({ id: 'poster', ops: poster(30, 24, 30, 26, 61), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(96, 26, 34, 24, 72), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(160, 34, 7), baseY: 0 })
  list.push({ id: 'poster-3', ops: poster(200, 24, 30, 26, 83), baseY: 0 })
  list.push({ id: 'poster-4', ops: poster(252, 26, 32, 24, 94), baseY: 0 })

  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))

  // The CRT stands on its own table: the set sorts behind the table front,
  // so the table edge overlaps its base and it reads as sitting on it.
  list.push({ id: 'crt', ops: crtSet(116, 136), baseY: 136 })
  list.push({ id: 'crt-table', ops: coffeeTable(110, 138), baseY: 137 })
  list.push({ id: 'arcade', ops: arcadeCabinet(252, 128), baseY: 128 })
  list.push({ id: 'arcade-2', ops: arcadeCabinet(284, 122), baseY: 122 })
  list.push({ id: 'plant', ops: plant(8, 142, 37), baseY: 142 })
  return list
}

export const strangerScene: SceneDef = {
  width: 320,
  height: 160,
  horizon: HORIZON,
  background: backdrop({
    width: 320,
    height: 160,
    horizon: HORIZON,
    floorStyle: 'carpet',
    wallStyle: 'panelled'
  }),
  props: props(),
  ...standardLayout({ stations: STATIONS, stationY: STATION_Y, breakX: 236 }),
  monitors: desks.map((d) => d.monitor),
  steamVents: [],
  leds: [...desks.map((d) => d.led), { x: 258, y: 100 }, { x: 290, y: 94 }],
  clock: { x: 160, y: 34, r: 7 }
}
