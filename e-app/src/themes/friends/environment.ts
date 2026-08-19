import type { Op } from '../../world/pixel/ops'
import type { Prop, SceneDef, ThemePalette } from '../types'
import { backdrop, standardLayout } from '../shared/room'
import { clockFace, deskUnit, plant, windowUnit } from '../shared/props'
import { armchair, couch, kitchenCounter, poster } from '../shared/furniture'

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

const STATIONS = [8, 66, 190]
const STATION_Y = 80
const HORIZON = 60

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 210 + i * 13))

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
    width: 320,
    height: 160,
    horizon: HORIZON,
    floorStyle: 'planks',
    wallStyle: 'plain',
    lightPools: [[14, 44]]
  })
}

function props(): Prop[] {
  const list: Prop[] = []
  list.push({ id: 'window', ops: windowUnit(12, 12, 46, 34), baseY: 0 })
  list.push({ id: 'frame', ops: giltFrame(96, 14, 34, 30), baseY: 0 })
  list.push({ id: 'poster', ops: poster(150, 16, 26, 26, 5), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(214, 26, 7), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(244, 14, 30, 24, 12), baseY: 0 })

  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))

  list.push({ id: 'kitchen', ops: kitchenCounter(236, 100, 70), baseY: 101 })
  list.push({ id: 'couch', ops: couch(100, 152, 56), baseY: 153 })
  list.push({ id: 'armchair', ops: armchair(52, 148), baseY: 149 })
  list.push({ id: 'plant', ops: plant(298, 138, 6), baseY: 138 })
  return list
}

export const friendsScene: SceneDef = {
  width: 320,
  height: 160,
  horizon: HORIZON,
  background: background(),
  props: props(),
  ...standardLayout({ stations: STATIONS, stationY: STATION_Y, breakX: 264 }),
  monitors: desks.map((d) => d.monitor),
  steamVents: [{ x: 272, y: 74, baseY: 101 }],
  leds: [...desks.map((d) => d.led), { x: 248, y: 82 }],
  clock: { x: 214, y: 26, r: 7 }
}
