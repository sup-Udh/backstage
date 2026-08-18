import { useEffect, useRef } from 'react'
import type { Theme } from '../themes/types'
import { createPixelCanvas, paint } from './pixel/ops'
import { SPRITE_H, SPRITE_W } from './pixel/characterSprite'
import { buildCharacterSheet, frameRect } from './engine/spriteCache'

/** The window into each world, in scene pixels. */
const CROP = { x: 60, y: 28, w: 96, h: 60 }
/** Where the two sample characters stand inside that window. */
const CAST_X = [100, 132]
const CAST_Y = 85

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

  theme.characters.slice(0, 2).forEach((c, i) => {
    const art = buildCharacterSheet(c.appearance, palette.brand)
    const { sx, sy } = frameRect('idle', 'down', 0)
    full.ctx.drawImage(
      art.sheet,
      sx,
      sy,
      SPRITE_W,
      SPRITE_H,
      CAST_X[i] - (SPRITE_W >> 1),
      CAST_Y - SPRITE_H,
      SPRITE_W,
      SPRITE_H
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

export function ThemePreview({ theme, scale = 2, className }: Props) {
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
