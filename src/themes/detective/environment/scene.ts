import type { Op } from '../../../world/pixel/ops'
import type { Prop, SceneDef } from '../../types'
import {
  composeOffice,
  type OfficeGrid,
  type WallSlot,
  type ZoneFurnishing,
  type ZoneRect
} from '../../shared/office'
import {
  boxStack,
  cabinet,
  chairBack,
  coffeeStation,
  meetingTable,
  plant,
  rug,
  shelfUnit,
  wallSign,
  windowUnit
} from '../../shared/props'
import {
  doorway,
  lockers,
  noticeBoard,
  sideTable,
  stool,
  taskChair
} from '../../shared/furniture'
import { evidenceBoard } from './props'

/**
 * The detective bureau.
 *
 * The original Backstage world, rebuilt on the shared office grid. Nothing
 * here chooses a coordinate: the grid hands out five wall panels, seven
 * workstations and three floor zones, and this file only decides that panel
 * two is an evidence board rather than a whiteboard, and that the left zone
 * is a case-review table rather than a kitchen.
 */

/** Wall panels, left to right: window, shelving, the board, notices, window. */
function wall(slot: WallSlot): Op[] {
  switch (slot.index) {
    case 0:
    case 4:
      return windowUnit(slot.x, slot.y, slot.w, slot.h)
    case 1:
      return shelfUnit(slot.x + 12, slot.y, slot.w - 24)
    case 2:
      return evidenceBoard(slot.x, slot.y - 2, slot.w, slot.h + 6)
    default:
      return noticeBoard(slot.x, slot.y, slot.w, slot.h, 17)
  }
}

function zone(z: ZoneRect): ZoneFurnishing {
  // Left: the case-review table, where the team stands over the evidence.
  if (z.index === 0) {
    return {
      props: [
        { id: 'rug', ops: rug(z.cx - 74, z.baseY - 46, 148, 60), baseY: 0 },
        { id: 'meeting-table', ops: meetingTable(z.cx - 29, z.baseY), baseY: z.baseY },
        { id: 'chair-l', ops: taskChair(z.cx - 44, z.baseY - 4, 'down'), baseY: z.baseY - 5 },
        { id: 'chair-r', ops: taskChair(z.cx + 44, z.baseY - 4, 'down'), baseY: z.baseY - 5 },
        { id: 'chair-f', ops: taskChair(z.cx, z.baseY + 18, 'up'), baseY: z.baseY + 18 }
      ]
    }
  }

  // Middle: the archive. Records, and a whiteboard on a stand beside them.
  if (z.index === 1) {
    return {
      props: [
        { id: 'cabinet-1', ops: cabinet(z.cx - 46, z.baseY), baseY: z.baseY },
        { id: 'cabinet-2', ops: cabinet(z.cx - 20, z.baseY), baseY: z.baseY },
        { id: 'boxes', ops: boxStack(z.cx + 14, z.baseY), baseY: z.baseY },
        { id: 'plant-mid', ops: plant(z.cx + 46, z.baseY, 3), baseY: z.baseY }
      ]
    }
  }

  // Right: coffee, and somewhere to stand while it brews.
  const coffee = coffeeStation(z.cx - 26, z.baseY)
  return {
    props: [
      { id: 'coffee', ops: coffee.ops, baseY: z.baseY },
      { id: 'stool-1', ops: stool(z.cx - 40, z.baseY + 24), baseY: z.baseY + 24 },
      { id: 'stool-2', ops: stool(z.cx + 12, z.baseY + 26), baseY: z.baseY + 26 }
    ],
    steam: [{ x: coffee.steam.x, y: coffee.steam.y, baseY: z.baseY }]
  }
}

/**
 * The pieces that make this room the bureau rather than a generic office:
 * the door people arrive through, the signage, a lamp over each desk row, and
 * a chair behind every seat so no workstation floats.
 */
function accents(grid: OfficeGrid): Prop[] {
  const list: Prop[] = []

  // The way in, between the first two wall panels.
  const doorX = Math.round((grid.wall[0].x + grid.wall[0].w + grid.wall[1].x) / 2) - 17
  list.push({ id: 'door', ops: doorway(doorX, grid.horizon - 4), baseY: 0 })

  /*
   * The signage goes under the evidence board, and the clock hangs on a
   * different panel. Both used to be centred on the same one, which put a
   * clock face behind the sign in every render.
   */
  list.push({
    id: 'sign',
    ops: wallSign(grid.wall[2].cx, grid.wall[2].y + grid.wall[2].h + 16),
    baseY: 0
  })

  /*
   * Every seat gets its chair, drawn just behind its occupant so it frames
   * them and still stands up on its own at an empty desk.
   */
  for (const slot of grid.stations) {
    const seat = { x: slot.x + 30, y: slot.y + 5 }
    list.push({
      id: `chair-${slot.index}`,
      ops: chairBack(seat.x, seat.y),
      baseY: seat.y - 6
    })
  }

  // The side walls the grid keeps clear of the desks.
  const [left, right] = grid.flanks
  list.push({ id: 'lockers', ops: lockers(left.x, left.y, 3), baseY: left.y })
  list.push({
    id: 'case-board',
    ops: noticeBoard(right.x - 4, right.y - 62, 46, 44, 55),
    baseY: right.y
  })
  list.push({ id: 'side-table', ops: sideTable(right.x + 4, right.y + 4), baseY: right.y + 4 })

  list.push({ id: 'plant-l', ops: plant(14, grid.laneY + 4, 17), baseY: grid.laneY + 4 })
  list.push({
    id: 'plant-r',
    ops: plant(grid.width - 26, grid.height - 26, 33),
    baseY: grid.height - 26
  })
  list.push({ id: 'boxes-corner', ops: boxStack(grid.width - 34, grid.laneY + 8), baseY: grid.laneY + 8 })

  return list
}

export const detectiveScene: SceneDef = composeOffice({
  floorStyle: 'planks',
  wallStyle: 'plain',
  wall,
  zone,
  accents,
  clock: { slot: 3, r: 9 }
})

/** Kept for the theme preview, which draws the room at its own size. */
export const SCENE_W = detectiveScene.width
export const SCENE_H = detectiveScene.height
export const HORIZON = detectiveScene.horizon
