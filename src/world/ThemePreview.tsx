import { useEffect, useRef } from 'react'
import type { Theme } from '../themes/types'
import { createPixelCanvas, paint } from './pixel/ops'
import {
  buildWorldSheet,
  worldFrameRect,
  WORLD_SPRITE_H,
  WORLD_SPRITE_W
} from './engine/spriteCache'

/**
 * The window into each world, in scene pixels. Wide and short so the card
 * reads as a letterboxed view into a room rather than a stamp on a page.
 *
 * Aimed at the back desk row, which is the part of the office that says what
 * the world is: two workstations, the wall behind them and the floor in
 * front. The crop used to sit above the horizon, which after the room grew
 * would have framed nothing but blank wall.
 */
const CROP = { x: 20, y: 128, w: 240, h: 78 }
/** Where the two sample characters stand — the first two seats in that row. */
const CAST_X = [72, 240]
const CAST_Y = 179

/**
 * Renders a crop of the theme's actual scene, with two of its actual
 * characters standing in it.
 *
 * Deliberately not hand-drawn thumbnails: a preview built from the same data
 * the world renders from cannot go stale, and a newly registered theme gets
 * a correct preview for free.
 */
const cache = new Map<string, HTMLCanvasElement>()

function bakePreview(theme: Theme): HTMLCanvasElement {
  const hit = cache.get(theme.id)
  if (hit) return hit

  const { scene, palette } = theme
  const full = createPixelCanvas(scene.width, scene.height)
  paint(full.ctx, scene.background, palette)
  for (const prop of [...scene.props].sort((a, b) => a.baseY - b.baseY)) {
    paint(full.ctx, prop.ops, palette)
  }

  /*
   * World-scale art, not the full-size portrait sheet. The preview is a claim
   * about what the room looks like, so the cast has to stand in it at the
   * size they actually stand in it — at full size they were twice the height
   * of the desk they sit at, which is the exact impression this pass exists
   * to correct.
   */
  theme.characters.slice(0, 2).forEach((c, i) => {
    const art = buildWorldSheet(c.appearance)
    const { sx, sy } = worldFrameRect('idle', 'down', 0)
    full.ctx.drawImage(
      art.sheet,
      sx,
      sy,
      WORLD_SPRITE_W,
      WORLD_SPRITE_H,
      CAST_X[i] - (WORLD_SPRITE_W >> 1),
      CAST_Y - WORLD_SPRITE_H,
      WORLD_SPRITE_W,
      WORLD_SPRITE_H
    )
  })

  const out = createPixelCanvas(CROP.w, CROP.h)
  out.ctx.drawImage(
    full.canvas,
    CROP.x,
    CROP.y,
    CROP.w,
    CROP.h,
    0,
    0,
    CROP.w,
    CROP.h
  )
  cache.set(theme.id, out.canvas)
  return out.canvas
}

interface Props {
  theme: Theme
  /** Integer upscale only. */
  scale?: number
  className?: string
}

export function ThemePreview({ theme, scale = 3, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, CROP.w, CROP.h)
    ctx.drawImage(bakePreview(theme), 0, 0)
  }, [theme])

  return (
    <canvas
      ref={ref}
      width={CROP.w}
      height={CROP.h}
      className={`pixelated block ${className ?? ''}`}
      style={{ width: CROP.w * scale, height: CROP.h * scale }}
    />
  )
}
