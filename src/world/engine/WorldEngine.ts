import type { AgentRuntime } from '../../agents/agent.types'
import { ANIMATIONS, characterStateForAgent } from '../../characters/character.states'
import type { SceneDef, Theme } from '../../themes/types'
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

  /**
   * The room as currently laid out.
   *
   * Held here rather than read from the theme, because it is rebuilt whenever
   * the viewport changes shape — the theme describes how to build a room of a
   * given size, and this is the one that is on screen.
   */
  private scene: SceneDef

  /** Viewport size in CSS pixels, kept in step with the canvas. */
  private viewW = 0
  private viewH = 0
  /**
   * The view transform.
   *
   * Only `scale` varies now. There is no panning and no zooming: the room is
   * built to fit the panel, so the origin is always the room's origin. It
   * remains a Camera so the renderer keeps one transform path rather than
   * gaining a second, cameraless one.
   */
  private cam: Camera = { x: 0, y: 0, scale: DEFAULT_ZOOM }
  /** Characters already in the world, so reserves are spawned only once. */
  private placed = new Set<string>()
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
    /*
     * The room starts at the theme's default size and is re-laid the moment
     * the panel reports its real dimensions. Starting from something valid
     * rather than from nothing means every field below can be initialised
     * against a real grid, and a frame painted before the first measurement
     * shows a room rather than an empty canvas.
     */
    this.scene = theme.scene
    this.renderer = new WorldRenderer(theme, cast, this.scene)
    this.director = new Director(this.scene, rng)

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
        x: this.scene.desks[a.slot % this.scene.desks.length].x,
        y: this.scene.desks[a.slot % this.scene.desks.length].y,
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
        c.x = this.scene.width - 26
        c.y = this.scene.laneY + 14
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
        y: this.scene.laneY,
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

  /* ---------------------------------------------------------- room fitting -- */

  /**
   * How many screen pixels one scene pixel occupies.
   *
   * Whole numbers only — a fractional scale puts sprite edges between device
   * pixels, which is the one thing this whole rendering approach exists to
   * avoid. Chosen from the viewport's width so the room lands at a logical
   * size the art was drawn for: around 600 scene pixels across, which is what
   * every theme's furniture was proportioned against.
   */
  private scaleFor(w: number): number {
    if (w === 0) return DEFAULT_ZOOM
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(w / TARGET_ROOM_W)))
  }

  /**
   * The room's logical size for this viewport.
   *
   * Quantised, so nudging a window edge by a pixel does not rebuild the world.
   * The step is in scene pixels and deliberately coarse: a room two pixels
   * wider is not a different room, and rebaking every prop to find that out
   * would make dragging a window edge expensive for no visible gain.
   */
  private roomFor(w: number, h: number): { width: number; height: number } {
    const scale = this.scaleFor(w)
    const quantise = (n: number) => Math.round(n / scale / ROOM_STEP) * ROOM_STEP
    return { width: quantise(w), height: quantise(h) }
  }

  /**
   * Fit the room to the viewport.
   *
   * There is no camera any more. The room *is* the size of the panel, so a
   * wider window gets a wider office — more wall panels, more desks, wider
   * zones — rather than the same office viewed from further away. Nothing is
   * cropped and nothing has to be panned to.
   *
   * Rebuilding is not cheap: it re-composes the scene and re-bakes every prop.
   * It only happens when the logical size actually changes, which the
   * quantisation above makes rare — typically once on mount, and again if the
   * user resizes the window or collapses the command panel.
   */
  setViewport(w: number, h: number): void {
    this.viewW = w
    this.viewH = h

    const scale = this.scaleFor(w)
    const room = this.roomFor(w, h)

    const changed =
      scale !== this.cam.scale ||
      room.width !== this.scene.width ||
      room.height !== this.scene.height

    this.cam.scale = scale
    if (changed) this.rebuildScene(room.width, room.height)
  }

  /**
   * Re-lay the room at a new size.
   *
   * Characters are carried across proportionally rather than left where they
   * were: their coordinates are in scene pixels, so a room that has changed
   * shape would otherwise leave somebody standing inside a filing cabinet, or
   * outside the room altogether. Their reserved spots are released first,
   * because the desks they were holding no longer exist — the director hands
   * out new ones from the new grid on the next status change.
   */
  private rebuildScene(width: number, height: number): void {
    const previous = this.scene
    const scene = this.theme.buildScene(width, height)
    this.scene = scene

    this.renderer = new WorldRenderer(this.theme, this.cast, scene)
    this.director = new Director(scene, this.rng)

    const sx = scene.width / previous.width
    const sy = scene.height / previous.height

    for (const c of this.chars) {
      this.director.release(c)
      c.x = Math.round(c.x * sx)
      c.y = Math.round(c.y * sy)
      c.path = []
      c.desk = null
      c.spotKey = null
      // Force the director to re-place them against the new grid on the next
      // tick, rather than leaving them standing wherever the scaling put them.
      c.lastStatus = null
    }
  }

  getCamera(): Camera {
    return { ...this.cam }
  }

  /** The room as currently laid out. */
  getScene(): SceneDef {
    return this.scene
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
    const scale = this.cam.scale

    /*
     * A plain scale, with no camera offset: the room's origin is the canvas's
     * origin now, so projecting is one multiply. Precision is kept until the
     * final rounding so a label sits on the same pixel column as the sprite it
     * belongs to rather than a fraction off it.
     */
    return this.chars.map((c) => {
      const head = c.y - WORLD_SPRITE_H - LABEL_GAP
      const feet = c.y + LABEL_GAP

      const screenX = Math.round(c.x * scale)
      const screenFeet = Math.round(feet * scale)
      const screenHead = Math.round(head * scale)

      const onScreen =
        screenX > -MARGIN &&
        screenX < this.viewW + MARGIN &&
        screenFeet > -MARGIN &&
        screenHead < this.viewH + MARGIN

      return {
        agentId: c.agentId,
        x: screenX,
        feet: screenFeet,
        head: screenHead,
        onScreen
      }
    })
  }

  /**
   * CSS pixel position within the viewport -> scene coordinates.
   *
   * A division, because there is nowhere else the view could be looking.
   */
  toScene(cssX: number, cssY: number): { x: number; y: number } {
    return { x: cssX / this.cam.scale, y: cssY / this.cam.scale }
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
      this.cam.scale,
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

/** Clearance between a label and the sprite it belongs to, in scene pixels. */
const LABEL_GAP = 2

/**
 * The scale used before the panel has reported its size.
 *
 * Whole-number, like every scale in this engine: a fractional one puts sprite
 * edges between device pixels, which is the one thing the whole rendering
 * approach exists to avoid.
 */
const DEFAULT_ZOOM = 2
const MIN_ZOOM = 2
const MAX_ZOOM = 4

/**
 * The logical width the room aims for, in scene pixels.
 *
 * Every theme's furniture was proportioned against a room about this wide, so
 * the scale is chosen to land near it: the office reads the same on a laptop
 * and on a large display, and what changes is how much office there is rather
 * than how big everything in it looks.
 */
const TARGET_ROOM_W = 600

/**
 * How coarsely the room's logical size is rounded, in scene pixels.
 *
 * Rebuilding re-composes the scene and re-bakes every prop, so it must not
 * happen on every pixel of a window drag. A room sixteen pixels wider is not a
 * different room.
 */
const ROOM_STEP = 16

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
