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

/**
 * The room's default size, and the proportions every other size is derived
 * from.
 *
 * The world used to be exactly this and nothing else, with a camera panning
 * over it. There is no camera any more — the whole room has to fit the panel —
 * so the room is now built at whatever logical size the viewport gives it, and
 * these are the numbers the proportions were tuned against. A 640x400 room is
 * pixel-identical to the one that existed before this change; a larger one
 * gets *more* room rather than the same room stretched.
 */
export const ROOM_W = 640
export const ROOM_H = 400
export const ROOM_HORIZON = 88

/**
 * The smallest room worth building.
 *
 * Below this the wall panels overlap and the desks touch, so a viewport this
 * small is served a room slightly larger than it and loses a sliver at the
 * edge — which is better than a room that has visibly fallen apart.
 */
export const MIN_ROOM_W = 360
export const MIN_ROOM_H = 260

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
  /**
   * Whether this is an end panel.
   *
   * The number of panels changes with the room's width, so a theme can no
   * longer say "panel 4 is a window" and mean "the last one". These are how a
   * world talks about the ends without knowing how many there are.
   */
  isFirst: boolean
  isLast: boolean
  /**
   * The middle panel, where a world hangs the thing that names it — the
   * evidence board, the whiteboard, the case wall.
   *
   * Guaranteed to exist and never to be an end, so a narrow room still shows
   * what kind of place it is. Switching on a fixed index instead meant the one
   * panel that identified the world disappeared the moment the room was too
   * narrow to have five.
   */
  isCentre: boolean
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
const WALL_SLOT_W = 88
/**
 * The spacing wall panels are counted at.
 *
 * Exactly the gap the fixed five-panel wall used at 640 wide, so the default
 * room still resolves to five panels in the same places. Deriving the count
 * from a smaller "minimum" gap looked reasonable and quietly produced six.
 */
const WALL_GAP = 30
/** The narrowest gap two panels may sit at before they read as one. */
const WALL_GAP_MIN = 16

/** Where the desk columns start, and how wide a work surface is. */
const DESK_MARGIN = 42
const DESK_W = 52
/** Roughly one workstation per this many pixels of width. */
const DESK_PITCH = 168

const ZONE_COUNT = 3
const ZONE_MARGIN = 44

/**
 * Where each band of the room sits, as a fraction of the floor.
 *
 * Fractions rather than pixel constants, so a taller room gets more floor
 * between its rows instead of the same rows with dead space underneath. The
 * numbers are exactly what the fixed layout used at 400px tall — a 640x400
 * room built now is pixel-identical to the one that existed before the room
 * became resizable, which is what lets six themes be reproportioned without
 * any of them being re-checked by eye.
 */
