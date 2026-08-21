import { Director, Workstations } from './behavior'
import { makeRng } from '../pixel/ops'
import { detectiveTheme } from '../../themes/detective/theme'
import type { Agent, AgentStatus } from '../../agents/agent.types'
import type { CharacterRuntime } from '../world.types'
import type { SceneDef } from '../../themes/types'

/**
 * Checks for the office's behaviour.
 *
 * These exist because the failures this file guards against are invisible in a
 * screenshot and obvious in a video — which is the worst combination to catch
 * by review. The three that mattered:
 *
 *   1. `thinking` and `working` alternate several times a minute during one
 *      ordinary task, and used to resolve to two different destinations at
 *      opposite ends of the room. A character therefore spent an entire task
 *      pacing between a desk and a corkboard and never arrived at either. It
 *      looks like busy movement, which is why it survived so long.
 *
 *   2. Seat assignments lived in the Director, and the Director is rebuilt
 *      whenever the panel changes shape. Dragging a window edge reshuffled the
 *      whole office.
 *
 *   3. Getting out of a chair walked the character diagonally through the desk
 *      they were sitting at.
 *
 * All three are pure functions of state over time, so they are checkable
 * without a canvas, a browser or a provider.
 */

let failures = 0

function ok(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`)
  }
}

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}\n        expected ${b}\n        actual   ${a}`)
  }
}

/* ------------------------------------------------------------- fixtures -- */

const scene: SceneDef = detectiveTheme.buildScene(760, 420)

function agent(id: string, status: AgentStatus, slot = 0): Agent {
  return {
    id,
    name: id,
    role: 'Agent',
    slot,
    model: 'test',
    provider: 'test',
    status,
    task: null,
    taskId: null,
    executionId: null,
    queued: 0,
    active: true,
    spawned: true,
    visible: true
  }
}

function body(id: string, homeDesk: number): CharacterRuntime {
  return {
    agentId: id,
    def: {
      id: `char-${id}`,
      agentId: id,
      name: id,
      role: 'Agent',
      homeDesk,
      appearance: detectiveTheme.characters[0].appearance
    },
    model: 'test',
    x: scene.width / 2,
    y: scene.laneY,
    facing: 'down',
    turnTo: 'down',
    turnHold: 0,
    state: 'idle',
    place: 'standing',
    path: [],
    destFacing: 'down',
    destSeated: false,
    station: null,
    spotKey: null,
    animTime: 0,
    frame: 0,
    lastStatus: null,
    lastState: null,
    bubble: 'none',
    settled: 0,
    speed: 24,
    vel: 0,
    phase: 0,
    partnerId: null,
    activity: null
  }
}

/**
 * Run the world forward. Returns how long it took for every path to empty,
 * or `null` if the cast never settled.
 */
function settle(
  director: Director,
  cast: CharacterRuntime[],
  agents: Agent[],
  limit = 60
): number | null {
  const dt = 1 / 60
  for (let step = 0; step * dt < limit; step++) {
    for (let i = 0; i < cast.length; i++) {
      director.update(cast[i], agents[i], dt, cast)
    }
    if (cast.every((c) => c.path.length === 0)) return step * dt
  }
  return null
}

console.log('\nWorkstation assignment')

{
  const homes = new Workstations()
  const present = new Set(['a', 'b', 'c'])

  const first = homes.claim('a', 0, scene.workstations.length, present)
  const second = homes.claim('b', 0, scene.workstations.length, present)
  const third = homes.claim('c', 2, scene.workstations.length, present)

  ok('two agents preferring the same desk do not share it', first !== second, `${first} / ${second}`)
  check('a character gets the desk it asked for when it is free', third, 2)
  check('asking twice returns the same desk', homes.claim('a', 5, scene.workstations.length, present), first)

  // The room shrinks: a desk index that no longer exists must be reassigned.
  const small = homes.claim('a', 0, 1, present)
  ok('a desk outside a smaller room is reassigned', small !== null && small < 1, `${small}`)
}

{
  // The scenario that made resizing reshuffle the office: the Director is
  // replaced, the assignments are not.
  const homes = new Workstations()
  const rng = makeRng(7)
  const present = new Set(['a', 'b'])

  const a = body('a', 3)
  const agentA = agent('a', 'working')

  const before = new Director(scene, rng, homes)
  before.onStatusChange(a, agentA, present)
  const deskBefore = a.station

  const after = new Director(scene, makeRng(7), homes)
  a.station = null
  a.spotKey = null
  after.onStatusChange(a, agentA, present)

  check('a desk survives the room being re-laid out', a.station, deskBefore)
}

console.log('\nWorking sends a character to its own desk')

