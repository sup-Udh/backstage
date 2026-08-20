import type { Theme, ThemePalette } from '../../themes/types'
import type { CharacterDef } from '../../characters/character.types'
import type { CharacterRuntime } from '../world.types'
import {
  bakeOps,
  buildWorldSheet,
  worldFrameRect,
  WORLD_SPRITE_H,
  WORLD_SPRITE_W,
  type BakedProp,
  type CharacterSheet
} from './spriteCache'

/** The four neighbours a 1px outline is stamped into. */
const AROUND = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
] as const

interface Drawable {
  /** Depth key. Fractions are used to pin an overlay to its prop. */
  baseY: number
  draw: () => void
}

/** Where the viewport is looking, in scene coordinates. */
export interface Camera {
  x: number
  y: number
  /** Whole-number zoom only. */
  scale: number
}

interface Mote {
  x: number
  y: number
  span: number
  speed: number
  phase: number
  drift: number
}

/**
 * A collaboration link between two characters in the room.
 *
 * When `directed`, `a` leads `b` and the line is drawn with an arrowhead at
 * `b`'s end. That is not decoration: a connection is what lets one agent hand
 * work to another, and a line with no direction on it leaves the user unable
 * to tell which way the work will actually flow.
 */
export interface WorldLink {
  a: string
  b: string
  /** Briefly true just after the pair exchanged something. */
  active: boolean
  /** True when `a` leads `b`. False for a peer link with no stated direction. */
  directed: boolean
}

/** A connection being dragged out from a character but not yet dropped. */
export interface PendingLink {
  from: string
  /** Cursor position in scene coordinates. */
  x: number
  y: number
  /** The character under the cursor, if it is a legal target. */
  target: string | null
  /** True when the cursor is over something that cannot be connected. */
  blocked: boolean
}

/**
 * Draws the office at its logical resolution and lets the camera scale it by
 * a whole number, so the render loop only ever touches scene pixels and
 * nothing is ever interpolated.
 */
export class WorldRenderer {
  private pal: ThemePalette
  private background: BakedProp | null
  private props: BakedProp[]
  private sheets = new Map<string, CharacterSheet>()
  private motes: Mote[] = []

  /**
   * @param cast The project's characters. Sheets are baked for these and only
   *   these — an unchosen character has no art in this renderer at all, which
   *   is a cheaper world as well as an isolated one.
   */
  constructor(
    private theme: Theme,
    cast: CharacterDef[]
  ) {
    this.pal = theme.palette
    const scene = theme.scene

    this.background = bakeOps(scene.background, this.pal, 0)
    this.props = scene.props
      .map((p) => bakeOps(p.ops, this.pal, p.baseY))
      .filter((p): p is BakedProp => p !== null)

    for (const c of cast) {
      this.sheets.set(c.id, buildWorldSheet(c.appearance, this.pal.brand))
    }

    /*
     * Dust drifting in the window light. The columns come from the scene, so
     * a world's motes hang where that world's windows actually are — the
     * positions used to be hard-coded to the first room ever built, which put
     * dust in the middle of a blank wall in every theme added since.
     */
    const columns = scene.lightColumns ?? [
      [14, 54],
      [scene.width - 44, scene.width - 6]
    ]
    const count = columns.length * 8
    for (let i = 0; i < count; i++) {
      const col = columns[i % columns.length]
      const span = Math.max(1, col[1] - col[0])
      this.motes.push({
        x: col[0] + ((i * 13) % span),
        y: scene.horizon + 6 + ((i * 7) % 44),
        span: 26 + (i % 5) * 4,
        speed: 3 + (i % 4),
        phase: (i * 37) % 100,
        drift: (i % 3) - 1
      })
    }
  }

  /* ------------------------------------------------------------ helpers -- */

  private pixel(ctx: CanvasRenderingContext2D, x: number, y: number, c: string): void {
    ctx.fillStyle = c
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
  }

  /** Blit a baked prop. */
  private blit(ctx: CanvasRenderingContext2D, p: BakedProp): void {
    ctx.drawImage(p.canvas, p.x, p.y)
  }

