import { EventEmitter } from 'node:events'
import { terminals, type SessionAgent } from './TerminalSessionManager'
import type { AgentActivity } from '../src/shared/activity'
import { ACTIVITY_LABEL, statusForActivity } from '../src/shared/activity'
import type { SessionActivity } from './claudeActivity'

/**
 * External CLI agent sessions.
 *
 * When the user runs `claude` or `codex` inside a Backstage terminal, the CLI
 * is doing the work — Backstage is the visual shell around it. This layer is
 * what turns that real process into something the world can draw: a session
 * with a status that follows the process, not a simulation of one.
 *
 * Status is inferred only from things actually observable: the process is
 * alive or it is not, and it has produced output recently or it has gone
 * quiet. Nothing here guesses at what the CLI is thinking.
 */

export type AgentSessionStatus = 'starting' | 'working' | 'waiting' | 'exited' | 'error'

export interface AgentSession {
  id: string
  projectId: string | null
  /** Which CLI is running. */
  provider: SessionAgent
  terminalSessionId: string
  cwd: string
  status: AgentSessionStatus
  startedAt: number
  endedAt?: number
  /** Last line of output, trimmed, for the activity feed. */
  lastOutput?: string
  /**
   * What this session is called: "Claude 1" until the user renames it.
   *
   * Held here rather than written to disk on purpose. A name identifies a
   * running process, and no PTY survives the app closing — persisting one
   * would mean restoring a label for something that no longer exists and
   * attaching it to whichever unrelated session happened to take the same id
   * next launch. It lives exactly as long as the thing it names.
   */
  name: string
  /**
   * Which of the active theme's characters stands in for this session.
   *
   * -1 until somebody decides. The renderer picks a free character when the
   * user has not, because choosing one requires knowing the theme's cast.
   */
  characterSlot: number
  /** True once the user picked deliberately, so nothing reassigns it. */
  characterChosen: boolean
  /** Other sessions this one is connected to. Derived, never stored. */
  connections: string[]
  /**
   * What this session is doing, in the same vocabulary every agent uses.
   *
   * Carried on the session record rather than on a channel of its own, so it
   * reaches the renderer through the push that already exists — the world, the
   * selector, the chat header and the activity panel all read the session
   * list, and none of them needs to learn a second subscription to learn what
   * Claude is doing.
   *
   * Null until the session says something recognisable. That is the honest
   * resting value: a process producing output whose content we cannot classify
   * is working, and the status field already says so.
   */
  activity: AgentActivity | null
}

/**
 * How long a session must be silent before it is considered to be waiting on
 * the user rather than working. CLI agents print steadily while they work and
 * then stop at a prompt, so silence is the honest signal available.
 */
const IDLE_AFTER_MS = 2500

/**
 * The slot a session is given when the user has not chosen one.
 *
 * Deliberately a placeholder rather than an attempt at a free character. Slots
 * wrap around the active theme's cast, and this process has no idea how large
 * that is or which characters are already at a desk — an earlier version
 * offset these past the configured team and claimed that avoided collisions,
 * which was wrong the moment the cast size and the offset matched: every
 * theme has eight characters, so slot 8 wrapped straight back onto slot 0 and
 * the first Claude session appeared wearing Jane's face.
 *
 * Choosing a free character needs the theme, so the renderer does it. What is
 * held here is only what the user explicitly picked.
 */
const UNASSIGNED_SLOT = -1

class AgentSessions extends EventEmitter {
  private sessions = new Map<string, AgentSession>()
  private lastOutputAt = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null
  /**
   * How many sessions each CLI has had this run.
   *
   * Never decremented. Closing Claude 1 and opening another must produce
   * Claude 3, not a second Claude 1 — two sessions with the same name in one
   * transcript is precisely the confusion the numbering exists to prevent.
   */
  private counts = new Map<string, number>()

