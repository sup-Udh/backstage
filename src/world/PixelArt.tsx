import { useEffect, useRef } from 'react'
import type { Op, Palette } from './pixel/ops'
import { paint } from './pixel/ops'

interface Props {
  width: number
  height: number
  ops: readonly Op[]
  palette: Palette
  /** Integer upscale factor only. */
  scale?: number
  className?: string
}

/**
 * Renders a static op list. Used for UI illustrations outside the world -
 * theme previews and section icons - so every picture on the page comes from
 * the same pixel pipeline as the office itself.
 */
export function PixelArt({
  width,
  height,
  ops,
  palette,
  scale = 3,
  className
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, width, height)
    paint(ctx, ops, palette)
  }, [ops, palette, width, height])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={`pixelated block ${className ?? ''}`}
      style={{ width: width * scale, height: height * scale }}
    />
  )
}
