import type { Prop, SceneDef, ThemePalette } from '../types'
import { backdrop, standardLayout } from '../shared/room'
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

const STATIONS = [8, 66, 190]
const STATION_Y = 80
const HORIZON = 60

const desks = STATIONS.map((x, i) => deskUnit(x, STATION_Y, 610 + i * 29))

function props(): Prop[] {
  const list: Prop[] = []
  list.push({ id: 'poster', ops: poster(18, 12, 36, 30, 101), baseY: 0 })
  list.push({ id: 'sign', ops: wallSign(112, 22), baseY: 0 })
  list.push({ id: 'poster-2', ops: poster(160, 12, 32, 30, 112), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(216, 24, 7), baseY: 0 })
  list.push({ id: 'poster-3', ops: poster(244, 14, 40, 26, 123), baseY: 0 })

  desks.forEach((d, i) => list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY }))

  // The bench and its glassware are the room's identity.
  list.push({ id: 'bench', ops: labBench(108, 130, 76), baseY: 130 })
  list.push({ id: 'glass', ops: glassware(116, 112, 137), baseY: 130.5 })
  list.push({ id: 'glass-2', ops: glassware(152, 112, 149), baseY: 130.5 })
  list.push({ id: 'barrel', ops: barrel(268, 148), baseY: 148 })
  list.push({ id: 'barrel-2', ops: barrel(288, 140), baseY: 140 })
  list.push({ id: 'cooler', ops: waterCooler(240, 112), baseY: 112 })
  list.push({ id: 'cabinet', ops: cabinet(12, 152), baseY: 152 })
  return list
}

export const labScene: SceneDef = {
  width: 320,
  height: 160,
  horizon: HORIZON,
  background: backdrop({
    width: 320,
    height: 160,
    horizon: HORIZON,
    floorStyle: 'concrete',
    wallStyle: 'brick'
  }),
  props: props(),
  ...standardLayout({ stations: STATIONS, stationY: STATION_Y, breakX: 232 }),
  monitors: desks.map((d) => d.monitor),
  // Vapour rising off the bench, rather than coffee.
  steamVents: [
    { x: 120, y: 118, baseY: 130.6 },
    { x: 156, y: 118, baseY: 130.6 }
  ],
  leds: [...desks.map((d) => d.led), { x: 244, y: 92 }],
  clock: { x: 216, y: 24, r: 7 }
}