  constructor() {
    super()

    terminals.on('agent', ({ id, projectId, agent, cwd }) => {
      const kind: string = agent ?? 'cli'
      // Project-scoped counting
      const countKey = projectId ? `${projectId}:${kind}` : kind
      const n = (this.counts.get(countKey) ?? 0) + 1
      this.counts.set(countKey, n)

      const session: AgentSession = {
        id: `session-${id}`,
        projectId: projectId || null,
        provider: agent,
        terminalSessionId: id,
        cwd,
        status: 'starting',
        startedAt: Date.now(),
        name: `${kind.replace(/^./, (c) => c.toUpperCase())} ${n}`,
        characterSlot: UNASSIGNED_SLOT,
        characterChosen: false,
        connections: [],
        activity: null
      }
      this.sessions.set(session.id, session)
      this.lastOutputAt.set(session.id, Date.now())
      this.emit('started', session)
      this.emit('changed', this.list())
      this.ensureTimer()
    })

    terminals.on('output', ({ id, data }) => {
      const session = this.byTerminal(id)
      if (!session || session.status === 'exited') return
      this.lastOutputAt.set(session.id, Date.now())

      const line = lastMeaningfulLine(data)
      if (line) session.lastOutput = line

      if (session.status !== 'working') {
        session.status = 'working'
        this.emit('changed', this.list())
      }
    })

    terminals.on('exit', ({ id, exitCode }) => {
      const session = this.byTerminal(id)
      if (!session) return
      // A dead process must never be shown as working.
      session.status = exitCode === 0 ? 'exited' : 'error'
      session.endedAt = Date.now()
      /*
       * And it must never be shown as still reading a file. A session that has
       * ended keeps an error badge if it failed, because that is the thing the
       * user needs to see, and loses everything else.
       */
      session.activity =
        exitCode === 0
          ? null
          : this.buildActivity(session, {
              type: 'error',
              detail: `exited with code ${exitCode}`,
              detailFull: `The session ended with exit code ${exitCode}.`
            })
      // A connection to a process that has stopped is not a connection. It
      // would otherwise keep occupying a slot on whoever it was linked to.
      this.unlinkAll(session.id)
      this.emit('ended', session)
      this.emit('changed', this.list())
    })
  }

