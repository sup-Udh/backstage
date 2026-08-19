import type { Theme, ThemePalette } from '../../themes/types'
import { STATUS_LABEL } from '../../characters/character.states'
import type { AgentStatus } from '../../agents/agent.types'
import { createPixelCanvas, paint } from '../pixel/ops'
import { text, textWidth } from '../pixel/shapes'
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

/**
 * Tag metrics, in scene pixels.
 *
 * Deliberately smaller than the character they label. The tag says what an
 * agent is *doing*; the sprite says *who they are*, and the sprite has to win
 * that contest — a bright plate wider than the person reverses the hierarchy.
 *
 * Both plates are the glyph height plus a one-pixel edge and nothing else. The
 * previous two pixels of interior padding read as generous at UI scale, but at
 * world scale they were a fifth of the character's height spent on whitespace.
 */
const LABEL_H = 7
const LABEL_PAD = 2
const LABEL_GAP = 2

/** Height of the name plate that sits above the status tag. */
const NAME_H = 7

/**
 * The state pip: a small brand square ahead of the status word.
 *
 * This used to be the 7x7 provider mark. At world scale a logo that tall
 * forced the plate two pixels taller than the text needed and cost nine
 * pixels of width on every character, which made the busiest thing on screen
 * the labels rather than the office. Which model is behind an agent is still
 * one hover away, and is spelled out in the inspector.
 */
const PIP_W = 2
const PIP_H = 3

/** The four neighbours a 1px outline is stamped into. */
const AROUND = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
] as const

/** Statuses that read as "this agent is doing something". */
const ACTIVE_STATUSES: AgentStatus[] = ['working', 'thinking', 'talking', 'success']

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
 * Draws the office at logical resolution (320x160). The canvas is then
 * upscaled by CSS with image-rendering: pixelated, so the render loop only
 * ever touches ~51k pixels and nothing is ever interpolated.
 */
export class WorldRenderer {
  private pal: ThemePalette
  private background: BakedProp | null
  private props: BakedProp[]
  private sheets = new Map<string, CharacterSheet>()
  /** Rasterised status tags, keyed by label and state. */
  private tags = new Map<string, HTMLCanvasElement>()
  private motes: Mote[] = []

  constructor(private theme: Theme) {
    this.pal = theme.palette
    const scene = theme.scene

    this.background = bakeOps(scene.background, this.pal, 0)
    this.props = scene.props
      .map((p) => bakeOps(p.ops, this.pal, p.baseY))
      .filter((p): p is BakedProp => p !== null)

    for (const c of theme.characters) {
      this.sheets.set(c.id, buildWorldSheet(c.appearance, this.pal.brand))
    }

    // Dust drifting in the two window light shafts.
    const columns = [
      [14, 54],
      [276, 314]
    ]
    for (let i = 0; i < 16; i++) {
      const col = columns[i % 2]
      this.motes.push({
        x: col[0] + ((i * 13) % (col[1] - col[0])),
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
        const rad = 4 + life * 3.5
        const sx = cx + Math.cos(a) * rad
        const sy = top + 2 + Math.sin(a) * rad * 0.6
        ctx.fillStyle = i % 2 === 0 ? this.pal.brand : this.pal.brandLite
        ctx.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 3)
        ctx.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1)
      }
      return
    }

    const bw = 13
    const bh = 8
    const bx = cx - (bw >> 1)
    const by = top - bh - 2

