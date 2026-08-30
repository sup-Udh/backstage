import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import type { WorldLink } from '../../world/engine/renderer'
import { CharacterTooltip } from '../../components/CharacterCard/CharacterTooltip'
import { AgentInspector } from './AgentInspector'
import { WorldLabelLayer } from '../../world/labels/WorldLabelLayer'
import type { CharacterDef } from '../../characters/character.types'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam, type LinkOutcome } from '../../stores/teamStore'
import { MAX_CONNECTIONS, findWorker, type Worker } from '../../agents/workers'

interface Props {
  engine: WorldEngine
  switching: boolean
  workers: Worker[]
  /** The project's cast, offered when re-casting a CLI session. */
  cast: CharacterDef[]
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
export function WorldPanel({ engine, switching, workers, cast }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  /**
   * The gesture in progress.
   *
   * Only one kind now. Pressing on the floor used to pan the camera; there is
   * no camera, so pressing on the floor is a click that clears the selection
   * and nothing more.
   */
  const gesture = useRef<{
    from: string
    x: number
    y: number
    moved: boolean
  } | null>(null)

  const [hover, setHover] = useState<Hover | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; tone: 'error' | 'info' } | null>(
    null
  )
  /** A connection the user clicked, and where to put its menu. */
  const [linkMenu, setLinkMenu] = useState<{
    a: string
    b: string
    left: number
    top: number
  } | null>(null)

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

  /**
   * A short-lived message about a gesture.
   *
   * Carries its own tone, because "that is not allowed" and "that worked, and
   * here is what it changed" must not look the same.
   */
  const say = useCallback((text: string, tone: 'error' | 'info' = 'error') => {
    const next = { text, tone }
    setNotice(next)
    window.setTimeout(() => setNotice((n) => (n === next ? null : n)), 3200)
  }, [])

  /** Report whichever of the two a link operation produced. */
  const report = useCallback(
    (outcome: LinkOutcome) => {
      if (outcome.error) say(outcome.error, 'error')
      else if (outcome.notice) say(outcome.notice, 'info')
    },
    [say]
  )

