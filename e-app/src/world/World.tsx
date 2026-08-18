import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Theme } from '../themes/types'
import type { WorldEngine } from './engine/WorldEngine'
import { AgentStatus } from '../components/AgentStatus/AgentStatus'
import { CharacterTooltip } from '../components/CharacterCard/CharacterTooltip'

interface Props {
  theme: Theme
  engine: WorldEngine
}

interface Hover {
  id: string
  left: number
  top: number
}

const MIN_SCALE = 2
const MAX_SCALE = 4

/**
 * The window into the office.
 *
 * React owns the frame, the HUD and the tooltip. The canvas inside is driven
 * entirely by WorldEngine, so nothing in this component re-renders per frame:
 * the only React state here is the integer scale and the hovered character.
 */
export function World({ theme, engine }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [scale, setScale] = useState(3)
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
   * Only ever scale by a whole number. A fractional scale would put sprite
   * edges between device pixels, which is exactly the blurring the art
   * direction rules out.
   */
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current
      if (!el) return
      const byWidth = Math.floor(el.clientWidth / sceneW)
      const byHeight = Math.floor((window.innerHeight * 0.68) / sceneH)
      const next = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, byWidth, byHeight)
      )
      setScale((prev) => (prev === next ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [sceneW, sceneH])

  /*
   * Re-test the pointer on a timer as well as on move, so the tooltip stays
   * attached to a character who is walking rather than going stale.
   */
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

            {hover && hoveredAgent && (
              <CharacterTooltip
                agent={hoveredAgent}
                left={hover.left}
                top={hover.top - 6}
              />
            )}
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-3 border-t-[3px] border-ink-3 bg-ink px-3 py-2"
            style={{ width: sceneW * scale }}
          >
            <span className="border-2 border-brand-shadow bg-brand px-2 py-0.5 font-pixel text-[10px] font-bold uppercase tracking-[0.16em] text-ink">
              {theme.name}
            </span>

            <AgentStatus agents={agents} />

            <span className="font-pixel text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
              Hover a character
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
