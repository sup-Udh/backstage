import type { Agent, AgentStatus } from '../../agents/agent.types'
import { characterStateForAgent } from '../../characters/character.states'
import type { Facing } from '../../characters/character.types'
import type { SceneDef, Spot, Workstation } from '../../themes/types'
import type { Bubble, CharacterRuntime, PathNode } from '../world.types'

/**
 * Where every agent works, for as long as the session lasts.
 *
 * Held outside the director on purpose. A director belongs to one laid-out
 * room and is thrown away whenever the panel changes shape — which used to
 * take every seat assignment with it, so dragging a window edge reshuffled the
 * whole office and nobody had a desk that was theirs. Assignments are a fact
 * about the *team*, not about the room's current dimensions, so they outlive
 * the room.
 *
 * Keyed by agent id, not by character id. Two agents can wear the same
 * character — a theme has eight faces and the roster is not limited to eight —
 * and keying by the face meant they shared a desk and then fought over it.
 */
export class Workstations {
  private byAgent = new Map<string, number>()

  /**
   * The desk this agent owns, claiming one if it has none yet.
   *
   * Preference order: the desk it already has, the desk its character
   * nominates, then the lowest-numbered free one. Anything already taken by a
   * present agent is skipped, so two people never end up in one chair.
   */
  claim(agentId: string, preferred: number, count: number, present: Set<string>): number | null {
    if (count === 0) return null

    const existing = this.byAgent.get(agentId)
    if (existing !== undefined && existing < count) return existing

    const taken = new Set<number>()
    for (const [id, index] of this.byAgent) {
      if (id !== agentId && present.has(id)) taken.add(index)
    }

    const order = [preferred, ...Array.from({ length: count }, (_, i) => i)]
    for (const index of order) {
      if (index >= 0 && index < count && !taken.has(index)) {
        this.byAgent.set(agentId, index)
        return index
      }
    }

    // Every desk taken. Nobody gets a phantom one: the director sends them to
    // work standing up instead, which is at least honest about the room.
    return null
  }

  forget(agentId: string): void {
    this.byAgent.delete(agentId)
  }

  get(agentId: string): number | undefined {
    return this.byAgent.get(agentId)
  }
}

/**
 * The director decides *where* a character goes for a given agent status,
 * and walks them there. It is the only place that knows the office has
 * desks and a corkboard, which keeps that knowledge out of both the agent
 * runtime above it and the renderer below it.
 *
 * ── The rule that matters most ──
 *
 * A destination is chosen from what the agent is *for*, never from what it is
 * doing this second. An agent alternates between `thinking` (a model call is
 * in flight) and `working` (a tool is running) several times a minute, and the
 * previous director sent `thinking` to the evidence board and `working` to a
 * desk — so a single ordinary task made its character pace back and forth
 * across the room for its entire duration, never reaching either end. Both now
 * resolve to the same place: the agent's own workstation. What changes between
 * them is the pose, which is what a person changes too.
 */
export class Director {
  /** spot key -> agent id holding it. */
  private reserved = new Map<string, string>()

  constructor(
    private scene: SceneDef,
    private rng: () => number,
    private homes: Workstations
  ) {}

  private isFree(key: string, self: string): boolean {
    const holder = this.reserved.get(key)
    return holder === undefined || holder === self
  }

  /** Give up any spot this character holds, so a later arrival can use it. */
  release(c: CharacterRuntime): void {
    if (c.spotKey && this.reserved.get(c.spotKey) === c.agentId) {
      this.reserved.delete(c.spotKey)
    }
    c.spotKey = null
  }

  /** Forget an agent entirely: it has left the world. */
  forget(c: CharacterRuntime): void {
    this.release(c)
    this.homes.forget(c.agentId)
  }

  private take(
    c: CharacterRuntime,
    key: string,
    spot: Spot,
    /** Present when the destination is a chair, and which one. */
    into?: Workstation
  ): void {
    this.reserved.set(key, c.agentId)
    c.spotKey = key
    c.destFacing = spot.facing
    c.destSeated = into !== undefined
    c.path = this.route(c, spot.x, spot.y, into)
  }

  private station(index: number | null): Workstation | null {
    if (index === null) return null
    return this.scene.workstations[index] ?? null
  }

