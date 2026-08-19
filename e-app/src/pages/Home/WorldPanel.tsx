import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { CharacterTooltip } from '../../components/CharacterCard/CharacterTooltip'
import { STATUS_GLYPH } from '../../characters/character.states'

interface Props {
  theme: Theme
  engine: WorldEngine
  switching: boolean
}

interface Hover {
  id: string
  left: number
  top: number
}

/**
 * The world half of the workspace.
 *
 * Unlike the landing page's fixed frame, this fills whatever space the grid
 * gives it: the camera fits the whole office to the panel and centres it,
 * choosing the largest whole-number scale that fits. Whole numbers only, so a
 * scene pixel is always an exact block of screen pixels.
 */
export function WorldPanel({ theme, engine, switching }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [scale, setScale] = useState(3)
  const [hover, setHover] = useState<Hover | null>(null)

  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)
  const { width: sceneW, height: sceneH } = theme.scene

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    engine.start(canvas)
    return () => engine.stop()
  }, [engine])

  // The camera: fit the room to the panel at a whole-number scale.
  useEffect(() => {
    const measure = () => {
      const el = viewportRef.current
      if (!el) return
      const next = Math.max(
        2,
        Math.min(
          6,
          Math.floor(el.clientWidth / sceneW),
          Math.floor(el.clientHeight / sceneH)
        )
      )
      setScale((prev) => (prev === next ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (viewportRef.current) ro.observe(viewportRef.current)
    return () => ro.disconnect()
  }, [sceneW, sceneH])

  // Re-test on a timer as well as on move, so the card follows a walking agent.
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = pointer.current
      if (!p) return
      const hit = engine.hitTest(p.x, p.y)
      engine.setHovered(hit?.id ?? null)
      setHover((prev) => {
        if (!hit) return prev === null ? prev : null
        const left = Math.round(hit.x * scale)
        const top = Math.round(hit.y * scale)
        if (prev && prev.id === hit.id && prev.left === left && prev.top === top) {
          return prev
        }
        return { id: hit.id, left, top }
      })
    }, 90)
    return () => window.clearInterval(id)
  }, [engine, scale])

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    pointer.current = {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale
    }
  }

  const onLeave = () => {
    pointer.current = null
    engine.setHovered(null)
    setHover(null)
  }

  const hoveredAgent = hover
    ? agents.find((a) => a.characterId === hover.id)
    : undefined

  const active = agents.filter((a) =>
    ['working', 'thinking', 'talking', 'success'].includes(a.status)
  ).length

  return (
    <section className="relative flex min-w-0 flex-col bg-cream-2">
      <div
        ref={viewportRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden px-3 py-6"
      >
        <div className="relative border-[4px] border-ink shadow-[6px_6px_0_0_var(--color-brand-shadow)]">
          <canvas
            ref={canvasRef}
            width={sceneW}
            height={sceneH}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
            className="pixelated block"
            style={{
              width: sceneW * scale,
              height: sceneH * scale,
              cursor: hover ? 'pointer' : 'default'
            }}
          />

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
      </div>

      {/* World HUD: the room's name and its live headcount. */}
      <div className="flex shrink-0 items-center justify-between border-t-[3px] border-ink bg-ink px-4 py-2.5">
        <span className="border-2 border-brand-shadow bg-brand px-2 py-0.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
          {theme.name}
        </span>

        <span className="flex items-center gap-4 font-mono text-[11px] font-medium uppercase tracking-[0.06em]">
          <span className="text-cream-2">
            <span className="text-brand">{agents.length}</span> agents
          </span>
          <span aria-hidden className="h-3 w-px bg-ink-3" />
          <span className="flex items-center gap-1.5 text-cream-2">
            <span aria-hidden className={active > 0 ? 'text-brand' : 'text-dim'}>
              {STATUS_GLYPH.working}
            </span>
            <span className={active > 0 ? 'text-brand' : 'text-dim'}>
              {active}
            </span>
            active
          </span>
        </span>

        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-dim">
          Hover a character
        </span>
      </div>
    </section>
  )
}