const BAND = {
  /** Standing room between the skirting and the back desk row. */
  wallStand: 0.148,
  /** The back row of work surfaces. */
  rowA: 0.276,
  /** The walking lane between the two rows. */
  lane: 0.436,
  /** The front row. */
  rowB: 0.622,
  /** The baseline the lower zones' furniture stands on. */
  zoneBase: 0.872
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * The anchor set for a room of this size.
 *
 * Everything is derived rather than written out, so a world is furnished the
 * same way at every size: a wider room gets more wall panels and more desks, a
 * taller one gets more floor between its rows, and no theme has to know that
 * either happened. That is what makes "the whole room always fits, and always
 * looks like a room" a property of the system rather than a set of numbers
 * somebody has to keep re-tuning.
 */
export function officeGrid(
  roomW: number = ROOM_W,
  roomH: number = ROOM_H
): OfficeGrid {
  const width = Math.max(MIN_ROOM_W, Math.round(roomW))
  const height = Math.max(MIN_ROOM_H, Math.round(roomH))

  /*
   * The wall band keeps its absolute height rather than scaling with the room.
   * It holds windows, boards and signage at a size the art was drawn for, and
   * a taller room should gain floor to work on, not a taller skirting.
   */
  const horizon = clamp(ROOM_HORIZON, 60, Math.round(height * 0.34))
  const floor = height - horizon
  const band = (fraction: number) => Math.round(horizon + floor * fraction)

  const wallStandY = band(BAND.wallStand)
  const rowAY = band(BAND.rowA)
  const laneY = band(BAND.lane)
  const rowBY = band(BAND.rowB)
  const zoneBaseY = band(BAND.zoneBase)

  /* ------------------------------------------------------------- wall -- */

  /*
   * As many panels as fit at a readable spacing. Five at the default width,
   * which is what every theme was authored against; more on a wide display,
   * fewer on a narrow one, and the panel itself narrows only when even the
   * minimum count would not otherwise fit.
   */
  const usable = width - SIDE_MARGIN * 2
  const slots = clamp(
    Math.round((usable + WALL_GAP) / (WALL_SLOT_W + WALL_GAP)),
    3,
    9
  )
  const slotW = Math.min(
    WALL_SLOT_W,
    Math.floor((usable - WALL_GAP_MIN * (slots - 1)) / slots)
  )
  const wallGap = slots > 1 ? (usable - slotW * slots) / (slots - 1) : 0

  const centre = slots >> 1
  const wall: WallSlot[] = []
  for (let i = 0; i < slots; i++) {
    const x = Math.round(SIDE_MARGIN + i * (slotW + wallGap))
    wall.push({
      x,
      y: Math.round(horizon * 0.18),
      w: slotW,
      h: Math.round(horizon * 0.52),
      cx: x + (slotW >> 1),
      index: i,
      isFirst: i === 0,
      isLast: i === slots - 1,
      isCentre: i === centre
    })
  }

  /* --------------------------------------------------------- stations -- */

  /*
   * The two rows are staggered rather than aligned. Four desks over three
   * puts every front-row station in the gap behind it, which reads as a real
   * floor plan and leaves a clear diagonal sightline through the room — two
   * aligned rows of four looked like a spreadsheet.
   */
  const backCount = clamp(Math.round(width / DESK_PITCH), 2, 6)
  const backFrom = DESK_MARGIN
  const backTo = width - DESK_MARGIN - DESK_W
  const step = backCount > 1 ? (backTo - backFrom) / (backCount - 1) : 0

  const stations: StationSlot[] = []
  spread(backCount, backFrom, backTo).forEach((x, i) => {
    stations.push({ x, y: rowAY, row: 0, index: i, cx: x + 26, seed: 101 + i * 37 })
  })

  // Half a step in, one fewer, so every front desk sits in a back-row gap.
  const frontCount = Math.max(1, backCount - 1)
  spread(frontCount, backFrom + step / 2, backTo - step / 2).forEach((x, i) => {
    stations.push({
      x,
      y: rowBY,
      row: 1,
      index: backCount + i,
      cx: x + 26,
      seed: 311 + i * 53
    })
  })

  /* ------------------------------------------------------------ zones -- */

  /*
   * Always three, however wide the room. Every theme furnishes zone 0, 1 and 2
   * as three distinct places — a meeting table, an archive, a break area — and
   * a fourth would fall through to whichever one their `zone` function uses as
   * its default, putting a second coffee machine in the corner. They get wider
   * on a wide display instead, which is the right answer anyway.
   */
  const zoneW = (width - ZONE_MARGIN * 2) / ZONE_COUNT
  const zones: ZoneRect[] = []
  for (let i = 0; i < ZONE_COUNT; i++) {
    const x = Math.round(ZONE_MARGIN + i * zoneW)
    zones.push({
      x,
      y: zoneBaseY,
      w: Math.round(zoneW),
      cx: Math.round(x + zoneW / 2),
      baseY: zoneBaseY,
      index: i
    })
  }

  // Light falls through the first and last wall panels, which is where every
  // theme puts a window or its equivalent.
  const first = wall[0]
  const last = wall[wall.length - 1]
  const lightColumns: [number, number][] = [
    [first.x - 4, first.x + slotW + 4],
    [last.x - 4, last.x + slotW + 4]
  ]

  const flanks: FlankSlot[] = [
    { x: 20, y: rowBY + DESK_BASE, side: 'left' },
    { x: width - 48, y: rowBY + DESK_BASE, side: 'right' }
  ]

  return {
    width,
    height,
    horizon,
    wall,
    stations,
    zones,
    flanks,
    laneY,
    deskBaseY: rowAY + DESK_BASE,
    wallStandY,
    zoneBaseY,
    lightColumns
  }
}

/* ------------------------------------------------------- wall landmarks -- */

/**
 * The panel a world hangs its identity on.
 *
 * Always present and never an end, whatever the room's width. Themes used to
 * write `grid.wall[2]` and mean "the middle one", which stopped being true the
 * moment the number of panels started following the viewport.
 */
export function centreSlot(grid: OfficeGrid): WallSlot {
  return grid.wall.find((s) => s.isCentre) ?? grid.wall[grid.wall.length >> 1]
}

/**
 * Where the door goes: the gap between the two panels at one end of the wall.
 *
 * Returns the door's left edge, already offset for its own width. Taking a
 * side rather than an index is what makes it safe at every room size — a
 * theme that wanted the gap between panels three and four had nothing to point
 * at in a room with three panels.
 */
export function doorwayX(grid: OfficeGrid, side: 'left' | 'right' = 'left'): number {
  const n = grid.wall.length
  const [a, b] =
    side === 'left'
      ? [grid.wall[0], grid.wall[Math.min(1, n - 1)]]
      : [grid.wall[Math.max(0, n - 2)], grid.wall[n - 1]]

  return Math.round((a.x + a.w + b.x) / 2) - 17
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
   * Standing at the wall: in front of every panel except the ends, which is
   * where themes hang the thing worth reading. The outer two are windows in
   * every world, and nobody stands and studies a window.
   */
  const boardSpots: Spot[] = grid.wall
    .filter((slot) => !slot.isFirst && !slot.isLast)
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
/**
 * A theme's scene builder, memoised on the room size.
 *
 * Composing a scene walks every wall panel, workstation and zone and produces
 * a few thousand draw ops, and the world rebuilds whenever the window changes
 * shape enough to matter. Two things ask for the same size often enough to be
 * worth remembering: React's development double-mount, and a window dragged
 * back to a size it was a moment ago.
 *
 * The cache is per theme and holds a couple of sizes, because that is all
 * anyone has — a window is one shape at a time, and the previous shape is the
 * only other one likely to come back.
 */
export function sceneFactory(spec: OfficeSpec) {
  const cache = new Map<string, SceneDef>()

  return (width: number, height: number): SceneDef => {
    const key = `${Math.round(width)}x${Math.round(height)}`
    const hit = cache.get(key)
    if (hit) return hit

    const built = composeOffice(spec, width, height)
    if (cache.size >= 3) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, built)
    return built
  }
}

export function composeOffice(
  spec: OfficeSpec,
  roomW: number = ROOM_W,
  roomH: number = ROOM_H
): SceneDef {
  const grid = officeGrid(roomW, roomH)
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

  /*
   * The clock, hung by the room rather than by each world.
   *
   * The requested panel is clamped rather than defaulted, because the number
   * of panels changes with the room's width: a theme asking for panel 3 in a
   * three-panel room must land on the last one, not fall back to the middle
   * one — which is where several themes already hang their signage, and a
   * clock face behind a sign is what this used to produce.
   */
  const clockSpec = spec.clock ?? { slot: 2, r: 8 }
  const clockSlot = grid.wall[clamp(clockSpec.slot, 0, grid.wall.length - 1)]
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
