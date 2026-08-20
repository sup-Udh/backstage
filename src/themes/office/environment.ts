import type { Op } from '../../world/pixel/ops'
import type { Prop, SceneDef, ThemePalette } from '../types'
import {
  ROOM_H,
  ROOM_W,
  centreSlot,
  doorwayX,
  sceneFactory,
  type OfficeGrid,
  type WallSlot,
  type ZoneFurnishing,
  type ZoneRect
} from '../shared/office'
import {
  cabinet,
  chairBack,
  coffeeStation,
  meetingTable,
  plant,
  wallSign,
  whiteboard,
  windowUnit
} from '../shared/props'
import {
  cubicle,
  doorway,
  lockers,
  noticeBoard,
  poster,
  printer,
  stool,
  taskChair,
  waterCooler
} from '../shared/furniture'

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

/**
 * Windows at the ends, the whiteboard in the middle, motivational posters and
 * the branch noticeboard between. Described by role rather than index: the
 * room decides how many panels it has, and the whiteboard is what makes this a
 * branch office rather than a corridor.
 */
function wall(slot: WallSlot): Op[] {
  if (slot.isFirst || slot.isLast) {
    return windowUnit(slot.x, slot.y, slot.w, slot.h)
  }
  if (slot.isCentre) {
    return whiteboard(slot.x + 6, slot.y, slot.w - 12, slot.h - 4)
  }
  return slot.index % 2 === 1
    ? poster(slot.x + 14, slot.y, slot.w - 28, slot.h, 21)
    : noticeBoard(slot.x, slot.y, slot.w, slot.h, 42)
}

function zone(z: ZoneRect): ZoneFurnishing {
  // Left: the conference table nobody wants to be summoned to.
  if (z.index === 0) {
    return {
      props: [
        { id: 'table', ops: meetingTable(z.cx - 29, z.baseY), baseY: z.baseY },
        { id: 'chair-l', ops: taskChair(z.cx - 44, z.baseY - 4, 'down'), baseY: z.baseY - 5 },
        { id: 'chair-r', ops: taskChair(z.cx + 44, z.baseY - 4, 'down'), baseY: z.baseY - 5 },
        { id: 'chair-f1', ops: taskChair(z.cx - 16, z.baseY + 18, 'up'), baseY: z.baseY + 18 },
        { id: 'chair-f2', ops: taskChair(z.cx + 16, z.baseY + 18, 'up'), baseY: z.baseY + 18 }
      ]
    }
  }

  // Middle: reprographics and the filing everybody pretends is somebody else's.
  if (z.index === 1) {
    return {
      props: [
        { id: 'printer', ops: printer(z.cx - 44, z.baseY), baseY: z.baseY },
        { id: 'cabinet-1', ops: cabinet(z.cx - 10, z.baseY), baseY: z.baseY },
        { id: 'cabinet-2', ops: cabinet(z.cx + 16, z.baseY), baseY: z.baseY },
        { id: 'plant-mid', ops: plant(z.cx + 46, z.baseY, 55), baseY: z.baseY }
      ]
    }
  }

  // Right: the break area, which is where the branch actually happens.
  const coffee = coffeeStation(z.cx - 26, z.baseY)
  return {
    props: [
      { id: 'coffee', ops: coffee.ops, baseY: z.baseY },
      { id: 'cooler', ops: waterCooler(z.cx + 34, z.baseY), baseY: z.baseY },
      { id: 'stool-1', ops: stool(z.cx - 40, z.baseY + 24), baseY: z.baseY + 24 },
      { id: 'stool-2', ops: stool(z.cx + 8, z.baseY + 26), baseY: z.baseY + 26 }
    ],
    steam: [{ x: coffee.steam.x, y: coffee.steam.y, baseY: z.baseY }]
  }
}

/** The thing that makes this a branch office: cubicle walls around every desk. */
function accents(grid: OfficeGrid): Prop[] {
  const list: Prop[] = []

  const doorX = doorwayX(grid, 'left')
  list.push({ id: 'door', ops: doorway(doorX, grid.horizon - 4), baseY: 0 })

  list.push({
    id: 'sign',
    ops: wallSign(centreSlot(grid).cx, centreSlot(grid).y + centreSlot(grid).h + 16),
    baseY: 0
  })

  for (const slot of grid.stations) {
    /*
     * A divider behind each station, sorted just behind the desk so it reads
     * as the back wall of that cubicle rather than a panel floating in the
     * room. This is the signature of the world and the reason its desks do
     * not look like the detective bureau's.
     */
    list.push({
      id: `cubicle-${slot.index}`,
      ops: cubicle(slot.x - 2, slot.y - 2, 56),
      baseY: slot.y - 3
    })
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
    ops: noticeBoard(right.x - 4, right.y - 60, 46, 42, 88),
    baseY: right.y
  })
  list.push({ id: 'cabinet-r', ops: cabinet(right.x + 6, right.y), baseY: right.y })

  list.push({ id: 'plant-l', ops: plant(14, grid.laneY + 6, 17), baseY: grid.laneY + 6 })
  list.push({
    id: 'plant-r',
    ops: plant(grid.width - 26, grid.height - 26, 33),
    baseY: grid.height - 26
  })

  return list
}

/**
 * The branch office, at whatever size the viewport gives it.
 *
 * There is no camera, so the room is built to fit rather than panned around:
 * a wider window gets more wall and more desks, not the same room enlarged.
 */
export const buildOfficeScene = sceneFactory({
  floorStyle: 'carpet',
  wallStyle: 'plain',
  wall,
  zone,
  accents,
  clock: { slot: 3, r: 9 }
})

/** The room at its default size, for the theme previews. */
export const officeScene: SceneDef = buildOfficeScene(ROOM_W, ROOM_H)
