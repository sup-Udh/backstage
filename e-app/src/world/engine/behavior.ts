import type { AgentStatus } from '../../agents/agent.types'
import { characterStateForAgent } from '../../characters/character.states'
import type { SceneDef, Spot } from '../../themes/types'
import type { Bubble, CharacterRuntime, PathNode } from '../world.types'

/**
 * The director decides *where* a character goes for a given agent status,
 * and walks them there. It is the only place that knows the office has
 * desks and a corkboard, which keeps that knowledge out of both the agent
 * runtime above it and the renderer below it.
 */
export class Director {
  /** spot key -> character id holding it. */
  private reserved = new Map<string, string>()
  /**
   * character id -> the desk it has claimed as its own.
   *
   * A character keeps the same desk for the life of the session, so the office
   * has stable geography: when an agent finishes and later picks up new work,
   * it walks back to where it sat before rather than to a new random seat.
   */
  private homes = new Map<string, number>()

  constructor(
    private scene: SceneDef,
    private rng: () => number
  ) {}

  private isFree(key: string, self: string): boolean {
    const holder = this.reserved.get(key)
    return holder === undefined || holder === self
  }

  /** Give up any spot this character holds, so a later arrival can use it. */
  release(c: CharacterRuntime): void {
    if (c.spotKey && this.reserved.get(c.spotKey) === c.def.id) {
      this.reserved.delete(c.spotKey)
    }
    c.spotKey = null
    c.desk = null
  }

  private take(c: CharacterRuntime, key: string, spot: Spot): void {
    this.reserved.set(key, c.def.id)
    c.spotKey = key
    c.destFacing = spot.facing
    c.path = this.route(c, spot.x, spot.y)
  }

  /**
   * Characters cross the office along a clear corridor rather than walking
   * through the furniture. Cheap, and it reads as deliberate routing.
   */
  private route(c: CharacterRuntime, tx: number, ty: number): PathNode[] {
    const lane = this.scene.laneY
    const nodes: PathNode[] = []
    if (Math.abs(c.y - ty) > 12) {
      if (Math.abs(c.y - lane) > 3) nodes.push({ x: c.x, y: lane })
      if (Math.abs(tx - c.x) > 3) nodes.push({ x: tx, y: lane })
    }
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
      .filter((o) => this.isFree(o.key, c.def.id))
    if (free.length === 0) {
      c.path = []
      return
    }
    const choice = this.pick(free)
    this.take(c, choice.key, choice.s)
  }

  /**
   * Called when an agent's status changes. Picks a destination and starts
   * the walk; the visual state stays 'walking' until arrival.
   */
  onStatusChange(
    c: CharacterRuntime,
    status: AgentStatus,
    all: CharacterRuntime[]
  ): void {
    // A celebration happens wherever the character already is.
    if (status === 'success') {
      c.path = []
      return
    }

    this.release(c)

    switch (status) {
      case 'working': {
        // Its own desk first, then its theme-preferred one, then any free one.
        const claimed = this.homes.get(c.def.id)
        const order = [
          ...(claimed !== undefined ? [claimed] : []),
          c.def.homeDesk,
          ...this.scene.desks.map((_, i) => i)
        ].filter((v, i, arr) => arr.indexOf(v) === i)

        for (const i of order) {
          const key = `desk:${i}`
          if (this.isFree(key, c.def.id)) {
            c.desk = i
            this.homes.set(c.def.id, i)
            this.take(c, key, this.scene.desks[i])
            return
          }
        }
        // Every desk taken: read at the board instead of standing about.
        this.sendToBoard(c)
        return
      }

      case 'thinking':
        this.sendToBoard(c)
        return

      case 'talking':
        this.sendToConversation(c, all)
        return

      case 'idle': {
        /*
         * An agent that has finished settles back at its own desk. That is
         * what makes the office read as a workplace with assigned seats rather
         * than a room people drift around in.
         */
        const claimed = this.homes.get(c.def.id)
        if (claimed !== undefined && this.rng() < 0.7) {
          const key = `desk:${claimed}`
          if (this.isFree(key, c.def.id)) {
            c.desk = claimed
            this.take(c, key, this.scene.desks[claimed])
            return
          }
        }

        // Otherwise the coffee machine, or somewhere to loiter.
        if (this.rng() < 0.35) {
          const free = this.scene.coffeeSpots
            .map((s, i) => ({ s, key: `coffee:${i}` }))
            .filter((o) => this.isFree(o.key, c.def.id))
          if (free.length > 0) {
            const choice = this.pick(free)
            this.take(c, choice.key, choice.s)
            return
          }
        }
        this.sendToWander(c)
        return
      }

      default:
        this.sendToWander(c)
        return
    }
  }

  private sendToBoard(c: CharacterRuntime): void {
    const free = this.scene.boardSpots
      .map((s, i) => ({ s, key: `board:${i}` }))
      .filter((o) => this.isFree(o.key, c.def.id))
    if (free.length === 0) {
      this.sendToWander(c)
      return
    }
    const choice = this.pick(free)
    this.take(c, choice.key, choice.s)
  }

  /**
   * Conversations are pairs. If a partner has already claimed one end of a
   * pair, take the other end so the two end up face to face; otherwise open
   * a new pair and wait to be joined.
   */
  private sendToConversation(c: CharacterRuntime, all: CharacterRuntime[]): void {
    for (let i = 0; i < this.scene.talkSpots.length; i++) {
      const keyA = `talk:${i}:a`
      const keyB = `talk:${i}:b`
      const holderA = this.reserved.get(keyA)
      const holderB = this.reserved.get(keyB)

      // Join a partner who is already standing at end A.
      if (holderA && !holderB && all.some((o) => o.def.id === holderA)) {
        this.take(c, keyB, this.scene.talkSpots[i][1])
        return
      }
      if (holderB && !holderA && all.some((o) => o.def.id === holderB)) {
        this.take(c, keyA, this.scene.talkSpots[i][0])
        return
      }
    }
    // No conversation in progress: open one.
    for (let i = 0; i < this.scene.talkSpots.length; i++) {
      const keyA = `talk:${i}:a`
      if (this.isFree(keyA, c.def.id) && !this.reserved.has(`talk:${i}:b`)) {
        this.take(c, keyA, this.scene.talkSpots[i][0])
        return
      }
    }
    this.sendToWander(c)
  }

  /** Advance one character. Returns nothing; mutates in place by design. */
  update(c: CharacterRuntime, status: AgentStatus, dt: number): void {
    if (c.path.length > 0) {
      c.state = 'walking'
      c.bubble = 'none'
      c.settled = 0

      const node = c.path[0]
      const dx = node.x - c.x
      const dy = node.y - c.y
      const dist = Math.hypot(dx, dy)
      const step = c.speed * dt

      if (dist <= step || dist < 0.001) {
        c.x = node.x
        c.y = node.y
        c.path.shift()
      } else {
        c.x += (dx / dist) * step
        c.y += (dy / dist) * step
        // Face the dominant axis of travel.
        c.facing =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? 'right'
              : 'left'
            : dy > 0
              ? 'down'
              : 'up'
      }
      return
    }

    // Arrived: adopt the visual state implied by the agent status.
    c.state = characterStateForAgent(status)
    c.facing = c.destFacing
    c.settled += dt
    c.bubble = bubbleFor(status)
  }
}

/**
 * The status label above each head already names the activity, so thought and
 * speech bubbles would just repeat it. Only the success burst remains: that is
 * a moment worth punctuating rather than a state worth labelling.
 */
function bubbleFor(status: AgentStatus): Bubble {
  return status === 'success' ? 'spark' : 'none'
}
