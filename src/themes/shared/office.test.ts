import {
  MIN_ROOM_H,
  MIN_ROOM_W,
  officeGrid,
  ROOM_H,
  ROOM_W,
  type OfficeGrid
} from './office'

/**
 * Checks for the office grid.
 *
 * The grid is what makes every world equally well furnished: themes are handed
 * anchors and never choose a coordinate, so a layout bug here is a layout bug
 * in all six at once — and one nobody would attribute to this file, because
 * what they would see is a room with two desks in the same place.
 *
 * The first block matters most. The room used to be a fixed 640x400 with a
 * camera panning over it, and every theme's furniture was drawn against those
 * exact numbers. Making the room follow the viewport had to leave that one
 * size untouched, or six worlds would need re-checking by eye.
 */

let failures = 0

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}`)
    console.log(`        expected ${b}`)
    console.log(`        actual   ${a}`)
  }
}

function ok(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`)
  }
}

/** Whether any two spans on one axis overlap. */
function anyOverlap(spans: [number, number][]): string | null {
  const sorted = [...spans].sort((p, q) => p[0] - q[0])
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][0] < sorted[i - 1][1]) {
      return `${JSON.stringify(sorted[i - 1])} and ${JSON.stringify(sorted[i])}`
    }
  }
  return null
}

/* ------------------------------------------------- the historical layout -- */

console.log('\nofficeGrid at the default size')

const base = officeGrid()

check('the room is unchanged', [base.width, base.height], [ROOM_W, ROOM_H])
check('the horizon is unchanged', base.horizon, 88)
check('five wall panels, as every theme was authored against', base.wall.length, 5)
check(
  'the wall panels sit exactly where they did',
  base.wall.map((w) => w.x),
  [40, 158, 276, 394, 512]
)
check('the back desk row is unchanged', base.stations.filter((s) => s.row === 0).map((s) => s.x), [
  42, 210, 378, 546
])
check('the front desk row is unchanged', base.stations.filter((s) => s.row === 1).map((s) => s.x), [
  126, 294, 462
])
check('seven workstations', base.stations.length, 7)
check('the walking lane is unchanged', base.laneY, 224)
check('the standing room is unchanged', base.wallStandY, 134)
check('the zone baseline is unchanged', base.zoneBaseY, 360)
check(
  'the desk rows are unchanged',
  [base.stations[0].y, base.stations[4].y],
  [174, 282]
)

/* ---------------------------------------------------------- every size -- */

console.log('\nofficeGrid across sizes')

const sizes: [number, number][] = [
  [MIN_ROOM_W, MIN_ROOM_H],
  [400, 300],
  [480, 340],
  [ROOM_W, ROOM_H],
  [760, 460],
  [900, 520],
  [1200, 700],
  // Degenerate requests are clamped rather than producing a broken room.
  [120, 80],
  [0, 0]
]

for (const [w, h] of sizes) {
  const g: OfficeGrid = officeGrid(w, h)
  const label = `${w}x${h}`

  ok(
    `${label}: never smaller than the minimum room`,
    g.width >= MIN_ROOM_W && g.height >= MIN_ROOM_H,
    `${g.width}x${g.height}`
  )

  ok(
    `${label}: wall panels do not overlap`,
    anyOverlap(g.wall.map((s) => [s.x, s.x + s.w])) === null,
    anyOverlap(g.wall.map((s) => [s.x, s.x + s.w])) ?? ''
  )
  ok(
    `${label}: wall panels stay inside the room`,
    g.wall.every((s) => s.x >= 0 && s.x + s.w <= g.width)
  )
  ok(
    `${label}: every panel has a positive width`,
    g.wall.every((s) => s.w > 0)
  )

  /*
   * Exactly one centre panel, and never an end. Themes hang the thing that
   * names the world on it, so a room with none would be unidentifiable and a
   * room whose centre was also an end would put a board where a window goes.
   */
  const centres = g.wall.filter((s) => s.isCentre)
  check(`${label}: exactly one centre panel`, centres.length, 1)
  ok(
    `${label}: the centre is never an end`,
    !centres[0].isFirst && !centres[0].isLast
  )

  // Desks are checked per row: the rows are staggered, so the two overlap by
  // design when projected onto one axis.
  for (const row of [0, 1]) {
    const spans = g.stations
      .filter((s) => s.row === row)
      .map((s) => [s.x, s.x + 52] as [number, number])
    ok(
      `${label}: row ${row} desks do not overlap`,
      anyOverlap(spans) === null,
      anyOverlap(spans) ?? ''
    )
  }

  ok(
    `${label}: desks stay inside the room`,
    g.stations.every((s) => s.x >= 0 && s.x + 52 <= g.width)
  )

  /*
   * The bands have to stay in order, or characters would walk through desks:
   * wall, standing room, back row, lane, front row, zones, floor.
   */
  const backY = g.stations.find((s) => s.row === 0)!.y
  const frontY = g.stations.find((s) => s.row === 1)!.y
  ok(
    `${label}: the room's bands are in order`,
    g.horizon < g.wallStandY &&
      g.wallStandY < backY &&
      backY < g.laneY &&
      g.laneY < frontY &&
      frontY < g.zoneBaseY &&
      g.zoneBaseY <= g.height,
    `${g.horizon}/${g.wallStandY}/${backY}/${g.laneY}/${frontY}/${g.zoneBaseY}/${g.height}`
  )

  check(`${label}: always three zones`, g.zones.length, 3)
  ok(
    `${label}: zones stay inside the room`,
    g.zones.every((z) => z.x >= 0 && z.x + z.w <= g.width)
  )
  ok(`${label}: two flanks, one per side`, g.flanks.length === 2)
}

/* --------------------------------------------------------- responsiveness -- */

console.log('\nofficeGrid responds to size')

const narrow = officeGrid(400, 400)
const wide = officeGrid(1200, 400)

ok(
  'a wider room gets more wall panels',
  wide.wall.length > narrow.wall.length,
  `${narrow.wall.length} -> ${wide.wall.length}`
)
ok(
  'a wider room gets more workstations',
  wide.stations.length > narrow.stations.length,
  `${narrow.stations.length} -> ${wide.stations.length}`
)

const short = officeGrid(640, 300)
const tall = officeGrid(640, 620)
ok(
  'a taller room puts more floor between its desk rows',
  tall.stations.find((s) => s.row === 1)!.y - tall.stations.find((s) => s.row === 0)!.y >
    short.stations.find((s) => s.row === 1)!.y - short.stations.find((s) => s.row === 0)!.y
)

ok(
  'the same size twice gives the same room',
  JSON.stringify(officeGrid(760, 460)) === JSON.stringify(officeGrid(760, 460))
)

if (failures > 0) {
  console.log(`\n${failures} office grid check(s) failed.`)
  process.exit(1)
}
console.log('\nAll office grid checks passed.')