    ctx.fillStyle = this.pal.ink
    ctx.fillRect(bx, by, bw, bh)
    ctx.fillStyle = this.pal.cream
    ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2)

    // Tail: a stepped point for speech, two small puffs for thought.
    ctx.fillStyle = this.pal.ink
    if (c.bubble === 'talk') {
      ctx.fillRect(cx - 2, by + bh, 3, 1)
      ctx.fillRect(cx - 1, by + bh + 1, 1, 1)
    } else {
      ctx.fillRect(cx - 3, by + bh + 1, 2, 2)
      ctx.fillRect(cx - 4, by + bh + 3, 1, 1)
    }

    const rate = c.bubble === 'talk' ? 3.2 : 1.5
    const active = Math.floor(t * rate) % 3
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === active ? this.pal.brandDeep : this.pal.steelDark
      ctx.fillRect(bx + 2 + i * 4, by + 3, 2, 2)
    }
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

  /* -------------------------------------------------------- status tag -- */

  /*
   * A tag floats above every character: the provider mark plus what that
   * agent is doing right now. Four of these are on screen at once, so they
   * are built from the 3x5 world font rather than DOM text - they scale with
   * the scene and stay on the pixel grid.
   */
  private labelWidth(c: CharacterRuntime): number {
    // One pixel of outline either side, rather than a plate's worth of padding.
    return 2 + PIP_W + LABEL_GAP + textWidth(this.labelText(c))
  }

  private labelText(c: CharacterRuntime): string {
    return STATUS_LABEL[(c.lastStatus ?? 'idle') as AgentStatus]
  }

  /** The name shown above a character: its own if it is a CLI session. */
  private displayName(c: CharacterRuntime): string {
    return (c.ownName ?? c.def.name).toUpperCase()
  }

  /** Width of the name plate, which sits above the status tag. */
  private nameWidth(c: CharacterRuntime): number {
    return LABEL_PAD * 2 + textWidth(this.displayName(c))
  }

  /**
   * The name plate.
   *
   * The status tag says what an agent is doing; this says who they are. A
   * selected character gets a brand plate, so the agent the user is talking to
   * is obvious at a glance without any extra chrome.
   */
  private drawNamePlate(
    ctx: CanvasRenderingContext2D,
    c: CharacterRuntime,
    y: number,
    selected: boolean
  ): void {
    const label = this.displayName(c)
    const w = this.nameWidth(c)
    const x = Math.round(c.x) - (w >> 1)

    /*
     * Quiet by default, bright when chosen.
     *
     * A cream plate on every head made the labels the brightest thing in the
     * room, so the eye landed on a row of signs before it found anybody. The
     * resting state is now a dark plate with light lettering — still perfectly
     * readable, but it sits behind the character rather than in front of them.
     *
     * That frees the brand fill to mean something: the agent the user is
     * talking to is the one wearing yellow. Selection is marked by emphasis,
     * never by making a character larger.
     */
    ctx.fillStyle = this.pal.ink
    ctx.fillRect(x, y, w, NAME_H)
    if (selected) {
      ctx.fillStyle = this.pal.brand
      ctx.fillRect(x + 1, y + 1, w - 2, NAME_H - 2)
    }

    // The glyph is 5 tall in a 7 tall plate, so one pixel of edge either side.
    paint(
      ctx,
      text(label, 0, 0, selected ? this.pal.ink : this.pal.cream),
      undefined,
      x + LABEL_PAD,
      y + 1
    )
  }

  /**
   * The status tag, baked once per label.
   *
   * Deliberately not a plate. A filled bar two and a half times wider than the
   * person standing under it is the loudest shape on screen, and it was being
   * drawn once per character — so the room read as a row of labels with some
   * pixel art behind them.
   *
   * Outlined text instead: the same words, legible over any furniture, but as
   * a floating identifier rather than a sign. There are only a handful of
   * status words and two states, so each is rasterised once and the frame loop
   * blits it.
   */
  private statusTag(label: string, active: boolean): HTMLCanvasElement {
    const key = `${label}|${active}`
    const cached = this.tags.get(key)
    if (cached) return cached

    const tx = 1 + PIP_W + LABEL_GAP
    const { canvas, ctx } = createPixelCanvas(tx + textWidth(label) + 1, LABEL_H)

    /*
     * Idle agents are muted and active ones are warm, so a quiet office stays
     * quiet and the one agent actually working is what the eye finds. State is
     * carried by colour and by the pip — never by making anything bigger.
     */
    const accent = active ? this.pal.brand : this.pal.steel
    const ink = active ? this.pal.cream : this.pal.steel

    // Outline first, so the glyphs sit on top of their own shadow.
    const halo = text(label, 0, 0, this.pal.ink)
    for (const [ox, oy] of AROUND) paint(ctx, halo, undefined, tx + ox, 1 + oy)
    paint(ctx, text(label, 0, 0, ink), undefined, tx, 1)

    // The pip, outlined the same way and centred against the 5px glyphs.
    ctx.fillStyle = this.pal.ink
    ctx.fillRect(0, 1, PIP_W + 2, PIP_H + 2)
    ctx.fillStyle = accent
    ctx.fillRect(1, 2, PIP_W, PIP_H)

    this.tags.set(key, canvas)
    return canvas
  }

  private drawStatusTag(
    ctx: CanvasRenderingContext2D,
    c: CharacterRuntime,
    y: number
  ): void {
    const status = (c.lastStatus ?? 'idle') as AgentStatus
    const active = ACTIVE_STATUSES.includes(status)
    const tag = this.statusTag(this.labelText(c), active)
    ctx.drawImage(tag, Math.round(c.x) - (tag.width >> 1), y)
  }

  /**
   * Lay the tags out so two characters standing close together do not print
   * one label on top of another: anything that overlaps a tag already placed
   * gets bumped up a row.
   */
  private layoutTags(
    chars: CharacterRuntime[]
  ): { c: CharacterRuntime; y: number }[] {
    const placed: { c: CharacterRuntime; y: number; x0: number; x1: number }[] = []
    for (const c of [...chars].sort((a, b) => a.x - b.x)) {
      const w = Math.max(this.labelWidth(c), this.nameWidth(c))
      const x0 = Math.round(c.x) - (w >> 1)
      const x1 = x0 + w
      // Room for the name plate above the status tag.
      let y = Math.round(c.y) - WORLD_SPRITE_H - LABEL_H - NAME_H - 2
      let moved = true
      while (moved) {
        moved = false
        for (const p of placed) {
          if (x1 > p.x0 && x0 < p.x1 && Math.abs(y - p.y) < LABEL_H + NAME_H + 2) {
            y = p.y - LABEL_H - NAME_H - 3
            moved = true
          }
        }
      }
      placed.push({ c, y, x0, x1 })
    }
    return placed
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
    viewH: number
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

    // Tags sit above the depth pass: they are attached to characters but read
    // as UI, so they should never be occluded by furniture.
    for (const tag of this.layoutTags(chars)) {
      // The hover card supersedes the tags, so they never stack up.
      if (tag.c.agentId === hoveredId) continue
      this.drawNamePlate(ctx, tag.c, tag.y, tag.c.agentId === selectedId)
      this.drawStatusTag(ctx, tag.c, tag.y + NAME_H + 1)
    }

    this.drawMotes(ctx, t)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
}
