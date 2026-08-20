import type { AgentRuntime } from '../../agents/agent.types'
import { ANIMATIONS, characterStateForAgent } from '../../characters/character.states'
import type { Theme } from '../../themes/types'
import { makeRng } from '../pixel/ops'
import { WORLD_SPRITE_H, WORLD_SPRITE_W } from './spriteCache'
import type { AgentView, CharacterRuntime } from '../world.types'
import { Director } from './behavior'
import type { CharacterDef } from '../../characters/character.types'
import { WorldRenderer, type Camera } from './renderer'

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
  private selected: string | null = null
  private rng: () => number = Math.random

  /** Viewport size in CSS pixels, kept in step with the canvas. */
  private viewW = 0
  private viewH = 0
  private cam: Camera = { x: 0, y: 0, scale: 3 }
  /** Characters already in the world, so reserves are spawned only once. */
  private placed = new Set<string>()
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

    this.rng = rng
    // A character exists only while its agent is present in the world.
    this.chars = runtime
      .getAgents()
      .filter((a) => a.visible)
      .map((a): CharacterRuntime => ({
        agentId: a.id,
        ownName: a.useOwnName ? a.name : undefined,
        def: castFor(theme, a.slot),
        model: a.model,
        x: theme.scene.desks[a.slot % theme.scene.desks.length].x,
        y: theme.scene.desks[a.slot % theme.scene.desks.length].y,
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
        // A little variance so the cast never moves in lockstep.
        speed: 19 + rng() * 5
      }))
    for (const c of this.chars) this.placed.add(c.agentId)

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
      const agent = this.runtime.get(c.agentId)
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


  /* ------------------------------------------------------------- arrivals -- */

  /**
   * Take away the body of anyone who has left.
   *
   * Despawning and deleting both land here. A character whose agent is gone
   * cannot be selected, configured or stopped, so leaving it standing at a
   * desk would be the office claiming somebody is at work who is not even on
   * the team any more.
   */
  private removeDepartures(): void {
    const present = new Set(
      this.runtime
        .getAgents()
        .filter((a) => a.visible)
        .map((a) => a.id)
    )

    let removed = false
    for (let i = this.chars.length - 1; i >= 0; i--) {
      const c = this.chars[i]
      if (present.has(c.agentId)) continue

      // Give the desk and any reserved spot back, or the next arrival will
      // find the room full of furniture nobody is using.
      this.director.release(c)
      this.chars.splice(i, 1)
      this.placed.delete(c.agentId)
      if (this.selected === c.agentId) this.selected = null
      if (this.hovered === c.agentId) this.hovered = null
      removed = true
    }

    if (removed) this.rebuildViews()
  }

  /**
   * Give any newly spawned agent a character and walk them in from the door.
   * Spawning is the user hiring somebody, so this is how the room visibly
   * fills up over a session.
   */
  private spawnArrivals(): void {
    for (const agent of this.runtime.getAgents()) {
      if (!agent.visible || this.placed.has(agent.id)) continue

      const c: CharacterRuntime = {
        agentId: agent.id,
        ownName: agent.useOwnName ? agent.name : undefined,
        def: castFor(this.theme, agent.slot),
        model: agent.model,
        // Just off the left edge, so the walk in is visible.
        x: -10,
        y: this.theme.scene.laneY,
        facing: 'right',
        state: 'walking',
        path: [],
        destFacing: 'down',
        desk: null,
        spotKey: null,
        animTime: 0,
        frame: 0,
        lastStatus: null,
        bubble: 'none',
        settled: 0,
        speed: 19 + this.rng() * 5
      }
      this.chars.push(c)
      this.placed.add(agent.id)
      this.director.onStatusChange(c, agent.status, this.chars)
      c.lastStatus = agent.status
      this.rebuildViews()
    }
  }

  /* --------------------------------------------------------------- camera -- */

  /** Largest whole-number zoom at which the whole room fits the viewport. */
  private fitScale(): number {
    const scene = this.theme.scene
    if (this.viewW === 0 || this.viewH === 0) return 3
    return Math.max(
      1,
      Math.min(
        8,
        Math.floor(this.viewW / scene.width),
        Math.floor(this.viewH / scene.height)
      )
    )
  }

  /**
   * Keep the room in view. When it is smaller than the viewport it is centred;
   * when it is larger, panning is clamped to its edges so the user can never
   * lose the office off the side of the screen.
   */
  private clampCamera(): void {
    const scene = this.theme.scene
    const visW = this.viewW / this.cam.scale
    const visH = this.viewH / this.cam.scale

    this.cam.x =
      visW >= scene.width
        ? (scene.width - visW) / 2
        : Math.min(Math.max(this.cam.x, 0), scene.width - visW)
    this.cam.y =
      visH >= scene.height
        ? (scene.height - visH) / 2
        : Math.min(Math.max(this.cam.y, 0), scene.height - visH)
  }

  setViewport(w: number, h: number): void {
    this.viewW = w
    this.viewH = h
    /*
     * Grow into new space, but never shrink someone's zoom. Being below the
     * fit scale means the viewport is showing more than the room, which is
     * only ever wasted area — so collapsing the command panel enlarges the
     * office, while a user who has zoomed in keeps exactly where they were.
     */
    if (this.cam.scale < this.fitScale()) this.cam.scale = this.fitScale()
    this.clampCamera()
  }

  getCamera(): Camera {
    return { ...this.cam }
  }

  /** The canvas size the camera is drawing into, in CSS pixels. */
  getViewport(): { width: number; height: number } {
    return { width: this.viewW, height: this.viewH }
  }

  /**
   * Where each character's labels should sit, in CSS pixels within the canvas.
   *
   * Labels are DOM rather than paint — text rasterised into the scene buffer
   * is unreadable once the room is scaled to fit a window — so the overlay
   * needs the one thing only the engine knows: where everybody currently is on
   * screen. Read every frame while characters walk, so it is deliberately a
   * plain projection with no allocation beyond the array itself.
   */
  getLabelAnchors(): LabelAnchor[] {
    const { x: camX, y: camY, scale } = this.cam
    return this.chars.map((c) => {
      const x = Math.round((c.x - camX) * scale)
      const head = Math.round((c.y - WORLD_SPRITE_H - camY) * scale)
      const feet = Math.round((c.y - camY) * scale)
      return {
        agentId: c.agentId,
        x,
        head,
        feet,
        // A margin either side, so a label does not pop as its character
        // walks past the edge of the viewport.
        onScreen:
          x > -MARGIN &&
          x < this.viewW + MARGIN &&
          feet > -MARGIN &&
          head < this.viewH + MARGIN
      }
    })
  }

  /** The zoom at which the whole room is visible, for the UI to compare. */
  getFitScale(): number {
    return this.fitScale()
  }

  /** Reset to the whole room, centred. */
  fit(): void {
    this.cam.scale = this.fitScale()
    this.clampCamera()
  }

  /** Drag the view. Deltas are in CSS pixels. */
  panBy(dxCss: number, dyCss: number): void {
    this.cam.x -= dxCss / this.cam.scale
    this.cam.y -= dyCss / this.cam.scale
    this.clampCamera()
  }

  /**
   * Step the zoom, keeping the scene point under the cursor pinned. Zoom is
   * whole-number, so the pixel grid survives every step.
   */
  zoomBy(step: number, anchorCssX?: number, anchorCssY?: number): void {
    const next = Math.min(8, Math.max(this.fitScale(), this.cam.scale + step))
    if (next === this.cam.scale) return

    const ax = anchorCssX ?? this.viewW / 2
    const ay = anchorCssY ?? this.viewH / 2
    const sceneX = this.cam.x + ax / this.cam.scale
    const sceneY = this.cam.y + ay / this.cam.scale

    this.cam.scale = next
    this.cam.x = sceneX - ax / next
    this.cam.y = sceneY - ay / next
    this.clampCamera()
  }

  /** Centre the view on a character. */
  focusOn(characterId: string): void {
    const c = this.chars.find((ch) => ch.def.id === characterId)
    if (!c) return
    this.cam.x = c.x - this.viewW / this.cam.scale / 2
    this.cam.y = c.y - this.viewH / this.cam.scale / 2
    this.clampCamera()
  }

  /** CSS pixel position within the viewport -> scene coordinates. */
  toScene(cssX: number, cssY: number): { x: number; y: number } {
    return {
      x: this.cam.x + cssX / this.cam.scale,
      y: this.cam.y + cssY / this.cam.scale
    }
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
    this.paint()
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
    this.removeDepartures()
    this.spawnArrivals()

    for (const c of this.chars) {
      const agent = this.runtime.get(c.agentId)
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

    this.paint()
    this.raf = requestAnimationFrame(this.tick)
  }

  private paint(): void {
    if (!this.ctx) return
    this.renderer.draw(
      this.ctx,
      this.chars,
      this.clock,
      this.hovered,
      this.selected,
      this.cam,
      this.viewW,
      this.viewH
    )
  }

  /* ---------------------------------------------------------- react edge -- */

  private rebuildViews(): void {
    this.views = this.chars.map((c) => {
      const agent = this.runtime.get(c.agentId)
      return {
        characterId: c.agentId,
        /*
         * The world shows the character's name, because switching theme
         * re-casts the team rather than replacing it. External CLI sessions
         * opt out: Claude is Claude in every world.
         */
        name: agent?.useOwnName ? agent.name : c.def.name,
        role: agent?.role ?? c.def.role,
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

  setSelected(id: string | null): void {
    this.selected = id
  }

  getSelected(): string | null {
    return this.selected
  }

  /**
   * Which character is currently playing an agent.
   *
   * The cast is chosen by slot and re-cast whenever the theme changes, so the
   * body on screen is the only authority on who portrays whom — resolving it
   * from a character id or an agent id anywhere else would drift the moment
   * the user switches worlds.
   */
  characterFor(agentId: string | null): CharacterDef | null {
    if (!agentId) return null
    return this.chars.find((c) => c.agentId === agentId)?.def ?? null
  }

  /**
   * Hit-test in scene pixels. Front-most character wins, so an overlapping
   * pair resolves the way the user expects.
   *
   * The target is deliberately larger than the sprite. Characters stand at
   * world scale — small, and smaller still when the camera is zoomed out — and
   * a target that shrank with them would make clicking an agent a test of aim.
   * The padding keeps the reachable area at roughly the size it was before the
   * cast was scaled down, which is comfortable at every zoom.
   */
  hitTest(sx: number, sy: number): { id: string; x: number; y: number } | null {
    const ordered = [...this.chars].sort((a, b) => b.y - a.y)
    for (const c of ordered) {
      const left = Math.round(c.x) - (HIT_W >> 1)
      const top = Math.round(c.y) - WORLD_SPRITE_H - HIT_PAD
      if (sx >= left && sx < left + HIT_W && sy >= top && sy < top + HIT_H) {
        // The tooltip and the card anchor to the sprite, not to the padding.
        return { id: c.agentId, x: c.x, y: Math.round(c.y) - WORLD_SPRITE_H }
      }
    }
    return null
  }
}

/** Where a character's labels attach, in CSS pixels within the canvas. */
export interface LabelAnchor {
  agentId: string
  /** Horizontal centre of the sprite. */
  x: number
  /** Top of the sprite; a name sits above this. */
  head: number
  /** Bottom of the sprite; a status sits below this. */
  feet: number
  onScreen: boolean
}

/**
 * How far outside the viewport a character keeps its labels, in CSS pixels.
 *
 * Small on purpose. The overlay pulls labels back inside the frame so one at
 * the very edge stays readable, and a generous margin here would combine with
 * that to pin labels to the edge for characters who have walked out of view
 * entirely — a name with nobody under it.
 */
const MARGIN = 16

/**
 * Slack around the sprite that still counts as clicking the character, in
 * scene pixels. Applied on every side, and below the feet as well, so the
 * shadow and the floor ring are part of the target rather than a dead zone.
 */
const HIT_PAD = 3
const HIT_W = WORLD_SPRITE_W + HIT_PAD * 2
const HIT_H = WORLD_SPRITE_H + HIT_PAD * 2

/** Which of a theme's characters portrays the agent in this slot. */
function castFor(theme: Theme, slot: number): CharacterDef {
  const cast = theme.characters
  return cast[((slot % cast.length) + cast.length) % cast.length]
}