  /*
   * Linking two workers, whichever kind they are.
   *
   * Agents and sessions keep their relationships in different places — one
   * persisted with the roster, one in memory beside the processes — so the
   * call differs even though the gesture does not. Resolved here, once, so no
   * component above has to know there are two stores.
   */
  const link = useCallback(
    async (aId: string, bId: string, join: boolean): Promise<LinkOutcome> => {
      const a = findWorker(workers, aId)
      const b = findWorker(workers, bId)
      if (!a || !b) return { error: 'That worker is no longer here.' }
      if (a.kind !== b.kind) {
        return { error: 'An agent and a CLI session cannot be connected.' }
      }

      if (a.kind === 'cli') {
        if (!a.sessionId || !b.sessionId) return { error: 'That session has ended.' }
        const result = join
          ? await window.backstage.sessions.connect(a.sessionId, b.sessionId)
          : await window.backstage.sessions.disconnect(a.sessionId, b.sessionId)
        // Sessions are mirrored by their own change event, so nothing to
        // refresh here; the store updates when the main process announces it.
        return result.ok ? {} : { error: result.error ?? 'Could not change that link.' }
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

        /*
         * The lead is drawn first, so the arrowhead points at the worker.
         *
         * Which of the pair is reached first depends on the order of the
         * worker list, so the direction has to be resolved rather than
         * assumed — otherwise the same relationship would draw its arrow one
         * way or the other depending on who was spawned first.
         */
        const other = findWorker(workers, otherId)
        const leads = worker.leads.includes(otherId)
        const ledBy = other?.leads.includes(worker.id) ?? false
        const a = ledBy ? otherId : worker.id
        const b = ledBy ? worker.id : otherId

        out.push({
          a,
          b,
          directed: leads || ledBy,
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

  /**
   * The team lead's links, which nobody drew.
   *
   * The lead may hand work to anyone in its project — that is what nominating
   * one *means*, and the main process has always enforced it that way. The
   * office, though, only drew links the user had dragged out by hand, so in
   * every project where they had not the room showed a team with no
   * relationships while the lead was visibly running it. That is the whole of
   * "the head is not detected on the other themes": the detective office had
   * hand-drawn connections and no other project did.
   *
   * Derived rather than stored, so nothing is written to the roster on the
   * user's behalf, and drawn faintly so a connection somebody actually made
   * still reads as the stronger statement.
   */
  const leadLinks = useMemo<WorldLink[]>(() => {
    const lead = workers.find((w) => w.isLead)
    if (!lead) return []

    const now = Date.now()
    const recent = collaboration.filter((m) => now - m.at < 4000)
    const drawn = new Set(links.map((l) => [l.a, l.b].sort().join('|')))

    return workers
      .filter((w) => w.kind === 'agent' && w.id !== lead.id)
      .filter((w) => !drawn.has([lead.id, w.id].sort().join('|')))
      .map((w) => ({
        a: lead.id,
        b: w.id,
        directed: true,
        derived: true,
        active: recent.some(
          (m) =>
            (m.senderAgentId === lead.id && m.receiverAgentId === w.id) ||
            (m.senderAgentId === w.id && m.receiverAgentId === lead.id)
        )
      }))
  }, [workers, links, collaboration])

  const allLinks = useMemo(() => [...links, ...leadLinks], [links, leadLinks])

  useEffect(() => {
    engine.setLinks(allLinks)
  }, [engine, allLinks])

  /**
   * How many teammates each agent already has, for the drop rules.
   *
   * Counted from the drawn links only. The lead's derived links are not
   * connections the user made and must not consume their allowance — counting
   * them would let one nomination fill every agent's quota and make the
   * drag-to-connect gesture refuse everything in the room.
   */
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
    /*
     * The engine lays the room out to fit this canvas. There is nothing to
     * fit *to* afterwards — the office is exactly as large as the panel, so
     * resizing the window changes how much office there is rather than how
     * much of it is visible.
     */
    engine.setViewport(w, h)
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
        const { scale } = engine.getCamera()
        const left = Math.round(hit.x) * scale
        const top = Math.round(hit.y) * scale
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

  /**
   * Pressing on a character starts a possible connection.
   *
   * Pressing on the floor used to begin a pan; with the room fitted to the
   * panel there is nowhere to pan to, so it is simply a press that will turn
   * out to be a click.
   */
  const onDown = (e: React.MouseEvent) => {
    const p = local(e)
    const s = engine.toScene(p.x, p.y)
    const hit = engine.hitTest(s.x, s.y)
    const worker = findWorker(workers, hit?.id ?? null)
    if (!hit || !worker) return

    gesture.current = { from: hit.id, x: p.x, y: p.y, moved: false }
  }

  const onMove = (e: React.MouseEvent) => {
    const p = local(e)
    pointer.current = p
    const g = gesture.current
    if (!g) return

    if (!g.moved && Math.hypot(p.x - g.x, p.y - g.y) < DRAG_SLOP) return
    g.moved = true

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
    setLinking(null)
    engine.setPendingLink(null)
  }

  const onUp = (e: React.MouseEvent) => {
    const g = gesture.current
    const p = local(e)
    const s = engine.toScene(p.x, p.y)

    /*
     * A press that did not move — on a character or on the floor — is a click.
     */
    if (!g || !g.moved) {
      const hit = engine.hitTest(s.x, s.y)

      if (hit) {
        /*
         * Choosing someone in the world and choosing them in the TALK TO
         * selector are the same act, so both go through `setChatTarget`, which
         * carries the highlight with it.
         */
        setLinkMenu(null)
        setChatTarget(hit.id)
        return finish()
      }

      /*
       * No character, so try the connection lines. Asked second on purpose: a
       * link passing behind somebody must never steal the click on them.
       */
      const onLink = engine.hitTestLink(s.x, s.y)
      if (onLink) {
        const { scale } = engine.getCamera()
        setLinkMenu({
          a: onLink.a,
          b: onLink.b,
          left: Math.round(onLink.x * scale),
          top: Math.round(onLink.y * scale)
        })
        return finish()
      }

      setLinkMenu(null)
      selectAgent(null)
      return finish()
    }

    // A drag that started on a character: a connection, if it landed on one.
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
        /*
         * The agent the drag started from becomes the lead. The main process
         * decides whether the link is allowed at all; a refusal is reported,
         * never hidden.
         */
        void link(g.from, over.id, true).then(report)
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
          className="pixelated block"
          /*
           * No grab cursor: there is nothing to grab. The room is the size of
           * the panel, so the only things the pointer does here are pick a
           * character and pull a connection out of one.
           */
          style={{ cursor: linking ? 'crosshair' : hover ? 'pointer' : 'default' }}
        />

        {/*
          Names and statuses, as DOM over the canvas. They follow characters
          around the room but are sized independently of it, so they stay
          readable whatever scale the room ended up at.
        */}
        <WorldLabelLayer
          engine={engine}
          hoveredId={hover?.id ?? null}
          selectedId={selected}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 bg-slate"
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

        {/*
          The menu for a connection the user clicked. Anchored to the middle
          of the line so it is obvious which relationship it belongs to when
          several are on screen.
        */}
        {linkMenu &&
          (() => {
            const a = findWorker(workers, linkMenu.a)
            const b = findWorker(workers, linkMenu.b)
            if (!a || !b) return null
            /*
             * A derived link has nothing behind it to delete, so the menu says
             * what it is instead of offering a Remove that would silently do
             * nothing.
             */
            const derived = leadLinks.some(
              (l) =>
                (l.a === linkMenu.a && l.b === linkMenu.b) ||
                (l.a === linkMenu.b && l.b === linkMenu.a)
            )
            return (
              <div
                className="absolute z-30 -translate-x-1/2 -translate-y-full border-2 border-ink bg-cream shadow-[3px_3px_0_0_var(--color-shadow)]"
                style={{ left: linkMenu.left, top: linkMenu.top - 6 }}
              >
                {/*
                  Named in the direction work flows. `hitTestLink` returns the
                  link as it was built, and those are built lead-first — so
                  "Jane → Lisbon" is a statement about who assigns to whom, not
                  just which end was clicked.
                */}
                <p className="border-b-2 border-rule px-2 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink">
                  {a.name} {a.leads.includes(b.id) ? '→' : '↔'} {b.name}
                </p>
                {(derived || a.leads.includes(b.id)) && (
                  <p className="border-b-2 border-rule px-2 py-1 font-ui text-[11px] leading-snug text-ink-3">
                    {derived
                      ? `${a.name} is this project's team lead, so ALL AGENTS work reaches ${b.name} through them. Change the lead in Settings.`
                      : `${a.name} leads. ${b.name} reports back.`}
                  </p>
                )}
                {/*
                  A connection is a conversation, so the first thing the menu
                  offers is the conversation. Clicking a link used to lead only
                  to removing it, which meant the one gesture that reveals a
                  collaboration exists could not open it.
                */}
                <button
                  type="button"
                  onClick={() => {
                    setThread(linkMenu.a)
                    setTab('messages')
                    setLinkMenu(null)
                  }}
                  className="block w-full border-b-2 border-rule px-2 py-1 text-left font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand"
                >
                  Open group chat →
                </button>

                <div className="flex">
                  {!derived && (
                    <button
                      type="button"
                      onClick={() => {
                        void link(linkMenu.a, linkMenu.b, false).then(report)
                        setLinkMenu(null)
                      }}
                      className="flex-1 px-2 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-rust transition-colors hover:bg-rust hover:text-on-slate"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLinkMenu(null)}
                    aria-label="Close"
                    className={`px-2 py-1 font-mono text-[10px] text-ink-3 transition-colors hover:text-ink ${
                      derived ? 'flex-1' : 'border-l-2 border-rule'
                    }`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })()}

        {/* Why a gesture was refused, said where the gesture happened. */}
        {(notice || linking) && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2">
            <p
              className={[
                'border-2 px-2 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.08em]',
                notice?.tone === 'error'
                  ? 'border-rust bg-paper text-rust'
                  : 'border-ink bg-brand text-on-brand'
              ].join(' ')}
            >
              {notice?.text ?? 'Connecting… drop on a teammate'}
            </p>
          </div>
        )}

        {/*
          There are no camera controls. The room is laid out to fit this panel,
          so there is nothing to zoom into and nowhere to pan to — and a zoom
          button that only ever re-rendered the same view would be a control
          that appears broken.
        */}

        {selectedWorker && selectedChar && (
          <AgentInspector
            worker={selectedWorker}
            character={selectedChar}
            cast={cast}
            others={workers}
            connections={connections}
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
            onConnect={(otherId) => void link(selectedWorker.id, otherId, true).then(report)}
            onDisconnect={(otherId) =>
              void link(selectedWorker.id, otherId, false).then(report)
            }
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
