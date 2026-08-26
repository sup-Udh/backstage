import { useCallback, useEffect, useRef } from 'react'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { WorldLabelLayer } from '../../world/labels/WorldLabelLayer'

interface Props {
  engine: WorldEngine
}

/**
 * The office, behind the sign-in card.
 *
 * The same `WorldEngine` the landing page and the workspace run — not a
 * separate animation for the login screen. That is the whole point of
 * requirement 36: a second, simpler pixel engine written just for this page
 * would be the one piece of character art in the product free to drift from
 * the rest, and it would drift, because nothing would ever render the two side
 * by side to show it had.
 *
 * What is *not* reused is `World`: that component is a game frame, with a HUD,
 * hover tooltips and a status bar, and every one of those is a thing to click
 * on a page whose only job is a single button. Here the canvas is scenery —
 * `aria-hidden`, `pointer-events-none`, no interaction of any kind. The
 * characters walk, sit at desks, type and think entirely on the engine's own
 * ambient scheduler.
 *
 * The name tags *are* reused, though, and that is the point of them. They are
 * `WorldLabelLayer` — the same component that names characters in the
 * workspace — so a tag on the login page is the same pixel plate, in the same
 * face, positioned by the same per-frame callback as everywhere else. It
 * already does the two things that are hard: it follows a walking character
 * without lagging a frame behind the canvas, and it hides a label whose
 * character has left the visible scene.
 *
 * The names come from the world, not from here. `WorldEngine` labels a
 * character with the runtime's name only when that agent sets `useOwnName` —
 * which the live team does and the showcase does not — so these fall through
 * to `CharacterDef.name` from whichever theme is currently on screen. Rotating
 * to The Branch relabels the room to The Branch's cast, with nothing in this
 * file knowing any of their names.
 *
 * The bounds are this component's own rather than `World`'s, which is what
 * keeps requirement 35 honest: `World` will not go below 420×280, and forcing
 * that into a narrow window is exactly how a character ends up walking across
 * the Google button.
 */

/**
 * Floors below which there is no room left to draw.
 *
 * There is deliberately no maximum. The backing store is sized 1:1 with the
 * element, and capping it would mean the browser scaling the canvas by a
 * fraction to cover the difference — which is exactly the interpolation
 * `.pixelated` exists to prevent, and it turns every sprite edge to mush. A
 * taller frame gets a taller room instead, which is what the engine's layout
 * is built to do.
 */
const MIN_W = 240
const MIN_H = 200

export function LoginWorld({ engine }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const measure = useCallback(() => {
    const el = wrapRef.current
    const canvas = canvasRef.current
    if (!el || !canvas) return

    const w = Math.round(Math.max(MIN_W, el.clientWidth))
    const h = Math.round(Math.max(MIN_H, el.clientHeight || MIN_H))

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      // Pixel art must never be interpolated, at any scale.
      if (ctx) ctx.imageSmoothingEnabled = false
    }
    // The engine lays a room out to fill exactly this frame rather than being
    // cropped by it, so a short window gets a shorter office.
    engine.setViewport(w, h)
  }, [engine])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    engine.start(canvas)
    return () => engine.stop()
  }, [engine])

  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pixelated pointer-events-none block"
      />

      {/*
        Tags over the canvas. The layer places itself absolutely across this
        wrapper, so it inherits the frame's bounds and clips with it — a
        character walking out of the room takes its label with it rather than
        leaving one floating over the login card.
      */}
      <WorldLabelLayer engine={engine} />
    </div>
  )
}