  /* ---------------------------------------------------------- overlays -- */

  /** Scrolling code and a blinking cursor on an agent's monitor. */
  private drawMonitor(
    ctx: CanvasRenderingContext2D,
    m: { x: number; y: number },
    t: number,
    idx: number
  ): void {
    const off = Math.floor(t / 0.9) + idx * 3
    for (let r = 0; r < 4; r++) {
      const w = 3 + ((r * 5 + off * 3 + idx * 7) % 12)
      const indent = (r + off) % 3
      ctx.fillStyle = (r + off) % 4 === 0 ? this.pal.brand : this.pal.steel
      ctx.fillRect(m.x + 1 + indent, m.y + 2 + r * 2, w, 1)
    }
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = this.pal.brand
      ctx.fillRect(m.x + 1, m.y + 10, 2, 1)
    }
  }

  private drawLed(
    ctx: CanvasRenderingContext2D,
    led: { x: number; y: number },
    t: number,
    idx: number
  ): void {
    const on = (Math.floor(t * 1.7) + idx) % 3 !== 0
    ctx.fillStyle = on ? this.pal.brand : this.pal.brandShadow
    ctx.fillRect(led.x, led.y, 2, 1)
  }

  private drawSteam(
    ctx: CanvasRenderingContext2D,
    vent: { x: number; y: number },
    t: number,
    idx: number
  ): void {
    ctx.save()
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.42 + i / 3 + idx * 0.17) % 1
      const y = vent.y - p * 11
      const x = vent.x + Math.sin(p * 6.28 + i * 2) * 1.6
      ctx.globalAlpha = Math.max(0, 0.55 * (1 - p))
      this.pixel(ctx, x, y, this.pal.white)
      if (p > 0.35) this.pixel(ctx, x + 1, y - 1, this.pal.white)
    }
    ctx.restore()
  }

  private drawClock(ctx: CanvasRenderingContext2D): void {
    const { x: cx, y: cy, r } = this.theme.scene.clock
    const now = new Date()
    const sec = now.getSeconds() + now.getMilliseconds() / 1000
    const min = now.getMinutes() + sec / 60
    const hour = (now.getHours() % 12) + min / 60

    const hand = (angle: number, len: number, colour: string) => {
      for (let i = 1; i <= len; i++) {
        this.pixel(
          ctx,
          cx + Math.sin(angle) * i,
          cy - Math.cos(angle) * i,
          colour
        )
      }
    }
    hand((hour / 12) * Math.PI * 2, r - 4, this.pal.ink)
    hand((min / 60) * Math.PI * 2, r - 2, this.pal.ink)
    hand((sec / 60) * Math.PI * 2, r - 2, this.pal.brandDeep)
    this.pixel(ctx, cx, cy, this.pal.ink)
  }

  /** Thought / speech decoration above the head. */
  private drawBubble(
    ctx: CanvasRenderingContext2D,
    c: CharacterRuntime,
    t: number
  ): void {
    if (c.bubble === 'none' || c.settled < 0.45) return
    const cx = Math.round(c.x)
    const top = Math.round(c.y) - WORLD_SPRITE_H

    if (c.bubble === 'spark') {
      // A short burst of pixel sparkles.
      const life = Math.min(1, c.settled / 1.4)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + t * 2
        // Sized off the character, so the flourish punctuates the moment
        // rather than becoming the largest thing in the room.
        const rad = 3 + life * 2.5
        const sx = cx + Math.cos(a) * rad
        const sy = top + 2 + Math.sin(a) * rad * 0.6
        ctx.fillStyle = i % 2 === 0 ? this.pal.brand : this.pal.brandLite
        ctx.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 3)
        ctx.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1)
      }
      return
    }

    const bw = 10
    const bh = 6
    const bx = cx - (bw >> 1)
    const by = top - bh - 2

    ctx.fillStyle = this.pal.ink
    ctx.fillRect(bx, by, bw, bh)
    ctx.fillStyle = this.pal.cream
    ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2)

    // Tail: a stepped point for speech, two small puffs for thought.
    ctx.fillStyle = this.pal.ink
    if (c.bubble === 'talk') {
      ctx.fillRect(cx - 2, by + bh, 2, 1)
      ctx.fillRect(cx - 1, by + bh + 1, 1, 1)
    } else {
      ctx.fillRect(cx - 2, by + bh + 1, 1, 1)
      ctx.fillRect(cx - 3, by + bh + 2, 1, 1)
    }

    const rate = c.bubble === 'talk' ? 3.2 : 1.5
    const active = Math.floor(t * rate) % 3
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === active ? this.pal.brandDeep : this.pal.steelDark
      ctx.fillRect(bx + 2 + i * 2, by + 2, 2, 2)
    }
  }

  /**
   * A thin line between two connected characters.
   *
   * Deliberately quiet. A room where six agents are linked is a room with
   * several of these in it, and drawn as anything more assertive they would
   * become the subject of the picture — the office is what the panel is for,
   * and the links are annotation on top of it.
   *
   * Dashed, and drawn between the characters' chests rather than their feet,
   * so the line reads as a relationship rather than as something painted on
   * the floor. The dashes crawl only while the pair is actually exchanging
   * something, which is what makes an active hand-off noticeable without any
   * of them being animated all the time.
   */
  private drawLink(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    t: number,
    active: boolean,
    directed: boolean
  ): void {
    const ax = Math.round(from.x)
    const ay = Math.round(from.y - WORLD_SPRITE_H * 0.55)
    const bx = Math.round(to.x)
    const by = Math.round(to.y - WORLD_SPRITE_H * 0.55)

    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    if (len < 1) return

    ctx.save()
    ctx.globalAlpha = active ? 0.95 : 0.4
    ctx.fillStyle = active ? this.pal.brand : this.pal.brandDeep

    // Stamped pixel by pixel rather than stroked: a 1px diagonal line drawn
    // with lineTo lands on half pixels and is the one blurred thing in the
    // scene. Walking the line and filling whole pixels cannot do that.
    const steps = Math.ceil(len)
    const crawl = active ? t * 14 : 0
    for (let i = 0; i <= steps; i++) {
      // 3 on, 3 off — long enough to read as a dash at any zoom.
      if ((Math.floor(i - crawl) % 6 + 6) % 6 > 2) continue
      const p = i / steps
      ctx.fillRect(Math.round(ax + dx * p), Math.round(ay + dy * p), 1, 1)
    }

    const mx = Math.round(ax + dx / 2)
    const my = Math.round(ay + dy / 2)
    ctx.globalAlpha = active ? 1 : 0.65

    if (directed) {
      /*
       * An arrowhead at the midpoint rather than at the worker's end.
       *
       * The ends of the line are behind the two characters' heads, where a
       * mark is easily read as part of a sprite; the middle is clear floor and
       * is also where the eye already goes to find the link. Drawn as two
       * stepped pixel runs, not a stroked triangle, for the same reason the
       * line itself is stamped: nothing in this scene may land on a half pixel.
       */
      const ux = dx / len
      const uy = dy / len
      const tip = { x: mx + Math.round(ux * 3), y: my + Math.round(uy * 3) }
      for (let i = 0; i < 4; i++) {
        // Step back from the tip, widening across the line's normal.
        const bx2 = tip.x - Math.round(ux * i)
        const by2 = tip.y - Math.round(uy * i)
        const spread = Math.round((i / 2) * 1)
        ctx.fillRect(bx2 - Math.round(-uy * spread), by2 - Math.round(ux * spread), 1, 1)
        ctx.fillRect(bx2 + Math.round(-uy * spread), by2 + Math.round(ux * spread), 1, 1)
      }
    } else {
      // A peer link gets a plain cross: findable when the two characters are
      // far apart and the dashes are sparse, but claiming no direction.
      ctx.fillRect(mx - 1, my, 3, 1)
      ctx.fillRect(mx, my - 1, 1, 3)
    }
    ctx.restore()
  }

  /** The line being dragged out of a character, before it is dropped. */
  private drawPending(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    pending: PendingLink,
    t: number
  ): void {
    const ax = Math.round(from.x)
    const ay = Math.round(from.y - WORLD_SPRITE_H * 0.55)
    const bx = Math.round(pending.x)
    const by = Math.round(pending.y)

    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    if (len < 1) return

    ctx.save()
    ctx.globalAlpha = 0.9
    // Red while over an illegal target, so the refusal is visible before the
    // drop rather than as an error message after it.
    ctx.fillStyle = pending.blocked ? this.pal.rust : this.pal.brand

    const steps = Math.ceil(len)
    const crawl = t * 20
    for (let i = 0; i <= steps; i++) {
      if ((Math.floor(i - crawl) % 6 + 6) % 6 > 2) continue
      const p = i / steps
      ctx.fillRect(Math.round(ax + dx * p), Math.round(ay + dy * p), 1, 1)
    }
    ctx.restore()
  }

  private drawMotes(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.fillStyle = this.pal.white
    for (const m of this.motes) {
      const p = ((t * m.speed + m.phase) % m.span) / m.span
      const y = m.y + m.span * 0.5 - p * m.span
      const x = m.x + Math.sin(p * 6.28) * (1 + m.drift)
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
    }
    ctx.restore()
  }

  /* --------------------------------------------------------- characters -- */

  private drawCharacter(
    ctx: CanvasRenderingContext2D,
    c: CharacterRuntime,
    hovered: boolean,
    selected = false
  ): void {
    const art = this.sheets.get(c.def.id)
    if (!art) return

    const { sx, sy } = worldFrameRect(c.state, c.facing, c.frame)
    const dx = Math.round(c.x) - (WORLD_SPRITE_W >> 1)
    const dy = Math.round(c.y) - WORLD_SPRITE_H
    const feet = Math.round(c.y)
    const W = WORLD_SPRITE_W

    // Contact shadow, so nobody floats. Sized off the sprite rather than
    // hard-coded, so it stays under the feet at any character scale.
    ctx.save()
    ctx.globalAlpha = 0.18
    ctx.fillStyle = this.pal.ink
    ctx.fillRect(dx + 2, feet - 1, W - 4, 1)
    ctx.fillRect(dx + 3, feet, W - 6, 1)
    ctx.restore()

    if (selected) {
      // A ring on the floor, so a selected agent stays findable in a crowd
      // even while another character is standing in front of them. Selection
      // is marked around the character, never by growing them.
      ctx.fillStyle = this.pal.brand
      ctx.fillRect(dx + 1, feet - 1, W - 2, 1)
      ctx.fillRect(dx + 2, feet + 1, W - 4, 1)
      ctx.fillRect(dx - 1, feet, 2, 1)
      ctx.fillRect(dx + W - 1, feet, 2, 1)
    }

    if (hovered) {
      // 1px brand outline, drawn by stamping the silhouette around the sprite.
      for (const [ox, oy] of AROUND) {
        ctx.drawImage(
          art.silhouette,
          sx,
          sy,
          WORLD_SPRITE_W,
          WORLD_SPRITE_H,
          dx + ox,
          dy + oy,
          WORLD_SPRITE_W,
          WORLD_SPRITE_H
        )
      }
    }

    // 1:1 blit from a sheet already baked at world scale, so the loop never
    // resamples and the sprite can never land between device pixels.
    ctx.drawImage(
      art.sheet,
      sx,
      sy,
      WORLD_SPRITE_W,
      WORLD_SPRITE_H,
      dx,
      dy,
      WORLD_SPRITE_W,
      WORLD_SPRITE_H
    )
  }

  /* -------------------------------------------------------------- frame -- */

  draw(
    ctx: CanvasRenderingContext2D,
    chars: CharacterRuntime[],
    t: number,
    hoveredId: string | null,
    selectedId: string | null,
    cam: Camera,
    viewW: number,
    viewH: number,
    links: WorldLink[] = [],
    pending: PendingLink | null = null,
    /** Characters a pending link could legally be dropped on. */
    droppable: Set<string> = new Set()
  ): void {
    const scene = this.theme.scene

    /*
     * The canvas is the size of the viewport now, not of the room, so the
     * camera is a transform rather than a CSS scale. Both the scale and the
     * translation are whole numbers, which is what keeps a scene pixel an
     * exact block of screen pixels however far the user has panned.
     */
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = this.pal.ink
    ctx.fillRect(0, 0, viewW, viewH)
    ctx.setTransform(
      cam.scale,
      0,
      0,
      cam.scale,
      -Math.round(cam.x * cam.scale),
      -Math.round(cam.y * cam.scale)
    )

    if (this.background) this.blit(ctx, this.background)

    const items: Drawable[] = []

    for (const p of this.props) {
      items.push({ baseY: p.baseY, draw: () => this.blit(ctx, p) })
    }

    // Overlays are pinned just behind their prop so a character walking in
    // front of a desk still occludes that desk's monitor.
    scene.monitors.forEach((m, i) => {
      items.push({ baseY: scene.deskBaseY + 0.1, draw: () => this.drawMonitor(ctx, m, t, i) })
    })
    scene.leds.forEach((l, i) => {
      items.push({ baseY: scene.deskBaseY + 0.2, draw: () => this.drawLed(ctx, l, t, i) })
    })
    scene.steamVents.forEach((v, i) => {
      items.push({ baseY: v.baseY + 0.3, draw: () => this.drawSteam(ctx, v, t, i) })
    })
    items.push({ baseY: 0.5, draw: () => this.drawClock(ctx) })

    for (const c of chars) {
      /*
       * Both ids are agent ids. `def.id` is the *character* being worn, which
       * is re-cast whenever the theme changes — matching on it meant the
       * outline and the floor ring only appeared in worlds where a character
       * happened to be named after an agent, while the name plate beside them
       * highlighted correctly. Selection has to look the same in every world.
       */
      const focused = selectedId === c.agentId
      const hovered = hoveredId === c.agentId || focused
      items.push({
        baseY: c.y,
        draw: () => {
          this.drawCharacter(ctx, c, hovered, focused)
          this.drawBubble(ctx, c, t)
        }
      })
    }

    items.sort((a, b) => a.baseY - b.baseY)
    for (const item of items) item.draw()

    /*
     * Links are drawn after the room rather than sorted into it.
     *
     * A relationship is not a physical object in the office — it has no place
     * in the depth order, and sorting it by either end's y would make the
     * same connection pass in front of a desk at one moment and behind it the
     * next as the pair walked around. Painting them on top keeps a link
     * readable and keeps the furniture sorting honest.
     */
    const at = new Map(chars.map((c) => [c.agentId, c]))
    for (const link of links) {
      const a = at.get(link.a)
      const b = at.get(link.b)
      if (a && b) this.drawLink(ctx, a, b, t, link.active, link.directed)
    }

    if (pending) {
      // Mark what this could be dropped on, so the gesture has a target
      // rather than being a guess.
      for (const id of droppable) {
        const c = at.get(id)
        if (!c || id === pending.from) continue
        ctx.save()
        ctx.globalAlpha = id === pending.target ? 1 : 0.5
        ctx.fillStyle = this.pal.brand
        const cx = Math.round(c.x)
        const feet = Math.round(c.y)
        const w = WORLD_SPRITE_W + 4
        ctx.fillRect(cx - (w >> 1), feet + 2, w, 1)
        ctx.fillRect(cx - (w >> 1), feet, 1, 2)
        ctx.fillRect(cx + (w >> 1) - 1, feet, 1, 2)
        ctx.restore()
      }

      const from = at.get(pending.from)
      if (from) this.drawPending(ctx, from, pending, t)
    }

    /*
     * Names and statuses are deliberately absent here. They are drawn as DOM
     * over this canvas by WorldLabelLayer: text painted into the scene buffer
     * is rasterised at scene resolution and then upscaled with the room, which
     * is exactly what made it unreadable. The engine publishes anchors; the
     * overlay does the typography.
     */

    this.drawMotes(ctx, t)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
}
