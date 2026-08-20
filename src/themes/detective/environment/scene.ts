import type { Op } from '../../../world/pixel/ops'
import type { Prop, SceneDef, Spot } from '../../types'
import {
  DESK_BASE,
  SEAT_DX,
  SEAT_DY,
  boxStack,
  cabinet,
  chairBack,
  clockFace,
  coffeeStation,
  deskUnit,
  evidenceBoard,
  meetingTable,
  plant,
  rug,
  shelfUnit,
  wallSign,
  whiteboard,
  windowUnit
} from './props'

/**
 * The office layout.
 *
 * Logical size is 480x240 and it is only ever drawn at an integer scale, so
 * a pixel is always a whole number of screen pixels and nothing resamples.
 */
export const SCENE_W = 480
export const SCENE_H = 240
export const HORIZON = 72

/** Desk surface height, and the x of each desk's left edge. */
const DESK_Y = 100
const DESK_X = [8, 82, 156, 236, 310, 384]

/* --------------------------------------------------------------- ground -- */

function background(): Op[] {
  const ops: Op[] = []

  // Wall, lit from above so the room has a light direction.
  ops.push([0, 0, SCENE_W, HORIZON, 'wall'])
  ops.push([0, 0, SCENE_W, 18, 'wallLite'])
  ops.push([0, HORIZON - 14, SCENE_W, 14, 'wallShade'])

  // Skirting where the wall meets the floor.
  ops.push([0, HORIZON - 5, SCENE_W, 5, 'ink'])
  ops.push([0, HORIZON - 4, SCENE_W, 3, 'cream2'])
  ops.push([0, HORIZON - 1, SCENE_W, 1, 'ink'])

  // Floor.
  ops.push([0, HORIZON, SCENE_W, SCENE_H - HORIZON, 'floor'])
  for (let y = HORIZON + 7; y < SCENE_H; y += 9) {
    ops.push([0, y, SCENE_W, 1, 'floorLine'])
  }
  // Staggered board seams.
  for (let y = HORIZON, row = 0; y < SCENE_H; y += 9, row++) {
    for (let x = (row % 2) * 26; x < SCENE_W; x += 52) {
      ops.push([x, y, 1, 8, 'floorAlt'])
    }
  }

  // Light falling from the two windows
  for (const [px, pw] of [
    [16, 50],
    [416, 50]
  ]) {
    for (let s = 0; s < 8; s++) {
      ops.push([px - s, HORIZON + 1 + s * 3, pw + s * 2, 3, 'floorLit'])
    }
  }

  // Rug under the meeting area.
  ops.push(...rug(180, 180, 120, 40))
  return ops
}

/* ---------------------------------------------------------------- props -- */

const desks = DESK_X.map((x, i) => deskUnit(x, DESK_Y, 100 + i * 17))

/** Depths that both the layout and the renderer's overlays depend on. */
const DESK_BASE_Y = DESK_Y + DESK_BASE
const COFFEE_BASE_Y = 120
const TABLE_BASE_Y = 210

/**
 * Where a character sits at desk `i`. The seat is offset to the right of the
 * monitor and low enough that the desk, which sorts in front, hides their
 * legs from the waist down - which is what makes them read as seated.
 */
const deskSpots: Spot[] = DESK_X.map((x) => ({
  x: x + SEAT_DX,
  y: DESK_Y + SEAT_DY,
  facing: 'down' as const
}))