  /**
   * Characters cross the office along a clear corridor rather than walking
   * through the furniture, and they get in and out of a chair by going round
   * the front of the desk rather than through it.
   *
   * Those two rules are the whole path-finder, and between them they are why
   * movement now reads as routing rather than as a straight line to wherever
   * the destination happens to be.
   */
  private route(
    c: CharacterRuntime,
    tx: number,
    ty: number,
    into?: Workstation
  ): PathNode[] {
    const lane = this.scene.laneY
    const nodes: PathNode[] = []

    /*
     * Getting up. A seated character is behind their desk; stepping straight
     * out towards the lane would take them through the desk body, so the
     * first move is always out to the standing spot in front of it.
     */
    const from = this.station(c.station)
    if (c.place === 'seated' && from) {
      nodes.push({ x: from.stand.x, y: from.stand.y })
    }

    const startY = nodes.length > 0 ? nodes[nodes.length - 1].y : c.y
    const startX = nodes.length > 0 ? nodes[nodes.length - 1].x : c.x

    if (Math.abs(startY - ty) > 12) {
      if (Math.abs(startY - lane) > 3) nodes.push({ x: startX, y: lane })
      if (Math.abs(tx - startX) > 3) nodes.push({ x: tx, y: lane })
    }

    /*
     * Sitting down. The last leg is the step in behind the desk, which is a
     * short move up the screen from the standing spot — and is the moment the
     * desk starts drawing over the character's legs.
     */
    if (into) nodes.push({ x: into.stand.x, y: into.stand.y })

    nodes.push({ x: tx, y: ty })
    return nodes
  }

  private pick<T>(items: T[]): T {
    return items[Math.floor(this.rng() * items.length)]
  }

  /** A loitering spot, used as the fallback whenever a role spot is taken. */
  private sendToWander(c: CharacterRuntime): void {
    const free = this.scene.wanderSpots
      .map((s, i) => ({ s, key: `wander:${i}` }))
      .filter((o) => this.isFree(o.key, c.agentId))
    if (free.length === 0) {
      c.path = []
      c.destSeated = false
      return
    }
    const choice = this.pick(free)
    this.take(c, choice.key, choice.s)
  }

  /**
   * Send this character to the desk that is theirs.
   *
   * Returns false when the office has no free desk, in which case the caller
   * finds them somewhere to work standing up. A character already sitting at
   * their own desk is left alone rather than being asked to stand up and sit
   * back down, which is the difference between an agent picking up a second
   * task and an agent appearing to restart.
   */
  private sendToStation(c: CharacterRuntime, present: Set<string>): boolean {
    const index = this.homes.claim(
      c.agentId,
      c.def.homeDesk,
      this.scene.workstations.length,
      present
    )
    if (index === null) return false

    c.station = index
    const station = this.scene.workstations[index]
    const key = `desk:${index}`

    if (c.place === 'seated' && c.spotKey === key) {
      // Already there. No trip, no re-seating, no flicker.
      c.path = []
      c.destSeated = true
      c.destFacing = station.seat.facing
      return true
    }

    this.release(c)
    this.take(c, key, station.seat, station)
    return true
  }

  /**
   * Called when an agent's status changes. Picks a destination and starts the
   * walk; the visual state stays 'walking' until arrival.
   *
   * `present` is every agent that currently has a body, so a desk held by
   * somebody who has left is not treated as occupied.
   */
  onStatusChange(c: CharacterRuntime, agent: Agent, present: Set<string>): void {
    const status = agent.status
    c.partnerId = agent.partnerId ?? null
    c.activity = agent.activity ?? null

    switch (status) {
      /*
       * All four of these are "this agent has work in hand". They go to the
       * same place — its desk — and differ only in what the body does once it
       * is there. That is the fix for the pacing: a task that alternates
       * between a model call and a tool call no longer alternates between two
       * ends of the office.
       */
      case 'working':
      case 'thinking':
      case 'queued':
      case 'stopping':
        if (!this.sendToStation(c, present)) this.sendToBoard(c)
        return

      case 'waiting':
        // Blocked, but still on the job. Wait at the desk if there is one.
        if (!this.sendToStation(c, present)) {
          if (c.place !== 'walking') c.path = []
        }
        return

      case 'talking':
        this.sendToConversation(c, present)
        return

      /*
       * A finish and a failure both happen wherever the character already is.
       * Standing up to celebrate and sitting down again reads as a glitch,
       * and walking away from a failed run reads as somebody leaving the
       * scene of it.
       *
       * Somebody mid-journey is left to finish it. Cutting the path would
       * stop them dead in the middle of the floor and strand them there, which
       * is worse than either.
       */
      case 'success':
      case 'error':
        if (c.place !== 'walking') {
          c.path = []
          c.destSeated = c.place === 'seated'
        }
        return

      case 'idle': {
        /*
         * An agent that has finished settles back at its own desk. That is
         * what makes the office read as a workplace with assigned seats rather
         * than a room people drift around in — but not every time, because an
         * office where nobody ever gets up is a diorama.
         */
        if (this.rng() < 0.68 && this.sendToStation(c, present)) return

        if (this.rng() < 0.4) {
          const free = this.scene.coffeeSpots
            .map((s, i) => ({ s, key: `coffee:${i}` }))
            .filter((o) => this.isFree(o.key, c.agentId))
          if (free.length > 0) {
            this.release(c)
            const choice = this.pick(free)
            this.take(c, choice.key, choice.s)
            return
          }
        }
        this.release(c)
        this.sendToWander(c)
        return
      }

      default:
        this.release(c)
        this.sendToWander(c)
        return
    }
  }

