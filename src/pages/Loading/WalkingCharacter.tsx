import { useEffect, useMemo, useRef } from 'react'
import type { CharacterAppearance } from '../../characters/character.types'
import { ANIMATIONS } from '../../characters/character.states'
import { SPRITE_H, SPRITE_W } from '../../world/pixel/characterSprite'
import { buildCharacterSheet, frameRect } from '../../world/engine/spriteCache'

interface Props {
  appearance: CharacterAppearance
  /** Integer upscale. A fraction would put sprite edges between pixels. */
  scale?: number
  /** Seconds for one crossing. */
  duration?: number
}

/**
 * A character walking across the loading screen.
 *
 * Built from the same sprite factory the office uses, so the person the user
 * meets on the way in is drawn exactly as they will be once inside — a
 * separate loading illustration would be the one piece of character art in the
 * product that could drift from the rest.
 *
 * `CharacterSprite` would have covered the animation but not the travel: it
 * draws one sprite in place, and the whole point here is the crossing. This
 * moves the sprite as well as animating it, in one canvas, with the walk cycle
 * driven by the same clip the world plays.
 */
export function WalkingCharacter({ appearance, scale = 3, duration = 4.5 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const art = useMemo(() => buildCharacterSheet(appearance, '#FFC94F'), [appearance])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const clip = ANIMATIONS.walking
    const started = performance.now()
    let raf = 0

    const draw = (now: number) => {
      const t = (now - started) / 1000

      const width = canvas.width
      const height = canvas.height

      /*
       * Walk right, then loop. The character leaves one side and re-enters
       * from the other rather than turning around: this is somebody on their
       * way somewhere, not pacing.
       */
      const span = width + SPRITE_W
      const x = Math.round(((t / duration) % 1) * span) - SPRITE_W

      const frame = Math.floor(t * clip.fps) % clip.frames
      const { sx, sy } = frameRect('walking', 'right', frame)

      ctx.clearRect(0, 0, width, height)

      /*
       * A hard shadow on the bottom row, so the walk sits on the floor line
       * rather than floating over it. Drawn before the sprite and one row
       * below its feet, so nothing is painted over.
       */
      ctx.fillStyle = 'rgba(27, 27, 42, 0.18)'
      ctx.fillRect(x + 2, height - 1, SPRITE_W - 4, 1)

      ctx.drawImage(
        art.sheet,
        sx,
        sy,
        SPRITE_W,
        SPRITE_H,
        x,
        height - SPRITE_H,
        SPRITE_W,
        SPRITE_H
      )

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [art, duration])

  /*
   * The backing store is in sprite pixels and CSS scales it by a whole number,
   * so every source pixel lands on an exact block of screen pixels.
   */
  const w = 120
  const h = SPRITE_H + 2

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      aria-hidden
      className="pixelated absolute bottom-[18px] left-1/2"
      style={{
        width: w * scale,
        height: h * scale,
        transform: 'translateX(-50%)'
      }}
    />
  )
}
