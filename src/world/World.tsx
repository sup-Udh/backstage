import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Theme } from '../themes/types'
import type { WorldEngine } from './engine/WorldEngine'
import { AgentStatus } from '../components/AgentStatus/AgentStatus'
import { CharacterTooltip } from '../components/CharacterCard/CharacterTooltip'
import { WorldLabelLayer } from './labels/WorldLabelLayer'

interface Props {
  theme: Theme
  engine: WorldEngine
  /** True while the world is mid-swap, so the frame can veil itself. */
  switching?: boolean
}

interface Hover {
  id: string
  left: number
  top: number
}

const MIN_SCALE = 1
const MAX_SCALE = 6
/** How far below the fold the world may run before it steps down a size. */
const BOTTOM_ALLOWANCE = 24

/**
 * The window into the office.
 *
 * React owns the frame, the HUD and the tooltip. The canvas inside is driven
 * entirely by WorldEngine, so nothing in this component re-renders per frame:
 * the only React state here is the hovered character.
 */
export function World({ theme, engine, switching = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)

  const { width: sceneW, height: sceneH } = theme.scene

  // Start the loop once. The engine outlives re-renders.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    engine.start(canvas)
    return () => engine.stop()
  }, [engine])


  /*
   * Size the world to the space actually available.
   *
   * Width comes from the container and height from what is left of the
   * viewport below the hero copy, so a short window gets a smaller world
   * rather than one that runs off the bottom. The scale is always a whole
   * number: a fractional one would put sprite edges between device pixels,
   * which is exactly the blurring the art direction rules out.
   *
   * The canvas backing store is then set to the room's exact size at that
   * scale, so the camera fits it with no letterboxing and the aspect ratio
   * can never distort.
   */
  const measure = useCallback(() => {
    const el = wrapRef.current
    const canvas = canvasRef.current
    if (!el || !canvas) return

    const top = el.getBoundingClientRect().top
    // A little overshoot is fine: the page scrolls, and insisting the world
    // end exactly at the fold would shrink it a whole step for a few pixels.
    const availH = window.innerHeight - top + BOTTOM_ALLOWANCE
    const next = Math.max(
      MIN_SCALE,
      Math.min(
        MAX_SCALE,
        Math.floor(el.clientWidth / sceneW),
        Math.floor(availH / sceneH)
      )
    )

    const w = sceneW * next
    const h = sceneH * next
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.imageSmoothingEnabled = false
    }
    // Without this the engine's camera has no idea how big its canvas is and
    // draws the room at its default zoom into a mismatched buffer.
    engine.setViewport(w, h)
    engine.fit()
  }, [engine, sceneW, sceneH])

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

  /*
   * Re-test the pointer on a timer as well as on move, so the tooltip stays
   * attached to a character who is walking rather than going stale.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = pointer.current
      if (!p) return
      const s = engine.toScene(p.x, p.y)
      const hit = engine.hitTest(s.x, s.y)
      engine.setHovered(hit?.id ?? null)
      setHover((prev) => {
        if (!hit) return prev === null ? prev : null
        const cam = engine.getCamera()
        const left = Math.round((hit.x - cam.x) * cam.scale)
        const top = Math.round((hit.y - cam.y) * cam.scale)
        if (prev && prev.id === hit.id && prev.left === left && prev.top === top) {
          return prev
        }
        return { id: hit.id, left, top }
      })
    }, 90)
    return () => window.clearInterval(id)
  }, [engine])

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    pointer.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onLeave = () => {
    pointer.current = null
    engine.setHovered(null)
    setHover(null)
  }

  const hoveredAgent = hover
    ? agents.find((a) => a.characterId === hover.id)
    : undefined

  return (
    <div ref={wrapRef} className="flex w-full justify-center">
      <div className="relative">
        {/*
          The frame holds the viewport and a status bar, the way a game UI
          would. Keeping the HUD out of the canvas means none of the room -
          the windows, the board, the signage - is ever covered by chrome.
        */}
        <div className="border-[4px] border-ink bg-ink shadow-[8px_8px_0_0_var(--color-brand-shadow)]">
          <div className="relative block">
            {/*
              No width/height attributes: the backing store is sized in
              `measure`, in step with the engine's viewport. Setting them as
              props too would reset the buffer on every render.
            */}
            <canvas
              ref={canvasRef}
              onMouseMove={onMove}
              onMouseLeave={onLeave}
              className="pixelated block"
              style={{ cursor: hover ? 'pointer' : 'default' }}
            />

            {/*
              The same label overlay the workspace uses, so a character is
              named the same way in both — readable text over the canvas rather
              than text painted into it at scene resolution.
            */}
            <WorldLabelLayer engine={engine} hoveredId={hover?.id ?? null} />

            {/*
              The scene change. Stepped opacity rather than a smooth fade, so
              the swap reads as a pixel dissolve rather than a CSS transition.
            */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-30 bg-ink"
              style={{
                opacity: switching ? 1 : 0,
                transition: `opacity ${switching ? 200 : 260}ms steps(5, end)`
              }}
            />

            {hover && hoveredAgent && (
              <CharacterTooltip
                agent={hoveredAgent}
                left={hover.left}
                top={hover.top - 6}
              />
            )}
          </div>

          <div className="flex w-0 min-w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t-[3px] border-ink-3 bg-ink px-3 py-2">
            <span className="border-2 border-brand-shadow bg-brand px-2 py-0.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
              {theme.name}
            </span>

            <AgentStatus agents={agents} />

            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-dim">
              Hover a character
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
