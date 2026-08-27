import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { bucketFor } from '../../characters/character.states'

interface Props {
  theme: Theme
  engine: WorldEngine
  /** True while the world is mid-swap, so the frame can veil itself. */
  switching?: boolean
}

/**
 * The office, at the size of a panel rather than the size of the page.
 *
 * This is the whole of the rebalance. The world used to be the hero: a
 * 1120×560 frame with the copy arranged around it, which made the first thing
 * a new user saw a video game with a headline attached. It is now a column
 * beside the copy, capped so it can never take more than about a third of the
 * screen, and it reads the way it should — as a live window into the product
 * rather than as the product.
 *
 * What has *not* changed is what is inside it. The same `WorldEngine` drives
 * this, the login page and the workspace; a second, smaller renderer written
 * for the start screen would be the one piece of character art in the product
 * free to drift from the rest, and it would drift.
 *
 * The canvas is scenery: `aria-hidden`, no pointer events, no tooltips, no
 * hover targets. Everything it says is also said in text — the status bar
 * below it, and the relay beside it — so nothing here exists only as pixels.
 */

/**
 * How small the room may get before there is nothing left to draw, and how
 * large before it starts competing with the product.
 *
 * The ceiling is the point. There is no maximum on the login page's world
 * because the world *is* that page; here the ceiling is what keeps the pixel
 * environment to the third of the screen requirement 23 allows it.
 */
const MIN_W = 260
const MIN_H = 220
const MAX_H = 380

export function WorkspacePreview({ theme, engine, switching = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)
  const busy = agents.filter((a) => bucketFor(a.status) !== 'idle').length

  const measure = useCallback(() => {
    const el = wrapRef.current
    const canvas = canvasRef.current
    if (!el || !canvas) return

    const w = Math.round(Math.max(MIN_W, el.clientWidth))
    const h = Math.round(
      Math.min(MAX_H, Math.max(MIN_H, el.clientHeight || MIN_H))
    )

    /*
     * The backing store is sized 1:1 with the element. Anything else means the
     * browser scaling the canvas by a fraction, which is exactly the
     * interpolation `.pixelated` exists to prevent — it turns every sprite
     * edge to mush.
     */
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.imageSmoothingEnabled = false
    }
    // The engine builds a room to fill exactly this frame rather than being
    // cropped by it, so a shorter panel gets a shorter office.
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
    <div className="border-[3px] border-ink bg-slate shadow-[6px_6px_0_0_var(--color-brand-shadow)]">
      <div
        ref={wrapRef}
        className="relative h-[240px] overflow-hidden sm:h-[300px] min-[960px]:h-[320px] xl:h-[340px]"
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pixelated pointer-events-none block"
        />

        {/*
          The scene change. Stepped opacity rather than a smooth fade, so a
          world swap reads as a pixel dissolve rather than as a CSS transition
          — the same treatment the workspace gives it.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 bg-slate"
          style={{
            opacity: switching ? 1 : 0,
            transition: `opacity ${switching ? 200 : 260}ms steps(5, end)`
          }}
        />
      </div>

      {/*
        The caption, and the accessible version of everything above it. It is
        deliberately plain text rather than a HUD: the office is a picture of a
        product, and the two facts worth stating about a picture are which
        world it is and how many people are in it.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t-[3px] border-slate-rule bg-slate px-3 py-2">
        <span className="border-2 border-brand-shadow bg-brand px-2 py-0.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-on-brand">
          {theme.name}
        </span>
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-dim">
          {busy} working · {agents.length} in the office · simulated
        </span>
      </div>
    </div>
  )
}