function props(): Prop[] {
  const list: Prop[] = []

  // Wall furniture never overlaps the cast, so it sorts above the horizon.
  list.push({ id: 'window-l', ops: windowUnit(16, 12, 50, 40), baseY: 0 })
  list.push({ id: 'shelf-1', ops: shelfUnit(82, 16, 38), baseY: 0 })
  list.push({ id: 'board', ops: evidenceBoard(136, 10, 100, 48), baseY: 0 })
  list.push({ id: 'whiteboard', ops: whiteboard(256, 16, 44, 34), baseY: 0 })
  list.push({ id: 'shelf-2', ops: shelfUnit(316, 16, 38), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(376, 22, 9), baseY: 0 })
  list.push({ id: 'sign', ops: wallSign(370, 40), baseY: 0 })
  list.push({ id: 'window-r', ops: windowUnit(416, 12, 50, 40), baseY: 0 })

  // Chair backs sort just behind their occupant so they frame the sprite.
  deskSpots.forEach((s, i) => {
    list.push({ id: `chair-${i}`, ops: chairBack(s.x, s.y), baseY: s.y - 6 })
  })

  desks.forEach((d, i) => {
    list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY })
  })

  const coffee = coffeeStation(410, 118)
  list.push({ id: 'coffee', ops: coffee.ops, baseY: COFFEE_BASE_Y })

  list.push({ id: 'boxes-1', ops: boxStack(20, 190), baseY: 190 })
  list.push({ id: 'plant-1', ops: plant(70, 186, 3), baseY: 186 })
  
  list.push({ id: 'table', ops: meetingTable(210, 208), baseY: TABLE_BASE_Y })
  
  list.push({ id: 'cabinet-1', ops: cabinet(330, 186), baseY: 186 })
  list.push({ id: 'cabinet-2', ops: cabinet(366, 186), baseY: 186 })
  list.push({ id: 'plant-2', ops: plant(430, 200, 9), baseY: 200 })

  return list
}

/* ---------------------------------------------------------------- scene -- */

export const detectiveScene: SceneDef = {
  width: SCENE_W,
  height: SCENE_H,
  horizon: HORIZON,

  background: background(),
  props: props(),

  desks: deskSpots,

  // Standing under the evidence board, backs to the viewer.
  boardSpots: [
    { x: 156, y: 106, facing: 'up' },
    { x: 186, y: 106, facing: 'up' },
    { x: 216, y: 106, facing: 'up' }
  ],

  talkSpots: [
    [
      { x: 90, y: 140, facing: 'right' },
      { x: 114, y: 140, facing: 'left' }
    ],
    [
      { x: 280, y: 142, facing: 'right' },
      { x: 304, y: 142, facing: 'left' }
    ],
    [
      { x: 50, y: 210, facing: 'right' },
      { x: 74, y: 210, facing: 'left' }
    ],
    [
      { x: 150, y: 200, facing: 'right' },
      { x: 174, y: 200, facing: 'left' }
    ],
    [
      { x: 370, y: 206, facing: 'right' },
      { x: 394, y: 206, facing: 'left' }
    ]
  ],

  coffeeSpots: [
    { x: 420, y: 134, facing: 'up' },
    { x: 440, y: 134, facing: 'up' },
    { x: 460, y: 134, facing: 'up' }
  ],

  wanderSpots: [
    { x: 40, y: 136, facing: 'right' },
    { x: 140, y: 136, facing: 'down' },
    { x: 200, y: 136, facing: 'right' },
    { x: 240, y: 136, facing: 'left' },
    { x: 340, y: 136, facing: 'down' },
    { x: 80, y: 156, facing: 'down' },
    { x: 170, y: 156, facing: 'up' },
    { x: 260, y: 156, facing: 'down' },
    { x: 310, y: 156, facing: 'right' },
    { x: 390, y: 156, facing: 'left' },
    { x: 110, y: 196, facing: 'down' },
    { x: 280, y: 196, facing: 'left' },
    { x: 310, y: 216, facing: 'right' },
    { x: 410, y: 216, facing: 'up' }
  ],

  // The clear corridor between the desk row and the meeting area.
  laneY: 165,

  monitors: desks.map((d) => d.monitor),
  deskBaseY: DESK_BASE_Y,
  steamVents: [
    { x: 440, y: 92, baseY: COFFEE_BASE_Y },
    { x: 256, y: 187, baseY: TABLE_BASE_Y }
  ],
  leds: [...desks.map((d) => d.led), { x: 417, y: 89 }],
  clock: { x: 376, y: 22, r: 9 }
}
