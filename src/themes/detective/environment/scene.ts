import type { Op } from '../../../world/pixel/ops'
import type { Prop, SceneDef } from '../../types'
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

/**
 * Wall panels: windows at the ends, the evidence board in the middle, shelving
 * and notices in between.
 *
 * Described by role rather than by index, because the room decides how many
 * panels there are â€” five at the default width, three in a narrow window,
 * more on a wide one. The evidence board is what makes this room the bureau,
 * so it is pinned to the centre and exists at every size.
 */
function wall(slot: WallSlot): Op[] {
  if (slot.isFirst || slot.isLast) {
    return windowUnit(slot.x, slot.y, slot.w, slot.h)
  }
  if (slot.isCentre) {
    return evidenceBoard(slot.x, slot.y - 2, slot.w, slot.h + 6)
  }
  return slot.index % 2 === 1
    ? shelfUnit(slot.x + 12, slot.y, slot.w - 24)
    : noticeBoard(slot.x, slot.y, slot.w, slot.h, 17)
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
  const doorX = doorwayX(grid, 'left')
  list.push({ id: 'door', ops: doorway(doorX, grid.horizon - 4), baseY: 0 })

  /*
   * The signage goes under the evidence board, and the clock hangs on a
   * different panel. Both used to be centred on the same one, which put a
   * clock face behind the sign in every render.
   */
  list.push({
    id: 'sign',
    ops: wallSign(centreSlot(grid).cx, centreSlot(grid).y + centreSlot(grid).h + 16),
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

/**
 * The bureau, at whatever size the viewport gives it.
 *
 * There is no camera, so the room is built to fit rather than panned around:
 * a wider window gets more wall and more desks, not the same room enlarged.
 */
export const buildDetectiveScene = sceneFactory({
  floorStyle: 'planks',
  wallStyle: 'plain',
  wall,
  zone,
  accents,
  clock: { slot: 3, r: 9 }
})

/** The room at its default size, for the theme previews. */
export const detectiveScene: SceneDef = buildDetectiveScene(ROOM_W, ROOM_H)

/** Kept for the theme preview, which draws the room at its own size. */
export const SCENE_W = detectiveScene.width
export const SCENE_H = detectiveScene.height
export const HORIZON = detectiveScene.horizon
