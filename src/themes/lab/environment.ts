import type { Op } from '../../world/pixel/ops'
import type { Prop, SceneDef, ThemePalette } from '../types'
import {
  composeOffice,
  type OfficeGrid,
  type StationSlot,
  type WallSlot,
  type ZoneFurnishing,
  type ZoneRect
} from '../shared/office'
import {
  cabinet,
  chairBack,
  coffeeStation,
  DESK_BASE,
  DESK_W,
  plant,
  wallSign,
  whiteboard,
  windowUnit,
  type DeskParts
} from '../shared/props'
import {
  barrel,
  doorway,
  glassware,
  labBench,
  lockers,
  noticeBoard,
  poster,
  serverRack,
  stool,
  waterCooler
} from '../shared/furniture'

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

/**
 * A lab bench, standing in for the office desk.
 *
 * Deliberately built to the same footprint and seat offset as `deskUnit`: the
 * grid places it, the director seats a character at it, and the renderer
 * animates its screen — all of which only work because the contract is
 * identical whatever the surface is made of. Only the material changes.
 */
function labStation(slot: StationSlot): DeskParts {
  const { x, y } = slot
  const ops: Op[] = []

  // The bench itself.
  ops.push(...labBench(x, y, DESK_W))

  // A monitor at the left end, where a desk would have one.
  ops.push([x + 10, y - 3, 3, 3, 'ink'])
  ops.push([x + 7, y - 1, 9, 2, 'ink'])
  ops.push([x + 2, y - 18, 19, 16, 'ink'])
  ops.push([x + 3, y - 17, 17, 13, 'screen'])
  ops.push([x + 3, y - 17, 17, 1, 'screenLite'])

  // Glassware in place of desk clutter, varied per station.
  ops.push(...glassware(x + 24, y - 1, slot.seed))

  return {
    ops,
    baseY: y + DESK_BASE,
    monitors: [{ x: x + 3, y: y - 17 }],
    led: { x: x + 17, y: y - 4 }
  }
}

/** Safety notices, a fume-hood window and the containment board. */
function wall(slot: WallSlot): Op[] {
  switch (slot.index) {
    case 0:
    case 4:
      return windowUnit(slot.x, slot.y, slot.w, slot.h)
    case 2:
      return whiteboard(slot.x + 6, slot.y, slot.w - 12, slot.h - 4)
    case 1:
      return noticeBoard(slot.x, slot.y, slot.w, slot.h, 112)
    default:
      return poster(slot.x + 14, slot.y, slot.w - 28, slot.h, 134)
  }
}

function zone(z: ZoneRect): ZoneFurnishing {
  // Left: wet chemistry, with the steam that goes with it.
  if (z.index === 0) {
    return {
      props: [
        { id: 'bench', ops: labBench(z.cx - 56, z.baseY, 112), baseY: z.baseY },
        { id: 'glass-1', ops: glassware(z.cx - 46, z.baseY - 19, 137), baseY: z.baseY + 0.5 },
        { id: 'glass-2', ops: glassware(z.cx - 4, z.baseY - 19, 149), baseY: z.baseY + 0.5 },
        { id: 'stool-1', ops: stool(z.cx - 30, z.baseY + 22), baseY: z.baseY + 22 },
        { id: 'stool-2', ops: stool(z.cx + 18, z.baseY + 22), baseY: z.baseY + 22 }
      ],
      steam: [
        { x: z.cx - 40, y: z.baseY - 24, baseY: z.baseY },
        { x: z.cx + 2, y: z.baseY - 24, baseY: z.baseY }
      ]
    }
  }

  // Middle: hazardous storage, kept clear of the walkways on both sides.
  if (z.index === 1) {
    return {
      props: [
        { id: 'barrel-1', ops: barrel(z.cx - 48, z.baseY), baseY: z.baseY },
        { id: 'barrel-2', ops: barrel(z.cx - 30, z.baseY - 6), baseY: z.baseY - 6 },
        { id: 'barrel-3', ops: barrel(z.cx - 39, z.baseY + 12), baseY: z.baseY + 12 },
        { id: 'cabinet', ops: cabinet(z.cx + 6, z.baseY), baseY: z.baseY },
        { id: 'plant-mid', ops: plant(z.cx + 44, z.baseY, 199), baseY: z.baseY }
      ]
    }
  }

  // Right: the machine room, plus the only coffee in the building.
  const coffee = coffeeStation(z.cx - 30, z.baseY)
  const rack = serverRack(z.cx + 30, z.baseY, 46)
  return {
    props: [
      { id: 'coffee', ops: coffee.ops, baseY: z.baseY },
      { id: 'rack', ops: rack.ops, baseY: z.baseY },
      { id: 'cooler', ops: waterCooler(z.cx + 64, z.baseY), baseY: z.baseY }
    ],
    steam: [{ x: coffee.steam.x, y: coffee.steam.y, baseY: z.baseY }],
    leds: rack.leds
  }
}

function accents(grid: OfficeGrid): Prop[] {
  const list: Prop[] = []

  const doorX = Math.round((grid.wall[0].x + grid.wall[0].w + grid.wall[1].x) / 2) - 17
  list.push({ id: 'door', ops: doorway(doorX, grid.horizon - 4), baseY: 0 })

  list.push({
    id: 'sign',
    ops: wallSign(grid.wall[2].cx, grid.wall[2].y + grid.wall[2].h + 16),
    baseY: 0
  })

  for (const slot of grid.stations) {
    const seat = { x: slot.x + 30, y: slot.y + 5 }
    list.push({
      id: `chair-${slot.index}`,
      ops: chairBack(seat.x, seat.y),
      baseY: seat.y - 6
    })
  }

  const [left, right] = grid.flanks
  list.push({ id: 'lockers', ops: lockers(left.x, left.y, 3), baseY: left.y })
  list.push({
    id: 'notice-r',
    ops: noticeBoard(right.x - 4, right.y - 58, 46, 42, 166),
    baseY: right.y
  })
  list.push({ id: 'barrel-r', ops: barrel(right.x + 10, right.y), baseY: right.y })

  list.push({ id: 'barrel-l', ops: barrel(16, grid.laneY + 20), baseY: grid.laneY + 20 })
  list.push({
    id: 'plant-r',
    ops: plant(grid.width - 26, grid.height - 24, 33),
    baseY: grid.height - 24
  })

  return list
}

export const labScene: SceneDef = composeOffice({
  floorStyle: 'concrete',
  wallStyle: 'brick',
  wall,
  zone,
  accents,
  station: labStation,
  clock: { slot: 3, r: 8 }
})
