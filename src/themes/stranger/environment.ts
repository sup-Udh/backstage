import type { Op } from '../../world/pixel/ops'
import type { Prop, SceneDef, ThemePalette } from '../types'
import {
  ROOM_H,
  ROOM_W,
  doorwayX,
  sceneFactory,
  type OfficeGrid,
  type WallSlot,
  type ZoneFurnishing,
  type ZoneRect
} from '../shared/office'
import {
  chairBack,
  coffeeStation,
  plant,
  rug,
  whiteboard,
  windowUnit
} from '../shared/props'
import {
  arcadeCabinet,
  armchair,
  coffeeTable,
  couch,
  crtSet,
  doorway,
  noticeBoard,
  poster,
  serverRack,
  stringLights,
  stool
} from '../shared/furniture'

/** A basement den in 1985: cold blues, string lights, CRT glow. */
export const strangerPalette: ThemePalette = {
  brand: '#FFC94F',
  brandLite: '#FFE29A',
  brandPale: '#F3E4BC',
  brandDeep: '#D99A32',
  brandShadow: '#9E6C18',

  ink: '#131523',
  ink2: '#20243A',
  ink3: '#383E5C',

  cream: '#DDD9E6',
  cream2: '#C2BDD2',
  white: '#F2F0F8',

  wall: '#2E3450',
  wallLite: '#3B4262',
  wallShade: '#232840',

  floor: '#4A4356',
  floorLit: '#5A5268',
  floorAlt: '#413B4C',
  floorLine: '#332E3D',
  floorShadow: '#262230',

  wood: '#6E5540',
  woodDark: '#4E3B2C',
  woodLite: '#8C6E52',

  screen: '#101828',
  screenLite: '#1C2A44',

  sage: '#4E8C6A',
  sageDark: '#356148',
  sageLite: '#6DB08A',

  rust: '#C0392B',
  cork: '#8E7350',
  corkDark: '#6A563B',

  accent: '#C0392B',
  accentLite: '#E05B4A',
  accentDark: '#8C2418',

  paper: '#EDE7D6',
  paperShade: '#CDC5B0',

  steel: '#8B93A8',
  steelDark: '#5C6479'
}

/**
 * High basement windows at the ends, the map wall in the middle, and a lot of
 * pinned paper between. Described by role rather than index, because the room
 * decides how many panels it has and the map wall is the point of the room.
 */
function wall(slot: WallSlot): Op[] {
  if (slot.isFirst || slot.isLast) {
    return windowUnit(slot.x, slot.y, slot.w, slot.h)
  }
  if (slot.isCentre) {
    return whiteboard(slot.x + 6, slot.y, slot.w - 12, slot.h - 4)
  }
  return slot.index % 2 === 1
    ? noticeBoard(slot.x, slot.y, slot.w, slot.h, 77)
    : poster(slot.x + 14, slot.y, slot.w - 28, slot.h, 105)
}

function zone(z: ZoneRect): ZoneFurnishing {
  // Left: the arcade wall. The reason anybody comes down here.
  if (z.index === 0) {
    return {
      props: [
        { id: 'arcade-1', ops: arcadeCabinet(z.cx - 62, z.baseY), baseY: z.baseY },
        { id: 'arcade-2', ops: arcadeCabinet(z.cx - 30, z.baseY - 4), baseY: z.baseY - 4 },
        { id: 'arcade-3', ops: arcadeCabinet(z.cx + 2, z.baseY), baseY: z.baseY },
        { id: 'stool', ops: stool(z.cx + 44, z.baseY + 20), baseY: z.baseY + 20 }
      ],
      leds: [
        { x: z.cx - 54, y: z.baseY - 30 },
        { x: z.cx - 22, y: z.baseY - 34 },
        { x: z.cx + 10, y: z.baseY - 30 }
      ]
    }
  }

  // Middle: the blanket fort, which is where the actual plotting happens.
  if (z.index === 1) {
    return {
      props: [
        { id: 'rug', ops: rug(z.cx - 74, z.baseY - 48, 148, 62), baseY: 0 },
        { id: 'couch', ops: couch(z.cx - 44, z.baseY, 62), baseY: z.baseY },
        { id: 'coffee-table', ops: coffeeTable(z.cx - 14, z.baseY + 20), baseY: z.baseY + 20 },
        { id: 'armchair', ops: armchair(z.cx + 40, z.baseY + 4), baseY: z.baseY + 4 }
      ]
    }
  }

  // Right: the radio bench and enough hardware to reach the Upside Down.
  const coffee = coffeeStation(z.cx - 26, z.baseY)
  const rack = serverRack(z.cx + 34, z.baseY, 44)
  return {
    props: [
      { id: 'coffee', ops: coffee.ops, baseY: z.baseY },
      { id: 'rack', ops: rack.ops, baseY: z.baseY },
      { id: 'crt', ops: crtSet(z.cx - 20, z.baseY - 20), baseY: z.baseY - 0.5 }
    ],
    steam: [{ x: coffee.steam.x, y: coffee.steam.y, baseY: z.baseY }],
    leds: rack.leds
  }
}

/**
 * Fairy lights strung the whole way across the wall — the one thing that has
 * to be there for the room to read as this world at all.
 */
function accents(grid: OfficeGrid): Prop[] {
  const list: Prop[] = []

  list.push({ id: 'lights-l', ops: stringLights(0, 6, grid.width >> 1, 77), baseY: 0 })
  list.push({
    id: 'lights-r',
    ops: stringLights(grid.width >> 1, 6, grid.width >> 1, 88),
    baseY: 0
  })

  const doorX = doorwayX(grid, 'right')
  list.push({ id: 'door', ops: doorway(doorX, grid.horizon - 4), baseY: 0 })

  for (const slot of grid.stations) {
    const seat = { x: slot.x + 30, y: slot.y + 5 }
    list.push({
      id: `chair-${slot.index}`,
      ops: chairBack(seat.x, seat.y),
      baseY: seat.y - 6
    })
  }

  const [left, right] = grid.flanks
  list.push({
    id: 'notice-l',
    ops: noticeBoard(left.x, left.y - 58, 44, 42, 51),
    baseY: left.y
  })
  list.push({ id: 'stool-l', ops: stool(left.x + 20, left.y), baseY: left.y })
  list.push({ id: 'arcade-r', ops: arcadeCabinet(right.x + 8, right.y), baseY: right.y })

  list.push({ id: 'plant-l', ops: plant(14, grid.laneY + 6, 37), baseY: grid.laneY + 6 })
  list.push({
    id: 'plant-r',
    ops: plant(grid.width - 26, grid.height - 24, 42),
    baseY: grid.height - 24
  })

  return list
}

/**
 * The basement, at whatever size the viewport gives it.
 *
 * There is no camera, so the room is built to fit rather than panned around:
 * a wider window gets more wall and more desks, not the same room enlarged.
 */
export const buildStrangerScene = sceneFactory({
  floorStyle: 'concrete',
  wallStyle: 'stripe',
  wall,
  zone,
  accents,
  clock: { slot: 3, r: 8 }
})

/** The room at its default size, for the theme previews. */
export const strangerScene: SceneDef = buildStrangerScene(ROOM_W, ROOM_H)
