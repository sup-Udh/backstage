import type { Prop, SceneDef, ThemePalette } from '../types'
import { backdrop, standardLayout } from '../shared/room'
import { clockFace, deskUnit, plant, windowUnit } from '../shared/props'
import { armchair, bookcase, fireplace, poster, wallLamp } from '../shared/furniture'

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

const STATIONS = [8, 66, 190]
const STATION_Y = 80
const HORIZON = 60

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 410 + i * 19))

function props(): Prop[] {
  const list: Prop[] = []
  list.push({ id: 'window', ops: windowUnit(14, 12, 40, 32), baseY: 0 })
  list.push({ id: 'lamp-l', ops: wallLamp(72, 16), baseY: 0 })
  list.push({ id: 'poster', ops: poster(96, 12, 30, 30, 33), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(134, 14, 26, 26, 44), baseY: 0 })
  list.push({ id: 'lamp-r', ops: wallLamp(176, 16), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(206, 24, 8), baseY: 0 })
  list.push({ id: 'poster-3', ops: poster(236, 12, 32, 28, 55), baseY: 0 })

  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))

  // The fire is the room's other light source, and its centrepiece.
  list.push({ id: 'fireplace', ops: fireplace(126, 104, 46), baseY: 104 })
  list.push({ id: 'bookcase', ops: bookcase(276, 112, 40, 46), baseY: 112 })
  list.push({ id: 'armchair-l', ops: armchair(104, 150), baseY: 151 })
  list.push({ id: 'armchair-r', ops: armchair(180, 150), baseY: 151 })
  list.push({ id: 'plant', ops: plant(8, 140, 27), baseY: 140 })
  return list
}

export const sherlockScene: SceneDef = {
  width: 320,
  height: 160,
  horizon: HORIZON,
  background: backdrop({
    width: 320,
    height: 160,
    horizon: HORIZON,
    floorStyle: 'planks',
    wallStyle: 'panelled',
    lightPools: [[16, 40]]
  }),
  props: props(),
  ...standardLayout({ stations: STATIONS, stationY: STATION_Y, breakX: 262 }),
  monitors: desks.map((d) => d.monitor),
  steamVents: [{ x: 148, y: 96, baseY: 104 }],
  leds: desks.map((d) => d.led),
  clock: { x: 206, y: 24, r: 8 }
}
