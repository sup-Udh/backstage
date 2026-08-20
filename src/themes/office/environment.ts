import type { Prop, SceneDef, ThemePalette } from '../types'
import { backdrop, standardLayout } from '../shared/room'
import {
  cabinet,
  clockFace,
  deskUnit,
  meetingTable,
  plant,
  wallSign,
  whiteboard
} from '../shared/props'
import { cubicle, poster, printer, waterCooler } from '../shared/furniture'

/** Fluorescent beige, blue-grey cubicle fabric, hard-wearing carpet. */
export const officePalette: ThemePalette = {
  brand: '#FFC94F',
  brandLite: '#FFE29A',
  brandPale: '#FFF3D0',
  brandDeep: '#E8A128',
  brandShadow: '#C97F1C',

  ink: '#20242B',
  ink2: '#333942',
  ink3: '#525A66',

  cream: '#F4F1E6',
  cream2: '#E3DECE',
  white: '#FFFFFF',

  wall: '#DCD5C6',
  wallLite: '#ECE6DA',
  wallShade: '#C3BBA9',

  floor: '#96A0A7',
  floorLit: '#A6B0B6',
  floorAlt: '#8B959C',
  floorLine: '#7C858B',
  floorShadow: '#6C7479',

  wood: '#C3A278',
  woodDark: '#96784F',
  woodLite: '#D8BC96',

  screen: '#232A33',
  screenLite: '#333D4A',

  sage: '#7E9C6B',
  sageDark: '#5C7A4C',
  sageLite: '#9EBB87',

  rust: '#A85B3E',
  cork: '#C9A06B',
  corkDark: '#A9834F',

  accent: '#4E627A',
  accentLite: '#657B94',
  accentDark: '#39485B',

  paper: '#FFFFFF',
  paperShade: '#E4E0D4',

  steel: '#B6BAC0',
  steelDark: '#858B93'
}

const STATIONS = [8, 66, 190]
const STATION_Y = 80
const HORIZON = 60

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 320 + i * 11))

function props(): Prop[] {
  const list: Prop[] = []
  list.push({ id: 'whiteboard', ops: whiteboard(96, 14, 46, 30), baseY: 0 })
  list.push({ id: 'sign', ops: wallSign(176, 22), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(232, 22, 7), baseY: 0 })
  list.push({ id: 'poster', ops: poster(258, 12, 34, 28, 21), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(20, 14, 30, 26, 9), baseY: 0 })

  // Dividers stand on the floor behind each occupant, so they sort in front
  // of the wall but behind the person sitting at the desk.
  STATIONS.forEach((x, i) => {
    list.push({ id: `cubicle-${i}`, ops: cubicle(x, 84, 52), baseY: 84 })
  })
  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))

  list.push({ id: 'printer', ops: printer(258, 104), baseY: 104 })
  list.push({ id: 'cooler', ops: waterCooler(292, 112), baseY: 112 })
  list.push({ id: 'table', ops: meetingTable(116, 152), baseY: 153 })
  list.push({ id: 'cabinet', ops: cabinet(250, 156), baseY: 156 })
  list.push({ id: 'plant', ops: plant(8, 138, 17), baseY: 138 })
  return list
}

export const officeScene: SceneDef = {
  width: 320,
  height: 160,
  horizon: HORIZON,
  background: backdrop({
    width: 320,
    height: 160,
    horizon: HORIZON,
    floorStyle: 'carpet',
    wallStyle: 'plain'
  }),
  props: props(),
  ...standardLayout({ stations: STATIONS, stationY: STATION_Y, breakX: 266 }),
  monitors: desks.map((d) => d.monitor),
  steamVents: [{ x: 162, y: 131, baseY: 153 }],
  leds: [...desks.map((d) => d.led), { x: 262, y: 92 }],
  clock: { x: 232, y: 22, r: 7 }
}
