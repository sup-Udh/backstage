import type { Theme, ThemePalette } from '../../themes/types'
import { STATUS_LABEL } from '../../characters/character.states'
import type { AgentStatus } from '../../agents/agent.types'
import { paint } from '../pixel/ops'
import { text, textWidth } from '../pixel/shapes'
import { MARK_SIZE, markForModel } from '../pixel/logos'
import { SPRITE_H, SPRITE_W } from '../pixel/characterSprite'
import type { CharacterRuntime } from '../world.types'
import {
  bakeOps,
  buildCharacterSheet,
  frameRect,
  type BakedProp,
  type CharacterSheet
} from './spriteCache'

/**
 * Status tag metrics, in scene pixels.
 *
 * Deliberately smaller than the character it labels. The tag says what an
 * agent is *doing*; the sprite says *who they are*, and the sprite has to win
 * that contest — a bright plate wider than the person reverses the hierarchy.
 */
const LABEL_H = 9
const LABEL_PAD = 2
const LABEL_GAP = 2

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
  private motes: Mote[] = []

  constructor(private theme: Theme) {
    this.pal = theme.palette
    const scene = theme.scene

    this.background = bakeOps(scene.background, this.pal, 0)
    this.props = scene.props
      .map((p) => bakeOps(p.ops, this.pal, p.baseY))
      .filter((p): p is BakedProp => p !== null)

    for (const c of theme.characters) {
      this.sheets.set(c.id, buildCharacterSheet(c.appearance, this.pal.brand))
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
    const top = Math.round(c.y) - SPRITE_H

    if (c.bubble === 'spark') {
      // A short burst of pixel sparkles.
      const life = Math.min(1, c.settled / 1.4)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + t * 2
        const rad = 6 + life * 5
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
    return LABEL_PAD * 2 + MARK_SIZE + LABEL_GAP + textWidth(this.labelText(c))
  }

  private labelText(c: CharacterRuntime): string {
    return STATUS_LABEL[(c.lastStatus ?? 'idle') as AgentStatus]
  }

  private drawStatusTag(
    ctx: CanvasRenderingContext2D,
    c: CharacterRuntime,
    y: number
  ): void {
    const status = (c.lastStatus ?? 'idle') as AgentStatus
    const active = ACTIVE_STATUSES.includes(status)
    const w = this.labelWidth(c)
    const cx = Math.round(c.x)
    const x = cx - (w >> 1)

    /*
     * Active agents get the brand edge; idle ones get a plain dark plate, so
     * a room full of idle characters is quiet and the one actually working
     * draws the eye.
     */
    const edge = active ? this.pal.brand : this.pal.ink3
    const ink = active ? this.pal.cream : this.pal.steel

    // Stem down to the head, drawn first so the plate caps it.
    ctx.fillStyle = edge
    ctx.fillRect(cx, y + LABEL_H - 1, 1, 3)

    ctx.fillStyle = edge
    ctx.fillRect(x, y, w, LABEL_H)
    ctx.fillStyle = this.pal.ink
    ctx.fillRect(x + 1, y + 1, w - 2, LABEL_H - 2)

    paint(
      ctx,
      markForModel(c.model),
      { mark: active ? this.pal.brand : this.pal.steel },
      x + LABEL_PAD,
      y + 1
    )
    paint(
      ctx,
      text(this.labelText(c), 0, 0, ink),
      undefined,
      x + LABEL_PAD + MARK_SIZE + LABEL_GAP,
      y + 2
    )
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
      const w = this.labelWidth(c)
      const x0 = Math.round(c.x) - (w >> 1)
      const x1 = x0 + w
      let y = Math.round(c.y) - SPRITE_H - LABEL_H - 1
      let moved = true
      while (moved) {
        moved = false
        for (const p of placed) {
          if (x1 > p.x0 && x0 < p.x1 && Math.abs(y - p.y) < LABEL_H + 1) {
            y = p.y - LABEL_H - 2
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

    const { sx, sy } = frameRect(c.state, c.facing, c.frame)
    const dx = Math.round(c.x) - (SPRITE_W >> 1)
    const dy = Math.round(c.y) - SPRITE_H

    // Contact shadow, so nobody floats.
    ctx.save()
    ctx.globalAlpha = 0.18
    ctx.fillStyle = this.pal.ink
    ctx.fillRect(dx + 3, Math.round(c.y) - 1, 10, 1)
    ctx.fillRect(dx + 4, Math.round(c.y), 8, 1)
    ctx.restore()

    if (selected) {
      // A ring on the floor, so a selected agent stays findable in a crowd
      // even while another character is standing in front of them.
      ctx.fillStyle = this.pal.brand
      ctx.fillRect(dx + 1, Math.round(c.y) - 1, 14, 1)
      ctx.fillRect(dx + 2, Math.round(c.y) + 1, 12, 1)
      ctx.fillRect(dx, Math.round(c.y), 2, 1)
      ctx.fillRect(dx + 14, Math.round(c.y), 2, 1)
    }

    if (hovered) {
      // 1px brand outline, drawn by stamping the silhouette around the sprite.
      for (const [ox, oy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1]
      ]) {
        ctx.drawImage(
          art.silhouette,
          sx,
          sy,
          SPRITE_W,
          SPRITE_H,
          dx + ox,
          dy + oy,
          SPRITE_W,
          SPRITE_H
        )
      }
    }

    ctx.drawImage(art.sheet, sx, sy, SPRITE_W, SPRITE_H, dx, dy, SPRITE_W, SPRITE_H)
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
      const hovered = hoveredId === c.def.id || selectedId === c.def.id
      items.push({
        baseY: c.y,
        draw: () => {
          this.drawCharacter(ctx, c, hovered, selectedId === c.def.id)
          this.drawBubble(ctx, c, t)
        }
      })
    }

    items.sort((a, b) => a.baseY - b.baseY)
    for (const item of items) item.draw()

    // Tags sit above the depth pass: they are attached to characters but read
    // as UI, so they should never be occluded by furniture.
    for (const tag of this.layoutTags(chars)) {
      // The hover card supersedes the tag, so they never stack up.
      if (tag.c.def.id === hoveredId) continue
      this.drawStatusTag(ctx, tag.c, tag.y)
    }

    this.drawMotes(ctx, t)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
}
