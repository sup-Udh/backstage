import { useEffect, useMemo, useRef } from 'react'
import type {
  CharacterAppearance,
  CharacterState,
  Facing
} from '../characters/character.types'
import { frameAt } from '../characters/character.states'
import { SPRITE_H, SPRITE_W } from './pixel/characterSprite'
import { buildCharacterSheet, frameRect } from './engine/spriteCache'

interface Props {
  appearance: CharacterAppearance
  state?: CharacterState
  facing?: Facing
  /** Integer upscale factor. Non-integers would break the pixel grid. */
  scale?: number
  /**
   * Whether to run the animation loop.
   *
   * Off for the small avatars in a list, where a dozen of these can be on
   * screen at once and each one otherwise holds its own `requestAnimationFrame`
   * running for as long as the panel is open — beside a canvas world that is
   * already animating. A still frame is the right amount of movement for a
   * face in a row; the office next door is where characters move.
   */
  animated?: boolean
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
  animated = true,
  className
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const art = useMemo(
    () => buildCharacterSheet(appearance),
    [appearance]
  )

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    let raf = 0
    const started = performance.now()

    const draw = (now: number) => {
      const t = (now - started) / 1000
      const frame = frameAt(state, t)
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
      if (animated) raf = requestAnimationFrame(draw)
    }
    // A still avatar draws once, on the clip's first frame, and holds it.
    if (animated) raf = requestAnimationFrame(draw)
    else draw(started)
    return () => cancelAnimationFrame(raf)
  }, [art, state, facing, animated])

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
