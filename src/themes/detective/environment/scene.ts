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
 * Logical size is 320x160 and it is only ever drawn at an integer scale, so
 * a pixel is always a whole number of screen pixels and nothing resamples.
 * At 3x this is 960x480, which is the size the composition is tuned for.
 */
export const SCENE_W = 320
export const SCENE_H = 160
export const HORIZON = 56

/** Desk surface height, and the x of each desk's left edge. */
const DESK_Y = 80
const DESK_X = [8, 66, 190]

/* --------------------------------------------------------------- ground -- */

function background(): Op[] {
  const ops: Op[] = []

  // Wall, lit from above so the room has a light direction.
  ops.push([0, 0, SCENE_W, HORIZON, 'wall'])
  ops.push([0, 0, SCENE_W, 18, 'wallLite'])
  ops.push([0, 42, SCENE_W, 14, 'wallShade'])

  // Skirting where the wall meets the floor.
  ops.push([0, 51, SCENE_W, 5, 'ink'])
  ops.push([0, 52, SCENE_W, 3, 'cream2'])
  ops.push([0, 55, SCENE_W, 1, 'ink'])

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

  // Light falling from the two windows: many shallow steps in a tint only
  // just above the floor, so it reads as light rather than as stacked boxes.
  for (const [px, pw] of [
    [12, 40],
    [276, 38]
  ]) {
    for (let s = 0; s < 8; s++) {
      ops.push([px - s, HORIZON + 1 + s * 3, pw + s * 2, 3, 'floorLit'])
    }
  }

  // Rug under the meeting area.
  ops.push(...rug(108, 124, 74, 32))
  return ops
}

/* ---------------------------------------------------------------- props -- */

const desks = DESK_X.map((x, i) => deskUnit(x, DESK_Y, 100 + i * 17))

/** Depths that both the layout and the renderer's overlays depend on. */
const DESK_BASE_Y = DESK_Y + DESK_BASE
const COFFEE_BASE_Y = 94
const TABLE_BASE_Y = 153

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
  list.push({ id: 'window-l', ops: windowUnit(8, 8, 40, 30), baseY: 0 })
  list.push({ id: 'shelf', ops: shelfUnit(56, 10, 38), baseY: 0 })
  list.push({ id: 'board', ops: evidenceBoard(102, 6, 72, 42), baseY: 0 })
  list.push({ id: 'whiteboard', ops: whiteboard(180, 10, 38, 28), baseY: 0 })
  list.push({ id: 'clock', ops: clockFace(246, 15, 7), baseY: 0 })
  list.push({ id: 'sign', ops: wallSign(246, 28), baseY: 0 })
  list.push({ id: 'window-r', ops: windowUnit(276, 8, 38, 30), baseY: 0 })

  // Chair backs sort just behind their occupant so they frame the sprite.
  deskSpots.forEach((s, i) => {
    list.push({ id: `chair-${i}`, ops: chairBack(s.x, s.y), baseY: s.y - 6 })
  })

  desks.forEach((d, i) => {
    list.push({ id: `desk-${i}`, ops: d.ops, baseY: d.baseY })
  })

  const coffee = coffeeStation(252, 92)
  list.push({ id: 'coffee', ops: coffee.ops, baseY: COFFEE_BASE_Y })

  list.push({ id: 'plant-l', ops: plant(6, 132, 3), baseY: 132 })
  list.push({ id: 'plant-r', ops: plant(298, 124, 9), baseY: 124 })
  list.push({ id: 'table', ops: meetingTable(116, 152), baseY: TABLE_BASE_Y })
  list.push({ id: 'cabinet', ops: cabinet(246, 156), baseY: 156 })
  list.push({ id: 'boxes', ops: boxStack(40, 158), baseY: 158 })

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
  // Far enough below the board that a thought bubble clears its frame.
  boardSpots: [
    { x: 126, y: 86, facing: 'up' },
    { x: 154, y: 86, facing: 'up' }
  ],

  talkSpots: [
    [
      { x: 140, y: 118, facing: 'right' },
      { x: 156, y: 118, facing: 'left' }
    ],
    [
      { x: 72, y: 150, facing: 'right' },
      { x: 88, y: 150, facing: 'left' }
    ],
    [
      { x: 206, y: 146, facing: 'right' },
      { x: 222, y: 146, facing: 'left' }
    ]
  ],

  // Standing at the counter, backs to the viewer.
  coffeeSpots: [
    { x: 262, y: 106, facing: 'up' },
    { x: 288, y: 106, facing: 'up' }
  ],

  wanderSpots: [
    { x: 100, y: 118, facing: 'down' },
    { x: 186, y: 116, facing: 'down' },
    { x: 52, y: 124, facing: 'right' },
    { x: 236, y: 120, facing: 'left' },
    { x: 170, y: 148, facing: 'up' },
    { x: 110, y: 146, facing: 'right' },
    { x: 128, y: 100, facing: 'down' }
  ],

  // The clear corridor between the desk row and the meeting area.
  laneY: 118,

  monitors: desks.map((d) => d.monitor),
  deskBaseY: DESK_BASE_Y,
  steamVents: [
    { x: 282, y: 66, baseY: COFFEE_BASE_Y },
    { x: 162, y: 131, baseY: TABLE_BASE_Y }
  ],
  leds: [...desks.map((d) => d.led), { x: 259, y: 63 }],
  clock: { x: 246, y: 15, r: 7 }
}