  private ensureTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      let changed = false
      const now = Date.now()
      for (const s of this.sessions.values()) {
        if (s.status !== 'working') continue
          const quietFor = now - (this.lastOutputAt.get(s.id) ?? now)
        if (quietFor > IDLE_AFTER_MS) {
          s.status = 'waiting'
          /*
           * Quiet at its prompt. That is not idleness and not a hang: the CLI
           * has finished its turn and is waiting to be told something, which
           * is a state the user can act on. An approval prompt is left alone —
           * it is also silent, and it is a different question.
           */
          if (s.activity?.type !== 'waiting_for_permission') {
            s.activity = this.buildActivity(s, {
              type: 'waiting_for_user',
              detail: null,
              detailFull: null
            })
          }
          changed = true
        }
      }
      if (changed) this.emit('changed', this.list())
    }, 1000)
    this.timer.unref?.()
  }

  /**
   * Turn a classifier result into a full activity.
   *
   * The session id is the identity, never the display name: renaming Claude 1
   * to Michael must not detach it from its own activity, and two sessions must
   * never be able to collide on a name.
   */
  private buildActivity(
    session: AgentSession,
    input: SessionActivity
  ): AgentActivity {
    return {
      agentId: session.id,
      projectId: session.projectId ?? '',
      type: input.type,
      label: input.label ?? ACTIVITY_LABEL[input.type],
      detail: input.detail,
      detailFull: input.detailFull ?? input.detail,
      startedAt: Date.now(),
      status: statusForActivity(input.type),
      toolName: null,
      filePath: input.filePath ?? null,
      command: input.command ?? null,
      progress: null
    }
  }

  /**
   * Record what a session is doing, from its own output.
   *
   * Keyed by session id, so Claude 1 reading a file cannot move Claude 2's
   * badge — the requirement the Claude brief puts at §9 and the reason there
   * is no "current session" anywhere in this class.
   */
  setActivity(sessionId: string, input: SessionActivity | null): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status === 'exited') return

    if (input === null) {
      if (session.activity === null) return
      session.activity = null
      this.emit('changed', this.list())
      return
    }

    const previous = session.activity
    const next = this.buildActivity(session, input)
    // Same work, same clock. A banner reprinted by a repaint is not a new read.
    if (
      previous &&
      previous.type === next.type &&
      previous.detailFull === next.detailFull
    ) {
      return
    }

    session.activity = next
    /*
     * A session that is producing recognisable output is working, whatever the
     * idle timer last concluded. Without this a banner arriving after a quiet
     * spell would leave the status saying "waiting" while the activity said
     * "reading" — two views of one session disagreeing, which is the exact
     * failure this whole pass exists to remove.
     */
    if (next.status === 'working' || next.status === 'thinking') {
      session.status = 'working'
    } else if (next.status === 'waiting') {
      session.status = 'waiting'
    }
    this.lastOutputAt.set(sessionId, Date.now())
    this.emit('changed', this.list())
  }

  private byTerminal(terminalId: string): AgentSession | undefined {
    for (const s of this.sessions.values()) {
      if (s.terminalSessionId === terminalId && s.status !== 'exited') return s
    }
    return undefined
  }

  list(): AgentSession[] {
    return [...this.sessions.values()].map((s) => ({
      ...s,
      connections: this.connectionsOf(s.id)
    }))
  }

  get(id: string): AgentSession | undefined {
    const s = this.sessions.get(id)
    return s ? { ...s, connections: this.connectionsOf(s.id) } : undefined
  }

  /** Sessions still attached to a live process. */
  active(): AgentSession[] {
    return this.list().filter((s) => s.status !== 'exited' && s.status !== 'error')
  }

  /**
   * Rename a session.
   *
   * Names have to stay unique, because they are how the user tells two
   * sessions apart everywhere else in the app — a second "Auth review" in the
   * selector would make choosing between them a guess. A collision is
   * refused rather than silently suffixed, so the user finds out immediately.
   */
  rename(id: string, name: string): { ok: boolean; error?: string } {
    const session = this.sessions.get(id)
    if (!session) return { ok: false, error: 'That session no longer exists.' }

    const trimmed = name.trim().slice(0, 40)
    if (!trimmed) return { ok: false, error: 'A session needs a name.' }
    if (trimmed === session.name) return { ok: true }

    const taken = [...this.sessions.values()].some(
      (s) => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (taken) return { ok: false, error: `Another session is already called "${trimmed}".` }

    session.name = trimmed
    this.emit('changed', this.list())
    return { ok: true }
  }

  /**
   * Put a session in front of a different character.
   *
   * Marks the choice as the user's, which stops the renderer from reassigning
   * it later while looking for a free face. Someone who deliberately put
   * Claude 1 on the same character as an agent gets to keep that.
   */
  setCharacter(id: string, slot: number): boolean {
    const session = this.sessions.get(id)
    if (!session || !Number.isFinite(slot)) return false
    session.characterSlot = Math.max(0, Math.floor(slot))
    session.characterChosen = true
    this.emit('changed', this.list())
    return true
  }

  /**
   * Stop what a session is doing, without ending it.
   *
   * SIGINT through the PTY, which is exactly what pressing Ctrl-C in the
   * terminal would do — the CLI abandons its current turn and returns to its
   * prompt, and the session, its history and its context survive. That is the
   * distinction the stop button needs: the user wants the work to end, not
   * the assistant they have been talking to for twenty minutes.
   *
   * Killing the process is a separate, louder act and stays on `close`.
   */
  interrupt(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session || session.status === 'exited') return false
    const sent = terminals.write(session.terminalSessionId, '\x03')
    if (!sent) return false

    /*
     * Report waiting straight away rather than leaving the character working
     * until the idle timer notices the output stopped. The interrupt has been
     * delivered; showing it as still running for another two seconds would be
     * the interface disagreeing with what the user just did.
     */
    if (session.status === 'working') {
      session.status = 'waiting'
      session.activity = this.buildActivity(session, {
        type: 'stopped',
        detail: null,
        detailFull: null
      })
      this.lastOutputAt.set(session.id, Date.now())
      this.emit('changed', this.list())
    }
    return true
  }

  /** Sessions belonging to a PTY that has gone away. */
  forgetTerminal(terminalId: string): void {
    let changed = false
    for (const s of this.sessions.values()) {
      if (s.terminalSessionId !== terminalId) continue
      this.unlinkAll(s.id)
      this.sessions.delete(s.id)
      changed = true
    }
    if (changed) this.emit('changed', this.list())
  }

  /* ------------------------------------------------------ collaboration -- */

  /**
   * Which sessions are connected to which.
   *
   * In memory, like the names, and for the same reason: a link between two
   * processes cannot outlive them. Persisting one would mean restoring a
   * relationship between two things that no longer exist.
   *
   * Deliberately a separate store from the agents' `canTalkTo` rather than a
   * shared one. An agent's connections are configuration the user owns and
   * expects to find again; a session's are a property of two running
   * processes. Forcing both into one persisted list would mean either
   * inventing configuration for sessions or throwing away the user's.
   */
  private links = new Map<string, Set<string>>()

  private linksOf(id: string): Set<string> {
    let set = this.links.get(id)
    if (!set) {
      set = new Set()
      this.links.set(id, set)
    }
    return set
  }

  /** Everyone this session is connected to, that is still running. */
  connectionsOf(id: string): string[] {
    return [...this.linksOf(id)].filter((other) => {
      const session = this.sessions.get(other)
      return session !== undefined && session.status !== 'exited'
    })
  }

  /** Everyone reachable through connections, including this session. */
  groupOf(id: string): string[] {
    if (!this.sessions.has(id)) return []
    const seen = new Set([id])
    const queue = [id]
    while (queue.length > 0) {
      const next = queue.shift()!
      for (const other of this.connectionsOf(next)) {
        if (seen.has(other)) continue
        seen.add(other)
        queue.push(other)
      }
    }
    return [...seen].sort()
  }

  connect(
    aId: string,
    bId: string,
    maxConnections: number,
    maxGroup: number
  ): { ok: boolean; error?: string } {
    if (aId === bId) return { ok: false, error: 'A session cannot connect to itself.' }
    const a = this.sessions.get(aId)
    const b = this.sessions.get(bId)
    if (!a || a.status === 'exited') return { ok: false, error: 'That session has ended.' }
    if (!b || b.status === 'exited') return { ok: false, error: 'That session has ended.' }

    if (this.connectionsOf(aId).includes(bId)) return { ok: true }

    if (this.connectionsOf(aId).length >= maxConnections) {
      return { ok: false, error: `${a.name} already has ${maxConnections} connections.` }
    }
    if (this.connectionsOf(bId).length >= maxConnections) {
      return { ok: false, error: `${b.name} already has ${maxConnections} connections.` }
    }

    const merged = new Set([...this.groupOf(aId), ...this.groupOf(bId)])
    if (merged.size > maxGroup) {
      return {
        ok: false,
        error: `That would make a group of ${merged.size}. The most that can work together is ${maxGroup}.`
      }
    }

    this.linksOf(aId).add(bId)
    this.linksOf(bId).add(aId)
    this.emit('changed', this.list())
    return { ok: true }
  }

  disconnect(aId: string, bId: string): { ok: boolean } {
    this.linksOf(aId).delete(bId)
    this.linksOf(bId).delete(aId)
    this.emit('changed', this.list())
    return { ok: true }
  }

  private unlinkAll(id: string): void {
    for (const other of this.linksOf(id)) this.linksOf(other).delete(id)
    this.links.delete(id)
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

/** Strip ANSI and pick the last non-empty line, for a readable activity entry. */
function lastMeaningfulLine(chunk: string): string | null {
  const clean = chunk
    // eslint-disable-next-line no-control-regex
    .replace(/\[[0-9;?]*[a-zA-Z]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\][^]*/g, '')
    .replace(/\r/g, '\n')
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && !/^[\s\-=_·•]+$/.test(l))
  const last = lines[lines.length - 1]
  return last ? last.slice(0, 120) : null
}

export const agentSessions = new AgentSessions()
