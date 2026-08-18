import type { AgentRuntime } from '../../agents/agent.types'
import { ANIMATIONS, characterStateForAgent } from '../../characters/character.states'
import type { Theme } from '../../themes/types'
import { makeRng } from '../pixel/ops'
import { SPRITE_H, SPRITE_W } from '../pixel/characterSprite'
import type { AgentView, CharacterRuntime } from '../world.types'
import { Director } from './behavior'
import { WorldRenderer } from './renderer'

/**
 * Owns the animation loop.
 *
 * Everything that changes every frame lives in plain mutable objects here,
 * never in React state. React is only told when an agent's *status* changes,
 * which happens a handful of times a minute rather than 60 times a second.
 */
export class WorldEngine {
  private renderer: WorldRenderer
  private director: Director
  private chars: CharacterRuntime[]
  private ctx: CanvasRenderingContext2D | null = null
  private raf = 0
  private last = 0
  private clock = 0
  private hovered: string | null = null
  private views: AgentView[] = []
  private viewListeners = new Set<(v: AgentView[]) => void>()
  private unsubscribe: (() => void) | null = null

  constructor(
    private theme: Theme,
    private runtime: AgentRuntime,
    seed = 991
  ) {
    const rng = makeRng(seed)
    this.renderer = new WorldRenderer(theme)
    this.director = new Director(theme.scene, rng)

    this.chars = theme.characters.map((def): CharacterRuntime => ({
      def,
      model: runtime.get(def.agentId)?.model ?? 'Unknown',
      x: theme.scene.desks[def.homeDesk % theme.scene.desks.length].x,
      y: theme.scene.desks[def.homeDesk % theme.scene.desks.length].y,
      facing: 'down',
      state: 'idle',
      path: [],
      destFacing: 'down',
      desk: null,
      spotKey: null,
      animTime: rng() * 2,
      frame: 0,
      lastStatus: null,
      bubble: 'none',
      settled: 3,
      // A little variance so four characters never move in lockstep.
      speed: 19 + rng() * 5
    }))

    this.placeOpeningCast()
    this.rebuildViews()
    this.unsubscribe = this.runtime.subscribe(() => this.rebuildViews())
  }

  /**
   * Seed positions so the very first painted frame already shows the office
   * at work: nobody walks in from off-screen, and there is no loading state.
   * The third character starts across the room so one visible walk is in
   * progress the moment the page appears.
   */
  private placeOpeningCast(): void {
    const walker = Math.min(2, this.chars.length - 1)

    this.chars.forEach((c, i) => {
      const agent = this.runtime.get(c.def.agentId)
      if (!agent) return

      if (i === walker) {
        // Start far from the destination so the walk is worth watching.
        c.x = this.theme.scene.width - 26
        c.y = this.theme.scene.laneY + 14
      }

      this.director.onStatusChange(c, agent.status, this.chars)
      c.lastStatus = agent.status

      if (i !== walker) {
        // Snap to the destination: already seated, already at the board.
        const dest = c.path[c.path.length - 1]
        if (dest) {
          c.x = dest.x
          c.y = dest.y
        }
        c.path = []
        c.facing = c.destFacing
        c.state = characterStateForAgent(agent.status)
        c.settled = 3
      }
    })
  }

  /* ----------------------------------------------------------- lifecycle -- */

  start(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    this.ctx = ctx
    // StrictMode mounts, unmounts and remounts. stop() drops the runtime
    // subscription, so start() has to be able to re-establish it or the HUD
    // would silently freeze on the second mount.
    if (!this.unsubscribe) {
      this.unsubscribe = this.runtime.subscribe(() => this.rebuildViews())
    }
    if (this.raf) cancelAnimationFrame(this.raf)
    this.last = performance.now()
    // Paint once immediately, so the world is there before the first frame.
    this.renderer.draw(ctx, this.chars, this.clock, this.hovered)
    this.raf = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private tick = (now: number): void => {
    // Clamped so a backgrounded window does not teleport everyone on return.
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.clock += dt

    this.runtime.tick(dt)

    for (const c of this.chars) {
      const agent = this.runtime.get(c.def.agentId)
      if (!agent) continue

      if (agent.status !== c.lastStatus) {
        this.director.onStatusChange(c, agent.status, this.chars)
        c.lastStatus = agent.status
        c.animTime = 0
      }

      this.director.update(c, agent.status, dt)

      const clip = ANIMATIONS[c.state]
      c.animTime += dt
      c.frame = Math.floor(c.animTime * clip.fps) % clip.frames
    }

    if (this.ctx) {
      this.renderer.draw(this.ctx, this.chars, this.clock, this.hovered)
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  /* ---------------------------------------------------------- react edge -- */

  private rebuildViews(): void {
    this.views = this.chars.map((c) => {
      const agent = this.runtime.get(c.def.agentId)
      return {
        characterId: c.def.id,
        name: c.def.name,
        role: c.def.role,
        model: agent?.model ?? 'Unknown',
        status: agent?.status ?? 'idle',
        task: agent?.task ?? null
      }
    })
    for (const fn of this.viewListeners) fn(this.views)
  }

  getViews = (): AgentView[] => this.views

  subscribeViews = (fn: (v: AgentView[]) => void): (() => void) => {
    this.viewListeners.add(fn)
    return () => this.viewListeners.delete(fn)
  }

  setHovered(id: string | null): void {
    this.hovered = id
  }

  /**
   * Hit-test in scene pixels. Front-most character wins, so an overlapping
   * pair resolves the way the user expects.
   */
  hitTest(sx: number, sy: number): { id: string; x: number; y: number } | null {
    const ordered = [...this.chars].sort((a, b) => b.y - a.y)
    for (const c of ordered) {
      const left = Math.round(c.x) - (SPRITE_W >> 1)
      const top = Math.round(c.y) - SPRITE_H
      if (sx >= left && sx < left + SPRITE_W && sy >= top && sy < top + SPRITE_H) {
        return { id: c.def.id, x: c.x, y: top }
      }
    }
    return null
  }
}