  private sendToBoard(c: CharacterRuntime): void {
    this.release(c)
    const free = this.scene.boardSpots
      .map((s, i) => ({ s, key: `board:${i}` }))
      .filter((o) => this.isFree(o.key, c.agentId))
    if (free.length === 0) {
      this.sendToWander(c)
      return
    }
    const choice = this.pick(free)
    this.take(c, choice.key, choice.s)
  }

  /**
   * A conversation.
   *
   * Agent-to-agent contact is usually brief — a delegation is one message —
   * and marching two characters across the office for something that lasts a
   * second and a half looks worse than not showing it at all: they arrive
   * after it has finished. So somebody who is already at their desk turns
   * their chair towards whoever they are talking to and speaks from there,
   * which is both quicker to read and what people actually do.
   *
   * Only a character with nowhere else to be walks to a meeting spot.
   */
  private sendToConversation(c: CharacterRuntime, present: Set<string>): void {
    if (c.place === 'seated') {
      // Stay in the chair and turn towards them. Facing is resolved every
      // frame in `update`, because the other party may be moving.
      c.path = []
      c.destSeated = true
      return
    }

    if (c.place === 'walking') return // Let them finish the trip they are on.

    for (let i = 0; i < this.scene.talkSpots.length; i++) {
      const keyA = `talk:${i}:a`
      const keyB = `talk:${i}:b`
      const holderA = this.reserved.get(keyA)
      const holderB = this.reserved.get(keyB)

      // Join a partner who is already standing at end A.
      if (holderA && !holderB && present.has(holderA)) {
        this.release(c)
        this.take(c, keyB, this.scene.talkSpots[i][1])
        return
      }
      if (holderB && !holderA && present.has(holderB)) {
        this.release(c)
        this.take(c, keyA, this.scene.talkSpots[i][0])
        return
      }
    }
    // No conversation in progress: open one.
    for (let i = 0; i < this.scene.talkSpots.length; i++) {
      const keyA = `talk:${i}:a`
      if (this.isFree(keyA, c.agentId) && !this.reserved.has(`talk:${i}:b`)) {
        this.release(c)
        this.take(c, keyA, this.scene.talkSpots[i][0])
        return
      }
    }
    this.release(c)
    this.sendToWander(c)
  }

  /**
   * Advance one character. Returns nothing; mutates in place by design.
   *
   * `all` is the rest of the cast, which is needed for exactly one thing:
   * turning to face whoever you are talking to.
   */
  update(
    c: CharacterRuntime,
    agent: Agent,
    dt: number,
    all: CharacterRuntime[]
  ): void {
    c.activity = agent.activity ?? null
    c.partnerId = agent.partnerId ?? null

    if (c.path.length > 0) {
      this.walk(c, dt)
      return
    }

    /* ------------------------------------------------------- arrived -- */

    if (c.place === 'walking') {
      // The trip is over. Take up the destination's facing and, if the trip
      // ended in a chair, sit down in it.
      c.place = c.destSeated ? 'seated' : 'standing'
      c.facing = c.destFacing
      c.turnTo = c.destFacing
      c.vel = 0
      c.settled = 0
    }

    c.settled += dt
    c.state = characterStateForAgent(
      agent.status,
      c.place === 'seated',
      c.activity
    )
    c.bubble = bubbleFor(agent.status)

    /*
     * Face the other party.
     *
     * Only while actually talking, and only towards somebody who is in the
     * room. A character who keeps staring at the last person they spoke to is
     * as wrong as one who never looks at them.
     */
    if (agent.status === 'talking' && c.partnerId) {
      const partner = all.find((o) => o.agentId === c.partnerId)
      if (partner) this.face(c, partner.x - c.x, partner.y - c.y, dt)
      return
    }

    this.settleFacing(c, dt)
  }

