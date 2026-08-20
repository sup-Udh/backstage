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

/**
 * How many rows a label may be pushed away from its character to clear one
 * already placed.
 *
 * Capped rather than unbounded: past a few rows the label is far enough from
 * the head that it stops reading as belonging to anyone, at which point
 * overlapping the neighbour is the lesser problem.
 */
const MAX_STACK = 3

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
    return engine.subscribeFrame((anchors) => {
      const cam = engine.getCamera()
      if (cam.scale !== zoom) setZoom(cam.scale)

      const placed: Rect[] = []

      /*
       * Front to back, matching the order the renderer draws bodies in. A
       * character nearer the viewer keeps the position their label wants, and
       * anyone behind them stacks away from it — so the label that gets moved
       * is the one belonging to the character already partly hidden.
       */
      for (const a of [...anchors].sort((p, q) => q.feet - p.feet)) {
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

          /*
           * Horizontally the label is nailed to its character, and that is not
           * negotiable.
           *
           * It used to be allowed to shoulder sideways to dodge a neighbour,
           * which is what made tags appear to come loose while panning and
           * zooming: a label offset by half its own width has nothing tying it
           * to the person it names, and every change in zoom re-decided which
           * labels were colliding, so they slid about independently of the
           * cast. Vertical stacking keeps the tag directly over the head, and
           * "directly over" is the entire reason anyone can tell whose it is.
           */
          const x = Math.round(a.x - w / 2)
          let y = Math.round(kind === 'name' ? a.head - GAP - h : a.feet + GAP)

          // Names climb away from the head, statuses drop away from the feet.
          const step = kind === 'name' ? -(h + 2) : h + 2
          for (let i = 0; i < MAX_STACK; i++) {
            if (!placed.some((p) => overlaps({ x, y, w, h }, p))) break
            y += step
          }

          placed.push({ x, y, w, h })
          el.style.opacity = '1'
          /*
           * Whole pixels, and a 2D translate — `translate3d` would promote
           * each label to its own compositor layer, which is what made tags
           * lag a frame behind the canvas while panning. See WorldLabel.
           */
          el.style.transform = `translate(${x}px, ${y}px)`
        }
      }
    })
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
