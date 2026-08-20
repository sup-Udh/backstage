import type { Prop, SceneDef, ThemePalette } from '../types'
import { backdrop, standardLayout } from '../shared/room'
import {
  cabinet,
  clockFace,
  deskUnit,
  meetingTable,
  plant,
  wallSign,
  whiteboard,
  coffeeStation
} from '../shared/props'
import { cubicle, poster, printer, waterCooler, bookcase } from '../shared/furniture'

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

const STATIONS = [30, 85, 140, 195, 250, 305]
const STATION_Y = 100
const HORIZON = 72

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 320 + i * 11))
const coffee = coffeeStation(390, 200)

function props(): Prop[] {
  const list: Prop[] = []
  
  // Wall elements (baseY = 0)
  list.push({ id: 'whiteboard', ops: whiteboard(370, 14, 60, 36), baseY: 0 })
  list.push({ id: 'sign', ops: wallSign(240, 26), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(450, 26, 9), baseY: 0 })
  list.push({ id: 'poster-1', ops: poster(40, 16, 36, 30, 21), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(120, 16, 36, 30, 42), baseY: 0 })
  list.push({ id: 'poster-3', ops: poster(300, 16, 36, 30, 9), baseY: 0 })

  // Dividers and Desks
  STATIONS.forEach((x, i) => {
    list.push({ id: `cubicle-${i}`, ops: cubicle(x, 104, 55), baseY: 104 })
  })
  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))

  // Office Equipment and Storage
  list.push({ id: 'printer', ops: printer(446, 130), baseY: 130 })
  list.push({ id: 'bookcase', ops: bookcase(10, 110, 20, 40), baseY: 110 })
  list.push({ id: 'cabinet-1', ops: cabinet(360, 120), baseY: 120 })
  list.push({ id: 'cabinet-2', ops: cabinet(385, 120), baseY: 120 })
  
  // Meeting Area
  list.push({ id: 'table', ops: meetingTable(140, 210), baseY: 211 })
  
  // Break Area
  list.push({ id: 'coffee-station', ops: coffee.ops, baseY: 200 })
  list.push({ id: 'cooler', ops: waterCooler(360, 206), baseY: 206 })
  
  // Plants
  list.push({ id: 'plant-1', ops: plant(16, 160, 17), baseY: 160 })
  list.push({ id: 'plant-2', ops: plant(464, 220, 33), baseY: 220 })
  list.push({ id: 'plant-3', ops: plant(90, 210, 55), baseY: 210 })
  
  return list
}

export const officeScene: SceneDef = {
  width: 480,
  height: 240,
  horizon: HORIZON,
  background: backdrop({
    width: 480,
    height: 240,
    horizon: HORIZON,
    floorStyle: 'carpet',
    wallStyle: 'plain'
  }),
  props: props(),
  ...standardLayout({ stations: STATIONS, stationY: STATION_Y, breakX: 420 }),
  laneY: 160,
  boardSpots: [
    { x: 390, y: 100, facing: 'up' },
    { x: 415, y: 100, facing: 'up' },
    { x: 440, y: 100, facing: 'up' }
  ],
  talkSpots: [
    [
      { x: 106, y: 215, facing: 'right' },
      { x: 130, y: 215, facing: 'left' }
    ],
    [
      { x: 210, y: 215, facing: 'right' },
      { x: 234, y: 215, facing: 'left' }
    ],
    [
      { x: 60, y: 190, facing: 'right' },
      { x: 84, y: 190, facing: 'left' }
    ],
    [
      { x: 420, y: 150, facing: 'right' },
      { x: 444, y: 150, facing: 'left' }
    ],
    [
      { x: 280, y: 200, facing: 'right' },
      { x: 304, y: 200, facing: 'left' }
    ]
  ],
  coffeeSpots: [
    { x: 400, y: 196, facing: 'up' },
    { x: 430, y: 196, facing: 'up' },
    { x: 360, y: 202, facing: 'up' }
  ],
  wanderSpots: [
    { x: 40, y: 160, facing: 'down' },
    { x: 80, y: 155, facing: 'up' },
    { x: 120, y: 165, facing: 'left' },
    { x: 160, y: 160, facing: 'right' },
    { x: 200, y: 155, facing: 'down' },
    { x: 240, y: 165, facing: 'up' },
    { x: 280, y: 160, facing: 'left' },
    { x: 320, y: 155, facing: 'right' },
    { x: 360, y: 165, facing: 'down' },
    { x: 100, y: 180, facing: 'right' },
    { x: 260, y: 190, facing: 'left' },
    { x: 340, y: 210, facing: 'up' },
    { x: 450, y: 170, facing: 'down' }
  ],
  monitors: desks.map((d) => d.monitor),
  steamVents: [{ x: coffee.steam.x, y: coffee.steam.y, baseY: 200 }],
  leds: [...desks.map((d) => d.led), { x: 450, y: 118 }],
  clock: { x: 450, y: 26, r: 9 }
}
