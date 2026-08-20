import type { Op } from '../../world/pixel/ops'
import { backdrop, type FloorStyle, type SceneLayout, type WallStyle } from './room'
import {
  clockFace,
  deskUnit,
  DESK_BASE,
  DESK_VARIANTS,
  SEAT_DX,
  SEAT_DY,
  type DeskParts
} from './props'
import type { Prop, SceneDef, Spot } from '../types'

/**
 * The shape every Backstage world is built on.
 *
 * Worlds used to place each desk, plant and cabinet by hand at absolute
 * coordinates. That produced six rooms with six different densities: one had
 * furniture touching, another had a quarter of the floor empty, and adding a
 * prop to any of them meant re-checking every neighbour by eye.
 *
 * So spacing is computed here instead, once, and every theme is handed the
 * same grid of anchors. A theme decides *what* stands at each anchor - a desk
 * or a lab bench, a whiteboard or an evidence board - and never where. That is
 * what makes "every theme has the same environmental quality" a property of
 * the system rather than a promise someone has to keep by hand.
 *
 * The room is deliberately large. An office that can seat seven with room to
 * walk between them cannot be described in 480x240, and scaling the old room
 * up would only have made the same sparse layout bigger.
 *
 *   ┌──────────────────────────────────────────┐
 *   │  wall: windows, boards, signage, clock   │  0..88
 *   │                                          │
 *   │        (standing room at the wall)       │  88..146
 *   │   desk    desk     desk     desk         │  work row A
 *   │                                          │
 *   │  ────────── walking lane ──────────      │
 *   │                                          │
 *   │      desk      desk      desk            │  work row B
 *   │                                          │
 *   │  meeting      open floor      break      │  lower zones
 *   └──────────────────────────────────────────┘
 */

export const ROOM_W = 640
export const ROOM_H = 400
export const ROOM_HORIZON = 88

/* -------------------------------------------------------------- anchors -- */

/** A panel of back wall a theme may hang something on. */
export interface WallSlot {
  x: number
  y: number
  w: number
  h: number
  /** Horizontal centre, for objects that are placed by their middle. */
  cx: number
  index: number
}

/** A workstation position. `x` is the work surface's left edge. */
export interface StationSlot {
  x: number
  y: number
  /** 0 for the back row, 1 for the front row. */
  row: number
  index: number
  /** Horizontal centre of the work surface. */
  cx: number
  /** A stable per-station number, so clutter varies but never reshuffles. */
  seed: number
}

/** One of the three floor areas in the lower half of the room. */
export interface ZoneRect {
  x: number
  y: number
  w: number
  /** Centre of the zone, and the baseline furniture in it stands on. */
  cx: number
  baseY: number
  index: number
}

/** A spot against one of the side walls, beside the front desk row. */
export interface FlankSlot {
  x: number
  y: number
  side: 'left' | 'right'
}

export interface OfficeGrid {
  width: number
  height: number
  horizon: number
  wall: WallSlot[]
  stations: StationSlot[]
  zones: ZoneRect[]
  /**
   * The two side walls beside the front desk row.
   *
   * The station grid is inset from the room's edges so nobody works with
   * their elbow against a wall, which leaves a column of floor down each
   * side. Left bare it read as the room having been drawn too wide; these
   * are where a world puts the tall thing that fills it.
   */
  flanks: FlankSlot[]
  /** Where characters cross the room. */
  laneY: number
  /** Depth of the back desk row, for sorting its screen overlays. */
  deskBaseY: number
  /** Standing room in front of the back wall, clear of the desks. */
  wallStandY: number
  /** The baseline lower-zone furniture stands on. */
  zoneBaseY: number
  /** Vertical light shafts thrown by the wall's windows, as [x0, x1]. */
  lightColumns: [number, number][]
}

/* ------------------------------------------------------------- the grid -- */

