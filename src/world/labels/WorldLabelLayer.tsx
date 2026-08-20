import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { WorldEngine } from '../engine/WorldEngine'
import { STATUS_GLYPH, STATUS_LABEL } from '../../characters/character.states'
import type { AgentStatus } from '../../agents/agent.types'
import { WorldLabel, type LabelTone } from './WorldLabel'
import { labelFontSize } from './labelSpec'

interface Props {
  engine: WorldEngine
  /** The character under the cursor. Its hover card supersedes its label. */
  hoveredId?: string | null
  /** The character the user is talking to, if any. */
  selectedId?: string | null
}

/** Statuses that read as "this agent is doing something". */
const ACTIVE: AgentStatus[] = ['working', 'thinking', 'talking', 'success']

/**
 * Clearance between a label and the character it belongs to, in CSS pixels.
 *
 * Small, because the pair has to read as one unit — name, character, status
 * stacked tightly enough that a crowded room still shows which label belongs
 * to whom.
 */
const GAP = 3
/** Clearance from the edge of the viewport. */
const EDGE = 2

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * Labels for the characters in a pixel world.
 *
 * The one piece of text in the world that is *not* painted into the scene.
 * Everything else — furniture, signage, the characters themselves — is pixel
 * art at scene resolution, upscaled by a whole-number camera. Text cannot
 * survive that: at the zoom where the room reads well, a glyph five scene
 * pixels tall is unreadable, and making it bigger in scene space would mean
 * making it bigger than the people it labels.
 *
 * So the labels live here instead, as DOM over the canvas: rendered by the
 * browser at the display's own resolution, sized independently of the camera
 * but positioned by it, so they stay attached to characters who are walking
 * around.
 *
 * Nothing in here re-renders per frame. React draws the labels when an agent's
 * name or status changes — a few times a minute — and the animation loop only
 * writes `transform` on nodes that already exist. A world with eight agents in
 * it costs eight style writes a frame, not eight component renders.
 */
export function WorldLabelLayer({ engine, hoveredId, selectedId }: Props) {
  const views = useSyncExternalStore(engine.subscribeViews, engine.getViews)

  /*
   * Zoom is React state because it changes the rendered font size, which is a
   * real re-render. It only moves when the user zooms, so this is cheap.
   */
  const [zoom, setZoom] = useState(() => engine.getCamera().scale)

  const nodes = useRef(new Map<string, HTMLDivElement>())
  const sizes = useRef(new Map<string, Rect>())

  const register = (key: string) => (el: HTMLDivElement | null) => {
    if (el) nodes.current.set(key, el)
    else {
      nodes.current.delete(key)
      sizes.current.delete(key)
    }
  }

  /*
   * Measure once per render rather than once per frame. Reading offsetWidth in
   * the animation loop would force a layout on every tick; the sizes only
   * change when the text or the font size does, which is exactly when this
   * effect runs.
   */
  const measure = () => {
    for (const [key, el] of nodes.current) {
      sizes.current.set(key, { x: 0, y: 0, w: el.offsetWidth, h: el.offsetHeight })
    }
  }

  useLayoutEffect(measure, [views, zoom, hoveredId, selectedId])

  // Web fonts settle after first paint, and a label measured in the fallback
  // face would be laid out at the wrong width.
  useEffect(() => {
    let live = true
    void document.fonts?.ready.then(() => {
      if (live) measure()
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let raf = 0

    const frame = () => {
      raf = requestAnimationFrame(frame)

      const cam = engine.getCamera()
      if (cam.scale !== zoom) setZoom(cam.scale)

      const { width: viewW, height: viewH } = engine.getViewport()
      const anchors = engine.getLabelAnchors()
      const placed: Rect[] = []

      // Left to right, so a crowd resolves the same way every frame rather
      // than flickering between arrangements.
      for (const a of [...anchors].sort((p, q) => p.x - q.x)) {
        const hidden = !a.onScreen || a.agentId === hoveredId

        for (const kind of ['name', 'status'] as const) {
          const key = `${a.agentId}:${kind}`
          const el = nodes.current.get(key)
          const size = sizes.current.get(key)
          if (!el || !size || size.w === 0) continue

          if (hidden) {
            el.style.opacity = '0'
            continue
          }

          const { w, h } = size
          // Names sit above the head and statuses below the feet, so the two
          // never stack into a tower and the character stays between them.
          const baseX = a.x - w / 2
          const baseY = kind === 'name' ? a.head - GAP - h : a.feet + GAP

          /*
           * Candidates in priority order: straight on, then shouldered left or
           * right, then pushed further out. The first that clears everything
           * already placed wins; if a crowd leaves nothing free, the last is
           * used, which is the most displaced and so the least likely to sit
           * on top of a neighbour.
           */
          const step = kind === 'name' ? -(h + 3) : h + 3
          const shoulder = w * 0.55
          const candidates: [number, number][] = [
            [0, 0],
            [-shoulder, 0],
            [shoulder, 0],
            [0, step],
            [-shoulder, step],
            [shoulder, step],
            [0, step * 2]
          ]

          let spot: Rect | null = null
          for (const [dx, dy] of candidates) {
            const rect = {
              x: Math.round(baseX + dx),
              y: Math.round(baseY + dy),
              w,
              h
            }
            spot = rect
            if (!placed.some((p) => overlaps(rect, p))) break
          }

          if (!spot) continue
          placed.push(spot)
          el.style.opacity = '1'
          // Whole pixels: a label on a half pixel is a blurred label.
          el.style.transform = `translate3d(${spot.x}px, ${spot.y}px, 0)`
        }
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [engine, hoveredId, zoom])

  const nameSize = labelFontSize('character-name', zoom)
  const statusSize = labelFontSize('character-status', zoom)

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {views.map((v) => {
        const active = ACTIVE.includes(v.status)
        const chosen = v.characterId === selectedId
        const nameTone: LabelTone = chosen ? 'selected' : 'default'
        const statusTone: LabelTone = chosen
          ? 'selected'
          : active
            ? 'active'
            : 'muted'

        return (
          <div key={v.characterId}>
            <WorldLabel
              ref={register(`${v.characterId}:name`)}
              kind="character-name"
              text={v.name}
              fontSize={nameSize}
              tone={nameTone}
            />
            <WorldLabel
              ref={register(`${v.characterId}:status`)}
              kind="character-status"
              text={STATUS_LABEL[v.status]}
              glyph={STATUS_GLYPH[v.status]}
              fontSize={statusSize}
              tone={statusTone}
            />
          </div>
        )
      })}
    </div>
  )
}
