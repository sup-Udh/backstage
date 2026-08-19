import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { CharacterTooltip } from '../../components/CharacterCard/CharacterTooltip'
import { AgentInspector } from './AgentInspector'
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
 * The world.
 *
 * The canvas fills the whole panel and the room is drawn through a camera, so
 * the office is as large as the window allows and the user can drag around it
 * and zoom in. Whole-number zoom only — a fractional scale would put sprite
 * edges between device pixels.
 */
export function WorldPanel({ theme, engine, switching }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const [hover, setHover] = useState<Hover | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(3)
  const [dragging, setDragging] = useState(false)

  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)

  /* The canvas backing store matches the panel, so the camera has room to work. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const w = Math.max(1, Math.floor(wrap.clientWidth))
    const h = Math.max(1, Math.floor(wrap.clientHeight))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.imageSmoothingEnabled = false
    }
    engine.setViewport(w, h)
    setZoom(engine.getCamera().scale)
  }, [engine])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    resize()
    engine.start(canvas)
    const ro = new ResizeObserver(resize)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => {
      ro.disconnect()
      engine.stop()
    }
  }, [engine, resize])

  // Re-test on a timer as well as on move, so the card follows a walking agent.
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = pointer.current
      if (!p || drag.current) return
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

  const local = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onDown = (e: React.MouseEvent) => {
    const p = local(e)
    drag.current = { x: p.x, y: p.y, moved: false }
    setDragging(true)
  }

  const onMove = (e: React.MouseEvent) => {
    const p = local(e)
    pointer.current = p
    const d = drag.current
    if (!d) return
    const dx = p.x - d.x
    const dy = p.y - d.y
    // A few pixels of slop, so a click is never read as a tiny drag.
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    engine.panBy(dx, dy)
    d.x = p.x
    d.y = p.y
    setHover(null)
  }

  const onUp = (e: React.MouseEvent) => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d || d.moved) return

    // A click selects whoever is under the cursor, or clears the selection.
    const p = local(e)
    const s = engine.toScene(p.x, p.y)
    const hit = engine.hitTest(s.x, s.y)
    const next = hit?.id ?? null
    engine.setSelected(next)
    setSelected(next)
  }

  const onLeave = () => {
    pointer.current = null
    drag.current = null
    setDragging(false)
    engine.setHovered(null)
    setHover(null)
  }

  const onWheel = (e: React.WheelEvent) => {
    const p = local(e)
    engine.zoomBy(e.deltaY < 0 ? 1 : -1, p.x, p.y)
    setZoom(engine.getCamera().scale)
  }

  const step = (n: number) => {
    engine.zoomBy(n)
    setZoom(engine.getCamera().scale)
  }

  const hoveredAgent = hover
    ? agents.find((a) => a.characterId === hover.id)
    : undefined
  const selectedAgent = selected
    ? agents.find((a) => a.characterId === selected)
    : undefined
  const selectedChar = selected
    ? theme.characters.find((c) => c.id === selected)
    : undefined

  const active = agents.filter((a) =>
    ['working', 'thinking', 'talking', 'success'].includes(a.status)
  ).length

  return (
    <section className="relative flex h-full min-h-0 min-w-0 flex-col">
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onLeave}
          onWheel={onWheel}
          className="pixelated block h-full w-full"
          style={{ cursor: dragging ? 'grabbing' : hover ? 'pointer' : 'grab' }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 bg-ink"
          style={{
            opacity: switching ? 1 : 0,
            transition: `opacity ${switching ? 200 : 260}ms steps(5, end)`
          }}
        />

        {hover && hoveredAgent && hover.id !== selected && (
          <CharacterTooltip
            agent={hoveredAgent}
            left={hover.left}
            top={hover.top - 6}
          />
        )}

        {/* Camera controls, bottom-right so they never sit over the desks. */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1">
          {[
            { label: '+', title: 'Zoom in', run: () => step(1) },
            { label: '−', title: 'Zoom out', run: () => step(-1) },
            {
              label: '⤢',
              title: 'Fit the whole room',
              run: () => {
                engine.fit()
                setZoom(engine.getCamera().scale)
              }
            }
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              title={b.title}
              onClick={b.run}
              className="grid h-8 w-8 place-items-center border-2 border-ink bg-cream font-pixel text-sm font-bold text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px hover:bg-brand"
            >
              {b.label}
            </button>
          ))}
          <span className="mt-1 border-2 border-ink bg-ink px-1 py-0.5 text-center font-mono text-[10px] font-medium text-brand">
            {zoom}×
          </span>
        </div>

        {/* Inspector for the selected character. */}
        {selectedAgent && selectedChar && (
          <AgentInspector
            agent={selectedAgent}
            character={selectedChar}
            onFocus={() => engine.focusOn(selectedChar.id)}
            onClose={() => {
              engine.setSelected(null)
              setSelected(null)
            }}
          />
        )}
      </div>

      {/* World HUD. */}
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
            <span className={active > 0 ? 'text-brand' : 'text-dim'}>{active}</span>
            active
          </span>
        </span>

        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-dim">
          Drag to pan · scroll to zoom · click an agent
        </span>
      </div>
    </section>
  )
}