{
  const homes = new Workstations()
  const director = new Director(scene, makeRng(11), homes)
  const present = new Set(['a'])

  const a = body('a', 1)
  const working = agent('a', 'working')

  director.onStatusChange(a, working, present)
  ok('a walk is started', a.path.length > 0, `${a.path.length} nodes`)
  ok('the trip ends in a chair', a.destSeated)

  const took = settle(director, [a], [working])
  ok('the character arrives', took !== null, `${took}`)

  const station = scene.workstations[a.station!]
  check('it arrives at its own seat', [a.x, a.y], [station.seat.x, station.seat.y])
  check('it faces its screen', a.facing, station.seat.facing)
  check('it is in the chair', a.place, 'seated')
  check('it is typing', a.state, 'sitWorking')

  /* ----------------------------------------------------------------- */
  console.log('\nThinking happens where the work is')

  const thinking = agent('a', 'thinking')
  director.onStatusChange(a, thinking, present)

  check('a model call does not send anybody anywhere', a.path.length, 0)
  check('the character stays in its chair', a.place, 'seated')

  director.update(a, thinking, 1 / 60, [a])
  check('and visibly changes what it is doing', a.state, 'sitThinking')

  const backToWork = agent('a', 'working')
  director.onStatusChange(a, backToWork, present)
  director.update(a, backToWork, 1 / 60, [a])
  check('going back to a tool call does not move it either', a.path.length, 0)
  check('it is typing again', a.state, 'sitWorking')
  check('and it is the same desk', a.station, station.index)

  /* ----------------------------------------------------------------- */
  console.log('\nWhat the agent is running changes the pose')

  const reading = agent('a', 'working')
  reading.activity = 'files'
  director.update(a, reading, 1 / 60, [a])
  check('a file tool reads the screen', a.state, 'sitReading')

  const running = agent('a', 'working')
  running.activity = 'terminal'
  director.update(a, running, 1 / 60, [a])
  check('a terminal tool types', a.state, 'sitWorking')

  /* ----------------------------------------------------------------- */
  console.log('\nTalking is done face to face')

  const talking = agent('a', 'talking')
  talking.partnerId = 'b'
  const b = body('b', 5)
  b.x = station.seat.x - 90
  b.y = station.seat.y

  director.onStatusChange(a, talking, present)
  check('somebody at their desk does not walk off to talk', a.path.length, 0)
  // A few ticks: a new facing has to be wanted for a moment before the body
  // commits to it, so that a dog-leg walk cannot make somebody spin on the
  // spot. A fifth of a second is well inside that.
  for (let i = 0; i < 20; i++) director.update(a, talking, 1 / 60, [a, b])
  check('they turn towards the other person', a.facing, 'left')
  check('and speak from the chair', a.state, 'sitTalking')

  /* ----------------------------------------------------------------- */
  console.log('\nLeaving a desk goes round the front of it')

  const idle = agent('a', 'idle')
  // Force the wandering branch rather than the "settle back at the desk" one.
  let wandered = false
  for (let i = 0; i < 40 && !wandered; i++) {
    director.onStatusChange(a, idle, present)
    wandered = a.path.length > 0 && !a.destSeated
  }
  ok('the character eventually leaves the desk', wandered)
  if (wandered) {
    check(
      'the first step is out to the front of the desk',
      [a.path[0].x, a.path[0].y],
      [station.stand.x, station.stand.y]
    )
    ok(
      'which is in front of the desk, not behind it',
      station.stand.y > station.baseY,
      `stand ${station.stand.y} vs desk base ${station.baseY}`
    )
  }
}

console.log('\nMovement')

{
  const homes = new Workstations()
  const director = new Director(scene, makeRng(3), homes)
  const present = new Set(['a'])
  const a = body('a', 0)
  const working = agent('a', 'working')

  a.x = 20
  a.y = scene.height - 30
  director.onStatusChange(a, working, present)

  const dt = 1 / 60
  let peak = 0
  let sliding = 0
  let previous = { x: a.x, y: a.y }
  let steps = 0

  while (a.path.length > 0 && steps < 60 * 60) {
    director.update(a, working, dt, [a])
    peak = Math.max(peak, a.vel)
    const moved = Math.hypot(a.x - previous.x, a.y - previous.y)
    /*
     * A frame where the body moved but the walk cycle was not playing is a
     * character sliding across the floor. The arrival frame is exempt: the
     * body covers the last fraction of a pixel and adopts its resting pose in
     * the same tick, which is the whole point of doing it in one tick.
     */
    if (moved > 0.01 && a.state !== 'walking' && a.path.length > 0) sliding++
    previous = { x: a.x, y: a.y }
    steps++
  }

  ok('the character got up to speed', peak > 20, `peak ${peak.toFixed(1)}`)
  ok('and slowed down before arriving', a.vel < peak, `arrived at ${a.vel.toFixed(1)}`)
  check('it never slides', sliding, 0)
  ok('it takes a sensible amount of time', steps > 30 && steps < 60 * 30, `${steps} frames`)
}

console.log('\nEvery status produces a distinct pose')

{
  const homes = new Workstations()
  const director = new Director(scene, makeRng(5), homes)
  const a = body('a', 0)

  const seen = new Map<string, AgentStatus[]>()
  const statuses: AgentStatus[] = [
    'working',
    'thinking',
    'talking',
    'waiting',
    'error',
    'idle'
  ]

  for (const status of statuses) {
    // Seated, because that is where an agent with work in hand actually is.
    const at = agent('a', status)
    a.place = 'seated'
    a.path = []
    director.update(a, at, 1 / 60, [a])
    seen.set(a.state, [...(seen.get(a.state) ?? []), status])
  }

  const shared = [...seen.entries()].filter(([, list]) => list.length > 1)
  ok(
    'no two statuses share a pose at the desk',
    shared.length === 0,
    shared.map(([pose, list]) => `${pose}: ${list.join(', ')}`).join(' | ')
  )
}

if (failures > 0) {
  console.log(`\n${failures} behaviour check(s) failed.`)
  process.exit(1)
}
console.log('\nAll behaviour checks passed.')
