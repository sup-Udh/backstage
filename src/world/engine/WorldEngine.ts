import type { AgentRuntime } from '../../agents/agent.types'
import { ANIMATIONS, characterStateForAgent } from '../../characters/character.states'
import type { Theme } from '../../themes/types'
import { makeRng } from '../pixel/ops'
import { WORLD_SPRITE_H, WORLD_SPRITE_W } from './spriteCache'
import type { AgentView, CharacterRuntime } from '../world.types'
import { Director } from './behavior'
import type { CharacterDef } from '../../characters/character.types'
import { castForSlot } from '../../project/cast'
import {
  WorldRenderer,
  type Camera,
  type PendingLink,
  type WorldLink
} from './renderer'

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
  private cam: Camera = { x: 0, y: 0, scale: DEFAULT_ZOOM }
  /** Characters already in the world, so reserves are spawned only once. */
  private placed = new Set<string>()
  /** Whether the opening camera has been aimed yet. */
  private framed = false
  /** Collaboration links, mirrored from the roster. */
  private links: WorldLink[] = []
  /** A link being dragged out of a character. */
  private pending: PendingLink | null = null
  /** Who a pending link could legally be dropped on. */
  private droppable = new Set<string>()
  private views: AgentView[] = []
  private viewListeners = new Set<(v: AgentView[]) => void>()
  private frameListeners = new Set<(anchors: LabelAnchor[]) => void>()
  private unsubscribe: (() => void) | null = null

  constructor(
    private theme: Theme,
    /**
     * The project's cast. Only these characters exist in this world — the
     * theme's other people are never cast, never baked and never drawn.
     */
    private cast: CharacterDef[],
    private runtime: AgentRuntime,
    seed = 991
  ) {
    const rng = makeRng(seed)
    this.renderer = new WorldRenderer(theme, cast)
    this.director = new Director(theme.scene, rng)

    this.rng = rng
    // A character exists only while its agent is present in the world.
    this.chars = runtime
      .getAgents()
      .filter((a) => a.visible)
      .map((a): CharacterRuntime => ({
        agentId: a.id,
        ownName: a.useOwnName ? a.name : undefined,
        def: castForSlot(cast, a.slot),
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
    /*
     * How far back in the queue this arrival starts.
     *
     * The roster loads over IPC, so on entering the workspace the whole team
     * becomes visible within a frame or two of each other and every one of
     * them was placed on the same pixel outside the same door. They then
     * walked the lane as a single overlapping clump for several seconds —
     * one visible body with four name tags stacked above it, which reads as
     * the labels being broken rather than the cast being on top of itself.
     *
     * Spacing them out turns that into people filing in, which is both
     * legible and what an office actually looks like at nine o'clock.
     */
    let queued = 0
    for (const c of this.chars) {
      if (c.x < 0) queued++
    }

    for (const agent of this.runtime.getAgents()) {
      if (!agent.visible || this.placed.has(agent.id)) continue

      const c: CharacterRuntime = {
        agentId: agent.id,
        ownName: agent.useOwnName ? agent.name : undefined,
        def: castForSlot(this.cast, agent.slot),
        model: agent.model,
        // Just off the left edge, so the walk in is visible, and behind
        // anyone still on their way in.
        x: -10 - queued++ * ENTRY_SPACING,
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
    if (this.viewW === 0 || this.viewH === 0) return DEFAULT_ZOOM
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
   * The zoom the room opens at.
   *
   * Deliberately not the fit scale. The office is larger than a typical panel
   * can show at a legible zoom, and opening at "everything visible" would
   * mean opening at 1x — the whole floor plan on screen, every character ten
   * pixels tall, and nothing readable. Opening one step in shows most of the
   * room with the desks and the people at them clearly resolved, and the fit
   * control is one click away for anyone who wants the overview.
   *
   * On a display large enough to fit the room at a higher zoom, that wins:
   * there is no reason to leave space unused.
   */
  private openingZoom(): number {
    return Math.max(DEFAULT_ZOOM, this.fitScale())
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
    if (!this.framed) {
      /*
       * The first real viewport is the first chance to aim the camera. The
       * room is larger than the view, so leaving it at the origin would open
       * every world on its top-left corner — a stretch of wall. Centring on
       * the desks puts the work where the user is already looking.
       */
      this.framed = true
      this.cam.scale = this.openingZoom()
      this.centreOnWork()
    }
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
      // 1. Character world position
      // Keep precision here so zoom steps don't accumulate half-pixel drift.
      const worldX = c.x
      const worldY = c.y

      // 2. Tag base positions in WORLD coordinates
      // 16 is WORLD_SPRITE_H. 2 is the small world offset (GAP).
      const worldHead = worldY - 16 - 2
      const worldFeet = worldY + 2

      // 3. Transform world positions to screen using the EXACT same camera transform.
      // Pin rounding to the final CSS pixel result only.
      const screenX = Math.round(worldX * scale - camX * scale)
      const screenFeet = Math.round(worldFeet * scale - camY * scale)
      const screenHead = Math.round(worldHead * scale - camY * scale)

      const onScreen =
        screenX > -20 &&
        screenX < this.viewW + 20 &&
        screenFeet > -20 &&
        screenHead < this.viewH + 20

      return {
        agentId: c.agentId,
        x: screenX,
        feet: screenFeet,
        head: screenHead,
        onScreen
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

  /**
   * Aim the camera at the working half of the room.
   *
   * The desks are the reason anyone opens this panel, so the opening view is
   * framed on them rather than on the room's geometric centre — which in a
   * room with a tall wall band and a break area at the bottom is a patch of
   * empty floor between the two.
   */
  private centreOnWork(): void {
    const scene = this.theme.scene
    const seats = scene.desks
    if (seats.length === 0) {
      this.clampCamera()
      return
    }

    let sx = 0
    for (const seat of seats) sx += seat.x
    this.cam.x = sx / seats.length - this.viewW / this.cam.scale / 2

    /*
     * Vertically, aim between the back wall and the first row of desks rather
     * than at the middle of the seats.
     *
     * Centring on the seats put the average of the two desk rows in the
     * middle of the frame, which on a panel too short to show the whole room
     * pushed the entire back wall off the top — the windows, the boards, the
     * signage and the door, which is most of what says what kind of place
     * this is. Biasing upwards keeps the wall in shot and lets the lower
     * zones fall off the bottom instead, where there is less to lose.
     */
    const front = Math.min(...seats.map((s) => s.y))
    const aim = (scene.horizon + front) / 2
    this.cam.y = aim - this.viewH / this.cam.scale / 2
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

      /*
       * Re-cast if the agent has been moved onto a different character.
       *
       * The body is chosen by slot when it first appears, and a CLI session
       * can be reassigned while it is running. Casting only on arrival meant
       * the change was accepted, stored and reflected everywhere except the
       * one place it was supposed to show.
       */
      const wearing = castForSlot(this.cast, agent.slot)
      if (wearing.id !== c.def.id) {
        c.def = wearing
        this.rebuildViews()
      }

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
    
    // Notify frame listeners synchronously after paint
    const anchors = this.getLabelAnchors()
    for (const fn of this.frameListeners) fn(anchors)
    
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
      this.viewH,
      this.links,
      this.pending,
      this.droppable
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

  subscribeFrame = (fn: (anchors: LabelAnchor[]) => void): (() => void) => {
    this.frameListeners.add(fn)
    return () => this.frameListeners.delete(fn)
  }

  /**
   * Mirror the roster's collaboration links.
   *
   * The engine is told what the relationships are; it never decides them. The
   * roster in the main process is the authority, so a link drawn here is one
   * that was actually accepted and persisted — the world cannot show a
   * connection the runtime would not honour.
   */
  setLinks(links: WorldLink[]): void {
    this.links = links
  }

  /**
   * Hit-test the connection lines, in scene pixels.
   *
   * A link is a one-pixel dashed line, which is far too fine to ask anyone to
   * click, so the target is the whole segment within a generous band either
   * side — the same reasoning as the padding around a character. Distance is
   * measured to the segment rather than to its midpoint, so the whole line is
   * clickable and not just the marker on it.
   *
   * Characters win: `hitTest` is asked first by the caller, because a link
   * that passes behind somebody must not steal the click on them.
   */
  hitTestLink(sx: number, sy: number): { a: string; b: string; x: number; y: number } | null {
    const at = new Map(this.chars.map((c) => [c.agentId, c]))

    for (const link of this.links) {
      const a = at.get(link.a)
      const b = at.get(link.b)
      if (!a || !b) continue

      const ax = a.x
      const ay = a.y - WORLD_SPRITE_H * 0.55
      const bx = b.x
      const by = b.y - WORLD_SPRITE_H * 0.55

      const dx = bx - ax
      const dy = by - ay
      const lenSq = dx * dx + dy * dy
      if (lenSq < 1) continue

      // Position along the segment, clamped so the ends do not extend past it.
      const t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / lenSq))
      const px = ax + dx * t
      const py = ay + dy * t
      if (Math.hypot(sx - px, sy - py) > LINK_HIT_PAD) continue

      return { a: link.a, b: link.b, x: (ax + bx) / 2, y: (ay + by) / 2 }
    }
    return null
  }

  /** Begin, update or end a drag-to-connect gesture. */
  setPendingLink(pending: PendingLink | null, droppable: string[] = []): void {
    this.pending = pending
    this.droppable = new Set(droppable)
  }

  getPendingLink(): PendingLink | null {
    return this.pending
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
const MARGIN = 12

/**
 * The zoom a world opens at.
 *
 * Whole-number, like every other zoom in this engine: a fractional scale puts
 * sprite edges between device pixels, which is the one thing the whole
 * rendering approach exists to avoid.
 */
const DEFAULT_ZOOM = 2

/**
 * Slack around the sprite that still counts as clicking the character, in
 * scene pixels. Applied on every side, and below the feet as well, so the
 * shadow and the floor ring are part of the target rather than a dead zone.
 *
 * Grew when the cast shrank. The target is deliberately decoupled from the
 * sprite: a hit box that scaled with the art would have made clicking an
 * agent progressively harder every time the characters were made smaller,
 * and picking someone out of a crowded office is already the fiddliest thing
 * the panel asks of anyone.
 */
const HIT_PAD = 7
const HIT_W = WORLD_SPRITE_W + HIT_PAD * 2
const HIT_H = WORLD_SPRITE_H + HIT_PAD * 2

/**
 * How far from a connection line still counts as clicking it, in scene
 * pixels. The line itself is one pixel wide, which is not something anyone
 * can be asked to hit.
 */
const LINK_HIT_PAD = 4

/**
 * Gap between characters queueing to walk in, in scene pixels.
 *
 * Wider than a sprite, so the labels above two people arriving together do
 * not overlap either.
 */
const ENTRY_SPACING = 22
