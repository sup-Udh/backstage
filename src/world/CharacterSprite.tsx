import { useEffect, useMemo, useRef } from 'react'
import type {
  CharacterAppearance,
  CharacterState,
  Facing
} from '../characters/character.types'
import { ANIMATIONS } from '../characters/character.states'
import { SPRITE_H, SPRITE_W } from './pixel/characterSprite'
import { buildCharacterSheet, frameRect } from './engine/spriteCache'

interface Props {
  appearance: CharacterAppearance
  state?: CharacterState
  facing?: Facing
  /** Integer upscale factor. Non-integers would break the pixel grid. */
  scale?: number
  className?: string
}

/**
 * A single animated sprite outside the world canvas, used by the team cards.
 *
 * It shares the sprite factory with the world, so a character never looks
 * one way in the office and another way in the UI.
 */
export function CharacterSprite({
  appearance,
  state = 'idle',
  facing = 'down',
  scale = 4,
  className
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const art = useMemo(
    () => buildCharacterSheet(appearance, '#FFC94F'),
    [appearance]
  )

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const clip = ANIMATIONS[state]
    let raf = 0
    const started = performance.now()

    const draw = (now: number) => {
      const t = (now - started) / 1000
      const frame = Math.floor(t * clip.fps) % clip.frames
      const { sx, sy } = frameRect(state, facing, frame)
      ctx.clearRect(0, 0, SPRITE_W, SPRITE_H)
      ctx.drawImage(
        art.sheet,
        sx,
        sy,
        SPRITE_W,
        SPRITE_H,
        0,
        0,
        SPRITE_W,
        SPRITE_H
      )
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [art, state, facing])

  return (
    <canvas
      ref={ref}
      width={SPRITE_W}
      height={SPRITE_H}
      className={`pixelated ${className ?? ''}`}
      style={{ width: SPRITE_W * scale, height: SPRITE_H * scale }}
    />
  )
}