const SIDE_MARGIN = 40
const WALL_SLOTS = 5
const WALL_SLOT_W = 88
const WALL_SLOT_Y = 16
const WALL_SLOT_H = 46

/** Standing room between the skirting and the back desk row. */
const WALL_STAND_Y = 134

/** Work surface heights. The gap between them is the walking lane. */
const ROW_A_Y = 174
const ROW_B_Y = 282
const LANE_Y = 224

const ROW_A_X = [42, 210, 378, 546]
const ROW_B_X = [126, 294, 462]

const ZONE_COUNT = 3
const ZONE_MARGIN = 44
const ZONE_BASE_Y = 360

/**
 * The anchor set, computed once and shared by every world.
 *
 * Everything is derived from the constants above rather than written out, so
 * changing the room's proportions moves every theme's furniture together
 * instead of leaving five of them behind.
 */
export function officeGrid(): OfficeGrid {
  const wallGap =
    (ROOM_W - SIDE_MARGIN * 2 - WALL_SLOT_W * WALL_SLOTS) / (WALL_SLOTS - 1)

  const wall: WallSlot[] = []
  for (let i = 0; i < WALL_SLOTS; i++) {
    const x = Math.round(SIDE_MARGIN + i * (WALL_SLOT_W + wallGap))
    wall.push({
      x,
      y: WALL_SLOT_Y,
      w: WALL_SLOT_W,
      h: WALL_SLOT_H,
      cx: x + (WALL_SLOT_W >> 1),
      index: i
    })
  }

  /*
   * The two rows are staggered rather than aligned. Four desks over three
   * puts every front-row station in the gap behind it, which reads as a real
   * floor plan and leaves a clear diagonal sightline through the room - two
   * aligned rows of four looked like a spreadsheet.
   */
  const stations: StationSlot[] = []
  ROW_A_X.forEach((x, i) => {
    stations.push({ x, y: ROW_A_Y, row: 0, index: i, cx: x + 26, seed: 101 + i * 37 })
  })
  ROW_B_X.forEach((x, i) => {
    stations.push({
      x,
      y: ROW_B_Y,
      row: 1,
      index: ROW_A_X.length + i,
      cx: x + 26,
      seed: 311 + i * 53
    })
  })

  const zoneW = (ROOM_W - ZONE_MARGIN * 2) / ZONE_COUNT
  const zones: ZoneRect[] = []
  for (let i = 0; i < ZONE_COUNT; i++) {
    const x = Math.round(ZONE_MARGIN + i * zoneW)
    zones.push({
      x,
      y: ZONE_BASE_Y,
      w: Math.round(zoneW),
      cx: Math.round(x + zoneW / 2),
      baseY: ZONE_BASE_Y,
      index: i
    })
  }

  // Light falls through the first and last wall panels, which is where every
  // theme puts a window or its equivalent.
  const lightColumns: [number, number][] = [
    [wall[0].x - 4, wall[0].x + WALL_SLOT_W + 4],
    [wall[WALL_SLOTS - 1].x - 4, wall[WALL_SLOTS - 1].x + WALL_SLOT_W + 4]
  ]

  const flanks: FlankSlot[] = [
    { x: 20, y: ROW_B_Y + DESK_BASE, side: 'left' },
    { x: ROOM_W - 48, y: ROW_B_Y + DESK_BASE, side: 'right' }
  ]

  return {
    width: ROOM_W,
    height: ROOM_H,
    horizon: ROOM_HORIZON,
    wall,
    stations,
    zones,
    flanks,
    laneY: LANE_Y,
    deskBaseY: ROW_A_Y + DESK_BASE,
    wallStandY: WALL_STAND_Y,
    zoneBaseY: ZONE_BASE_Y,
    lightColumns
  }
}

/* -------------------------------------------------------------- spacing -- */

/**
 * How far apart two characters stand to talk, in scene pixels.
 *
 * Sized off the sprite rather than picked by eye: characters are ten pixels
 * wide, so this leaves a clear gap between shoulders at any zoom.
 */
