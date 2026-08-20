import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import type { WorldLink } from '../../world/engine/renderer'
import { CharacterTooltip } from '../../components/CharacterCard/CharacterTooltip'
import { AgentInspector } from './AgentInspector'
import { WorldLabelLayer } from '../../world/labels/WorldLabelLayer'
import type { Theme } from '../../themes/types'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import { MAX_CONNECTIONS, findWorker, type Worker } from '../../agents/workers'

interface Props {
  engine: WorldEngine
  switching: boolean
  workers: Worker[]
  theme: Theme
}

interface Hover {
  id: string
  left: number
  top: number
}

/** How far the pointer must move on a character before it counts as a drag. */
const DRAG_SLOP = 5

/**
 * The world.
 *
 * The canvas fills the whole panel and the room is drawn through a camera, so
 * the office is as large as the window allows and the user can drag around it
 * and zoom in. Whole-number zoom only — a fractional scale would put sprite
 * edges between device pixels.
 *
 * The world is also part of the orchestration UI: dragging one character onto
 * another connects them, and every connection drawn here is one the main
 * process has accepted and persisted.
 */
export function WorldPanel({ engine, switching, workers, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  /** The gesture in progress: panning the camera, or pulling out a link. */
  const gesture = useRef<
    | { kind: 'pan'; x: number; y: number; moved: boolean }
    | { kind: 'link'; from: string; x: number; y: number; moved: boolean }
    | null
  >(null)

  const [hover, setHover] = useState<Hover | null>(null)
  const [zoom, setZoom] = useState(2)
  const [dragging, setDragging] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const views = useSyncExternalStore(engine.subscribeViews, engine.getViews)
  const setChatTarget = useBackstage((s) => s.setChatTarget)
  const setTab = useBackstage((s) => s.setTab)
  const setPage = useBackstage((s) => s.setPage)
  const setThread = useBackstage((s) => s.setThreadTarget)
  const collaboration = useBackstage((s) => s.collaboration)
  const connect = useTeam((s) => s.connect)
  const disconnect = useTeam((s) => s.disconnect)
  const cancel = useTeam((s) => s.cancel)

  const selected = useBackstage((s) => s.selectedAgentId)
  const selectAgent = useBackstage((s) => s.selectAgent)

  useEffect(() => {
    engine.setSelected(selected)
  }, [engine, selected])

  /** A short-lived message for a refused gesture. */
  const say = useCallback((text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 2600)
  }, [])

  /*
   * Linking two workers, whichever kind they are.
   *
   * Agents and sessions keep their relationships in different places — one
   * persisted with the roster, one in memory beside the processes — so the
   * call differs even though the gesture does not. Resolved here, once, so no
   * component above has to know there are two stores.
   */
  const link = useCallback(
    async (aId: string, bId: string, join: boolean): Promise<string | null> => {
      const a = findWorker(workers, aId)
      const b = findWorker(workers, bId)
      if (!a || !b) return 'That worker is no longer here.'
      if (a.kind !== b.kind) {
        return 'An agent and a CLI session cannot be connected.'
      }

      if (a.kind === 'cli') {
        if (!a.sessionId || !b.sessionId) return 'That session has ended.'
        const result = join
          ? await window.backstage.sessions.connect(a.sessionId, b.sessionId)
          : await window.backstage.sessions.disconnect(a.sessionId, b.sessionId)
        // Sessions are mirrored by their own change event, so nothing to
        // refresh here; the store updates when the main process announces it.
        return result.ok ? null : (result.error ?? 'Could not change that link.')
      }

      return join ? connect(aId, bId) : disconnect(aId, bId)
    },
    [workers, connect, disconnect]
  )

  /* ------------------------------------------------------------- links -- */

  /**
   * The links to draw, mirrored from the roster.
   *
   * A link is active for a moment after the pair actually exchanged
   * something, which is what makes a live hand-off visible without every
   * connection in the room animating all the time.
   */
  const links = useMemo<WorldLink[]>(() => {
    const now = Date.now()
    const recent = collaboration.filter((m) => now - m.at < 4000)
    const present = new Set(workers.map((w) => w.id))
    const seen = new Set<string>()
    const out: WorldLink[] = []

    /*
     * Built from the worker list rather than from the roster, so agent links
     * and session links are drawn by the same code. Both ends have to be in
     * the room: a connection to somebody who is not here is not something the
     * office can show.
     */
    for (const worker of workers) {
      for (const otherId of worker.connections) {
        if (!present.has(otherId)) continue
        const key = [worker.id, otherId].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          a: worker.id,
          b: otherId,
          active: recent.some(
            (m) =>
              (m.senderAgentId === worker.id && m.receiverAgentId === otherId) ||
              (m.senderAgentId === otherId && m.receiverAgentId === worker.id)
          )
        })
      }
    }
    return out
  }, [workers, collaboration])

  useEffect(() => {
    engine.setLinks(links)
  }, [engine, links])

  /** How many teammates each agent already has, for the drop rules. */
  const degree = useMemo(() => {
    const counts = new Map<string, number>()
    for (const link of links) {
      counts.set(link.a, (counts.get(link.a) ?? 0) + 1)
      counts.set(link.b, (counts.get(link.b) ?? 0) + 1)
    }
    return counts
  }, [links])

  /**
   * Who a link from this agent could legally land on.
   *
   * Mirrors the rules the main process enforces so the gesture can show its
   * own outcome — a target that would be refused is never highlighted, and
   * dropping on one says why instead of failing silently.
   */
  const droppableFor = useCallback(
    (fromId: string): string[] => {
      if ((degree.get(fromId) ?? 0) >= MAX_CONNECTIONS) return []
      const from = findWorker(workers, fromId)
      if (!from) return []
      return workers
        .filter(
          (w) =>
            // Like connects to like: there is no store that could hold a link
            // between a persisted agent and a running process.
            w.kind === from.kind &&
            w.id !== fromId &&
            !from.connections.includes(w.id) &&
            (degree.get(w.id) ?? 0) < MAX_CONNECTIONS
        )
        .map((w) => w.id)
    },
    [workers, degree]
  )

  /* ------------------------------------------------------------ canvas -- */

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
      if (!p || gesture.current) return
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

  /*
   * Pressing on a character starts a possible connection; pressing on the
   * floor pans. Which one it is cannot be known until the pointer moves, so
   * both begin as an undecided press and are resolved by the first movement.
   */
  const onDown = (e: React.MouseEvent) => {
    const p = local(e)
    const s = engine.toScene(p.x, p.y)
    const hit = engine.hitTest(s.x, s.y)
    const worker = findWorker(workers, hit?.id ?? null)

    if (hit && worker) {
      gesture.current = { kind: 'link', from: hit.id, x: p.x, y: p.y, moved: false }
    } else {
      gesture.current = { kind: 'pan', x: p.x, y: p.y, moved: false }
    }
    setDragging(true)
  }

  const onMove = (e: React.MouseEvent) => {
    const p = local(e)
    pointer.current = p
    const g = gesture.current
    if (!g) return

    const dx = p.x - g.x
    const dy = p.y - g.y
    if (!g.moved && Math.hypot(dx, dy) < DRAG_SLOP) return
    g.moved = true

    if (g.kind === 'pan') {
      engine.panBy(dx, dy)
      g.x = p.x
      g.y = p.y
      setHover(null)
      return
    }

    // Pulling a connection out of a character.
    const scene = engine.toScene(p.x, p.y)
    const over = engine.hitTest(scene.x, scene.y)
    const allowed = droppableFor(g.from)
    const target = over && over.id !== g.from ? over.id : null

    if (linking !== g.from) setLinking(g.from)
    engine.setPendingLink(
      {
        from: g.from,
        x: scene.x,
        y: scene.y,
        target: target && allowed.includes(target) ? target : null,
        blocked: !!target && !allowed.includes(target)
      },
      allowed
    )
    setHover(null)
  }

  const finish = () => {
    gesture.current = null
    setDragging(false)
    setLinking(null)
    engine.setPendingLink(null)
  }

  const onUp = (e: React.MouseEvent) => {
    const g = gesture.current
    if (!g) return finish()

    if (!g.moved) {
      /*
       * A press that did not move is a click: select whoever is under it.
       * Choosing someone in the world and choosing them in the TALK TO
       * selector are the same act, so both go through `setChatTarget`, which
       * carries the highlight with it.
       */
      const p = local(e)
      const s = engine.toScene(p.x, p.y)
      const hit = engine.hitTest(s.x, s.y)
      const next = hit?.id ?? null
      if (next) setChatTarget(next)
      else selectAgent(null)
      return finish()
    }

    if (g.kind === 'link') {
      const p = local(e)
      const s = engine.toScene(p.x, p.y)
      const over = engine.hitTest(s.x, s.y)

      if (over && over.id !== g.from) {
        const from = findWorker(workers, g.from)
        const target = findWorker(workers, over.id)
        const allowed = droppableFor(g.from)

        if (from && target && from.kind !== target.kind) {
          say('An agent and a CLI session cannot be connected.')
        } else if (!allowed.includes(over.id)) {
          say(
            (degree.get(g.from) ?? 0) >= MAX_CONNECTIONS ||
              (degree.get(over.id) ?? 0) >= MAX_CONNECTIONS
              ? 'Connection limit reached.'
              : 'Those two are already connected.'
          )
        } else {
          // The main process decides; a refusal is reported, never hidden.
          void link(g.from, over.id, true).then((error) => {
            if (error) say(error)
          })
        }
      }
    }

    finish()
  }

  const onLeave = () => {
    pointer.current = null
    engine.setHovered(null)
    setHover(null)
    finish()
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

  const hoveredView = hover ? views.find((v) => v.characterId === hover.id) : undefined
  const selectedWorker = findWorker(workers, selected)
  const selectedChar = engine.characterFor(selected)

  /** The teammates of whoever is selected, as workers. */
  const connections = useMemo(() => {
    if (!selectedWorker) return []
    return selectedWorker.connections
      .map((id) => findWorker(workers, id))
      .filter((w): w is Worker => w !== null)
  }, [selectedWorker, workers])

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
          style={{
            cursor: linking
              ? 'crosshair'
              : dragging
                ? 'grabbing'
                : hover
                  ? 'pointer'
                  : 'grab'
          }}
        />

        {/*
          Names and statuses, as DOM over the canvas. They follow characters
          around the room but are sized independently of the camera, so they
          stay readable however far out the user zooms.
        */}
        <WorldLabelLayer
          engine={engine}
          hoveredId={hover?.id ?? null}
          selectedId={selected}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 bg-ink"
          style={{
            opacity: switching ? 1 : 0,
            transition: `opacity ${switching ? 200 : 260}ms steps(5, end)`
          }}
        />

        {hover && hoveredView && hover.id !== selected && !linking && (
          <CharacterTooltip
            agent={hoveredView}
            left={hover.left}
            top={hover.top - 6}
          />
        )}

        {/* Why a gesture was refused, said where the gesture happened. */}
        {(notice || linking) && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2">
            <p
              className={[
                'border-2 px-2 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.08em]',
                notice
                  ? 'border-rust bg-paper text-rust'
                  : 'border-ink bg-brand text-ink'
              ].join(' ')}
            >
              {notice ?? 'Connecting… drop on a teammate'}
            </p>
          </div>
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

        {selectedWorker && selectedChar && (
          <AgentInspector
            worker={selectedWorker}
            character={selectedChar}
            cast={theme.characters}
            others={workers}
            connections={connections}
            onFocus={() => engine.focusOn(selectedChar.id)}
            onClose={() => selectAgent(null)}
            onViewTask={() => {
              setChatTarget(selectedWorker.id)
              setTab('tasks')
            }}
            /*
             * An agent's character, instructions and permissions live together
             * in the editor, so Settings goes there. A session has no such
             * record — only a name and a face — so its Settings is the
             * character picker in this panel.
             */
            onSettings={
              selectedWorker.kind === 'agent'
                ? () => {
                    selectAgent(selectedWorker.id)
                    setPage('agents')
                  }
                : null
            }
            onRecast={(slot) => {
              if (selectedWorker.kind !== 'cli' || !selectedWorker.sessionId) return
              void window.backstage.sessions.setCharacter(
                selectedWorker.sessionId,
                slot
              )
            }}
            onOpenChat={() => {
              setThread(null)
              setChatTarget(selectedWorker.id)
              setTab('messages')
            }}
            onOpenThread={() => {
              setThread(selectedWorker.id)
              setTab('messages')
            }}
            onStop={() => {
              if (selectedWorker.kind === 'cli') {
                if (selectedWorker.sessionId) {
                  void window.backstage.sessions.interrupt(selectedWorker.sessionId)
                }
              } else {
                void cancel(selectedWorker.id)
              }
            }}
            onConnect={(otherId) => {
              void link(selectedWorker.id, otherId, true).then((error) => {
                if (error) say(error)
              })
            }}
            onDisconnect={(otherId) => {
              void link(selectedWorker.id, otherId, false).then((error) => {
                if (error) say(error)
              })
            }}
            onRename={(name) => {
              if (selectedWorker.kind !== 'cli' || !selectedWorker.sessionId) return
              void window.backstage.sessions
                .rename(selectedWorker.sessionId, name)
                .then((result) => {
                  if (!result.ok && result.error) say(result.error)
                })
            }}
          />
        )}
      </div>
    </section>
  )
}
