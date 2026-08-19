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
}

/**
 * How long a session must be silent before it is considered to be waiting on
 * the user rather than working. CLI agents print steadily while they work and
 * then stop at a prompt, so silence is the honest signal available.
 */
const IDLE_AFTER_MS = 2500

class AgentSessions extends EventEmitter {
  private sessions = new Map<string, AgentSession>()
  private lastOutputAt = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null

  constructor() {
    super()

    terminals.on('agent', ({ id, agent, cwd }) => {
      const session: AgentSession = {
        id: `session-${id}`,
        provider: agent,
        terminalSessionId: id,
        cwd,
        status: 'starting',
        startedAt: Date.now()
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

  /** Sessions still attached to a live process. */
  active(): AgentSession[] {
    return this.list().filter((s) => s.status !== 'exited' && s.status !== 'error')
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
