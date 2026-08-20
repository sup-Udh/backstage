import { EventEmitter } from 'node:events'
import { agentSessions } from './AgentSessionManager'
import { terminals } from './TerminalSessionManager'
import { LineExtractor } from './lineExtractor'

/**
 * A readable transcript of what each CLI agent session actually printed.
 *
 * The reconstruction itself lives in `LineExtractor`, which is pure and
 * tested. This is only the wiring: which PTY belongs to which session, how
 * much history to keep, and what the user sent in.
 *
 * Nothing here interprets the output. It does not decide which lines were
 * "Claude speaking" as opposed to a tool banner or a progress note — that
 * structure does not exist in the byte stream, and inventing it would mean
 * presenting a guess as a transcript. The terminal panel remains the
 * full-fidelity view; this is the readable one.
 */

export interface SessionLine {
  id: string
  /** The AgentSession this belongs to. */
  sessionId: string
  /** `user` is what was sent in; `output` is what the process printed. */
  kind: 'user' | 'output'
  text: string
  at: number
}

/** How many lines to keep per session for replay into a reopened panel. */
const MAX_LINES = 400

let seq = 0
function lineId(): string {
  seq += 1
  return `line_${Date.now().toString(36)}_${seq}`
}

interface Held {
  extractor: LineExtractor
  lines: SessionLine[]
}

class SessionTranscripts extends EventEmitter {
  private held = new Map<string, Held>()

  constructor() {
    super()

    terminals.on('output', ({ id, data }: { id: string; data: string }) => {
      const session = agentSessions
        .list()
        .find((s) => s.terminalSessionId === id && s.status !== 'exited')
      if (!session) return

      const held = this.hold(session.id)
      for (const text of held.extractor.push(data)) {
        this.push(session.id, held, {
          id: lineId(),
          sessionId: session.id,
          kind: 'output',
          text,
          at: Date.now()
        })
      }
    })
  }

  private hold(sessionId: string): Held {
    let held = this.held.get(sessionId)
    if (!held) {
      held = { extractor: new LineExtractor(), lines: [] }
      this.held.set(sessionId, held)
    }
    return held
  }

  private push(sessionId: string, held: Held, line: SessionLine): void {
    held.lines.push(line)
    if (held.lines.length > MAX_LINES) held.lines.shift()
    this.emit('line', line)
    void sessionId
  }

  /** Everything kept for a session, for a panel opening mid-conversation. */
  lines(sessionId: string): SessionLine[] {
    return [...(this.held.get(sessionId)?.lines ?? [])]
  }

  /** Record what the user sent, so the chat shows both halves of it. */
  recordInput(sessionId: string, text: string): SessionLine {
    const held = this.hold(sessionId)
    const line: SessionLine = {
      id: lineId(),
      sessionId,
      kind: 'user',
      text: text.trim(),
      at: Date.now()
    }
    this.push(sessionId, held, line)
    return line
  }

  forget(sessionId: string): void {
    this.held.delete(sessionId)
  }
}

export const sessionTranscripts = new SessionTranscripts()