  /** One step along the path, with a ramp on and off the pace. */
  private walk(c: CharacterRuntime, dt: number): void {
    c.place = 'walking'
    c.state = 'walking'
    c.bubble = 'none'
    c.settled = 0

    const node = c.path[0]
    const dx = node.x - c.x
    const dy = node.y - c.y
    const dist = Math.hypot(dx, dy)

    /*
     * Distance still to run, so the ramp-down starts before the *last* leg
     * rather than at each corner. Slowing at every waypoint is what made the
     * old movement read as a series of hops between grid squares.
     */
    let remaining = dist
    for (let i = 1; i < c.path.length; i++) {
      const a = c.path[i - 1]
      const b = c.path[i]
      remaining += Math.hypot(b.x - a.x, b.y - a.y)
    }

    // v² = 2·a·s is the speed at which the remaining distance is exactly
    // enough to stop in, so a character always arrives at rest and never
    // overshoots into the furniture.
    const approach = Math.sqrt(Math.max(0, 2 * DECEL * remaining))
    const target = Math.min(c.speed, Math.max(MIN_SPEED, approach))

    if (c.vel < target) c.vel = Math.min(target, c.vel + ACCEL * dt)
    else c.vel = Math.max(target, c.vel - DECEL * dt)

    const step = c.vel * dt

    if (dist <= step || dist < 0.001) {
      c.x = node.x
      c.y = node.y
      c.path.shift()
      return
    }

    c.x += (dx / dist) * step
    c.y += (dy / dist) * step
    this.face(c, dx, dy, dt)
  }

  /**
   * Turn towards a direction, but not instantly.
   *
   * A character walking a dog-leg crosses the point where |dx| and |dy| are
   * equal, and a facing chosen purely on which is larger flips back and forth
   * across it several times a second. The hold means a new facing has to be
   * wanted for a moment before the body commits to it.
   */
  private face(c: CharacterRuntime, dx: number, dy: number, dt: number): void {
    const wanted: Facing =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? 'right'
          : 'left'
        : dy > 0
          ? 'down'
          : 'up'

    if (wanted === c.facing) {
      c.turnTo = wanted
      c.turnHold = 0
      return
    }
    if (wanted !== c.turnTo) {
      c.turnTo = wanted
      c.turnHold = TURN_HOLD
      return
    }
    c.turnHold -= dt
    if (c.turnHold <= 0) c.facing = wanted
  }

  /**
   * Small looking-about while settled.
   *
   * Only for characters who are standing with nothing to do, and only rarely.
   * A seated character faces their screen, and one at a board faces the board;
   * both of those are what the destination said, and overriding them would
   * undo the reason the destination has a facing at all.
   */
  private settleFacing(c: CharacterRuntime, dt: number): void {
    if (c.place !== 'standing') return
    c.turnHold -= dt
    if (c.turnHold > 0) return
    c.turnHold = 4 + this.rng() * 6
    if (this.rng() < 0.35) {
      const options: Facing[] = ['down', 'left', 'right']
      c.facing = options[Math.floor(this.rng() * options.length)]
    } else {
      c.facing = c.destFacing
    }
  }
}

/** Scene pixels per second, squared. How briskly a character gets going. */
const ACCEL = 70
/** Harder than the acceleration, so arrivals are crisp and departures are not. */
const DECEL = 95
/** The crawl a character finishes the last pixel at, rather than stopping dead. */
const MIN_SPEED = 6
/** How long a new facing must be wanted before the body commits, in seconds. */
const TURN_HOLD = 0.12

/**
 * The decoration above the head.
 *
 * Deliberately sparse, and deliberately *not* the primary signal. The body is
 * what says what somebody is doing; these mark the two things a body cannot
 * say on its own — that an exchange involves two people, and that a moment has
 * just been punctuated — plus the one thing that is genuinely invisible, which
 * is being blocked on something outside the room.
 */
function bubbleFor(status: AgentStatus): Bubble {
  if (status === 'success') return 'spark'
  if (status === 'talking') return 'talk'
  if (status === 'thinking') return 'think'
  if (status === 'waiting' || status === 'queued') return 'wait'
  if (status === 'error') return 'alert'
  return 'none'
}
