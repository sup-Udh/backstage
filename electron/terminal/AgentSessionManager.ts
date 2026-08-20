import { EventEmitter } from 'node:events'
import { terminals, type SessionAgent } from './TerminalSessionManager'

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
  /** Which of the active theme's characters stands in for this session. */
  characterSlot: number
}

/**
 * How long a session must be silent before it is considered to be waiting on
 * the user rather than working. CLI agents print steadily while they work and
 * then stop at a prompt, so silence is the honest signal available.
 */
const IDLE_AFTER_MS = 2500

/**
 * Where CLI sessions are cast from, past the configured team's own slots.
 *
 * Sessions and agents draw characters from the same theme, so they have to
 * draw from different parts of it or the first Claude session would appear
 * wearing Jane's face while Jane was still at her desk.
 */
const CLI_SLOT_BASE = 8

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
  private slots = 0

  constructor() {
    super()

    terminals.on('agent', ({ id, agent, cwd }) => {
      const kind: string = agent ?? 'cli'
      const n = (this.counts.get(kind) ?? 0) + 1
      this.counts.set(kind, n)

      const session: AgentSession = {
        id: `session-${id}`,
        provider: agent,
        terminalSessionId: id,
        cwd,
        status: 'starting',
        startedAt: Date.now(),
        name: `${kind.replace(/^./, (c) => c.toUpperCase())} ${n}`,
        characterSlot: CLI_SLOT_BASE + this.slots++
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
          changed = true
        }
      }
      if (changed) this.emit('changed', this.list())
    }, 1000)
    this.timer.unref?.()
  }

  private byTerminal(terminalId: string): AgentSession | undefined {
    for (const s of this.sessions.values()) {
      if (s.terminalSessionId === terminalId && s.status !== 'exited') return s
    }
    return undefined
  }

  list(): AgentSession[] {
    return [...this.sessions.values()].map((s) => ({ ...s }))
  }

  get(id: string): AgentSession | undefined {
    const s = this.sessions.get(id)
    return s ? { ...s } : undefined
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

  /** Put a session in front of a different character. */
  setCharacter(id: string, slot: number): boolean {
    const session = this.sessions.get(id)
    if (!session || !Number.isFinite(slot)) return false
    session.characterSlot = Math.max(0, Math.floor(slot))
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
      this.sessions.delete(s.id)
      changed = true
    }
    if (changed) this.emit('changed', this.list())
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