const TALK_GAP = 13

/** Evenly spaced positions across a span, with the ends inset. */
function spread(count: number, from: number, to: number): number[] {
  if (count <= 1) return [Math.round((from + to) / 2)]
  const step = (to - from) / (count - 1)
  return Array.from({ length: count }, (_, i) => Math.round(from + i * step))
}

/**
 * Where agents can be, derived from the same grid the furniture is placed on.
 *
 * Every position here is computed, so a station and the seat at it can never
 * drift apart, and no world can end up with three characters standing in the
 * same spot because two lists were edited separately.
 */
export function officeLayout(grid: OfficeGrid): SceneLayout {
  const desks: Spot[] = grid.stations.map((s) => ({
    x: s.x + SEAT_DX,
    y: s.y + SEAT_DY,
    facing: 'down' as const
  }))

  /*
   * Standing at the wall: in front of the middle three panels, which is where
   * themes hang the thing worth reading. The outer two are windows in every
   * world, and nobody stands and studies a window.
   */
  const boardSpots: Spot[] = grid.wall
    .slice(1, 4)
    .map((slot) => ({ x: slot.cx, y: grid.wallStandY, facing: 'up' as const }))

  /*
   * Conversation pairs, spread across the two open bands: the walking lane
   * between the desk rows, and the floor in front of the lower zones. Six
   * pairs means three separate conversations can happen at once without
   * anyone having to cross the room to find a free spot.
   */
  const talkSpots: [Spot, Spot][] = []
  for (const y of [grid.laneY, grid.zoneBaseY - 16]) {
    for (const cx of spread(3, grid.zones[0].cx, grid.zones[2].cx)) {
      talkSpots.push([
        { x: cx - TALK_GAP, y, facing: 'right' },
        { x: cx + TALK_GAP, y, facing: 'left' }
      ])
    }
  }

  // The break area is the last zone, and its counter is approached from the
  // front so the character's back is to the viewer.
  const breakZone = grid.zones[grid.zones.length - 1]
  const coffeeSpots: Spot[] = spread(
    3,
    breakZone.cx - 26,
    breakZone.cx + 26
  ).map((x) => ({ x, y: breakZone.baseY + 14, facing: 'up' as const }))

  /*
   * Loitering room, on a grid rather than scattered. Three bands of five
   * gives fifteen distinct places to stand, which is what keeps a full office
   * from piling characters on top of one another when everybody is idle.
   */
  const wanderSpots: Spot[] = []
  const facings = ['down', 'left', 'up', 'right'] as const
  const bands = [grid.laneY + 4, grid.zoneBaseY - 32, grid.height - 22]
  bands.forEach((y, row) => {
    spread(5, 60, grid.width - 60).forEach((x, col) => {
      wanderSpots.push({ x, y, facing: facings[(row + col) % facings.length] })
    })
  })

  return {
    desks,
    deskBaseY: grid.deskBaseY,
    boardSpots,
    talkSpots,
    coffeeSpots,
    wanderSpots,
    laneY: grid.laneY
  }
}

/* ----------------------------------------------------------- composition -- */

/**
 * What a theme contributes to the shared room.
 *
 * Note what is absent: there is no way to say where anything goes. A theme is
 * asked what stands at slot 2 and what furnishes zone 1, and the grid decides
 * the coordinates. That is the whole point — a world cannot crowd one corner
 * and leave another empty, because it never sees a coordinate to get wrong.
 */
export interface OfficeSpec {
  floorStyle: FloorStyle
  wallStyle: WallStyle

  /**
   * What hangs on each panel of the back wall. Called once per slot; return
   * an empty array for a panel this world leaves bare.
   */
  wall: (slot: WallSlot, grid: OfficeGrid) => Op[]

  /** What furnishes each of the three lower floor zones. */
  zone: (zone: ZoneRect, grid: OfficeGrid) => ZoneFurnishing

  /**
   * The signature pieces that make this world itself: things against the side
   * walls, in the corners, or filling the gaps between workstations.
   */
  accents?: (grid: OfficeGrid) => Prop[]

  /**
   * The workstation. Defaults to a desk; a world whose people work at lab
   * benches or kitchen counters supplies its own.
   */
  station?: (slot: StationSlot) => DeskParts

  /** Which wall panel the clock hangs on, and how big it is. */
  clock?: { slot: number; r: number }
}

/** What a theme puts in one floor zone. */
export interface ZoneFurnishing {
  props: Prop[]
  /** Rising steam, e.g. from a coffee machine or a beaker. */
  steam?: { x: number; y: number; baseY: number }[]
  /** Blinking indicators on this zone's equipment. */
  leds?: { x: number; y: number }[]
}

/**
 * Build a complete world from a theme's furnishings.
 *
 * Every scene in the app comes through here, so the guarantees hold by
 * construction rather than by review: same room size, same spacing, same
 * number of workstations, same standing room, same clock — six worlds that
 * differ in what they are made of and not in how well they are made.
 */
export function composeOffice(spec: OfficeSpec): SceneDef {
  const grid = officeGrid()
  const layout = officeLayout(grid)

  const props: Prop[] = []
  const monitors: { x: number; y: number }[] = []
  const leds: { x: number; y: number }[] = []
  const steamVents: { x: number; y: number; baseY: number }[] = []

  /* The back wall. Flat against it, so it never sorts against the cast. */
  for (const slot of grid.wall) {
    const ops = spec.wall(slot, grid)
    if (ops.length > 0) props.push({ id: `wall-${slot.index}`, ops, baseY: 0 })
  }

  /* The clock, hung by the room rather than by each world. */
  const clockSpec = spec.clock ?? { slot: 2, r: 8 }
  const clockSlot = grid.wall[clockSpec.slot] ?? grid.wall[2]
  const clock = { x: clockSlot.cx, y: clockSlot.y + clockSlot.h + 12, r: clockSpec.r }
  props.push({
    id: 'clock',
    ops: clockFace(clock.x, clock.y, clock.r),
    baseY: 0
  })

  /*
   * Workstations. The variant is chosen by position rather than at random, so
   * neighbours never land on the same arrangement and the room looks the same
   * on every launch.
   */
  const build = spec.station ?? defaultStation
  for (const slot of grid.stations) {
    const desk = build(slot)
    props.push({ id: `station-${slot.index}`, ops: desk.ops, baseY: desk.baseY })
    monitors.push(...desk.monitors)
    leds.push(desk.led)
  }

  /* The lower zones. */
  for (const zone of grid.zones) {
    const furnishing = spec.zone(zone, grid)
    props.push(...furnishing.props)
    if (furnishing.steam) steamVents.push(...furnishing.steam)
    if (furnishing.leds) leds.push(...furnishing.leds)
  }

  props.push(...(spec.accents?.(grid) ?? []))

  return {
    width: grid.width,
    height: grid.height,
    horizon: grid.horizon,
    background: backdrop({
      width: grid.width,
      height: grid.height,
      horizon: grid.horizon,
      floorStyle: spec.floorStyle,
      wallStyle: spec.wallStyle,
      lightPools: grid.lightColumns.map(
        ([x0, x1]) => [x0, x1 - x0] as [number, number]
      )
    }),
    props,
    ...layout,
    monitors,
    leds,
    steamVents,
    clock,
    lightColumns: grid.lightColumns
  }
}

/** A plain desk, cycling arrangements so no two neighbours match. */
function defaultStation(slot: StationSlot): DeskParts {
  return deskUnit(
    slot.x,
    slot.y,
    slot.seed,
    DESK_VARIANTS[slot.index % DESK_VARIANTS.length]
  )
}
