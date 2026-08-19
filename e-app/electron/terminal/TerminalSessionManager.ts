import * as pty from '@lydell/node-pty'
import { EventEmitter } from 'node:events'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'

/**
 * Real PTY sessions, owned by the main process.
 *
 * This is deliberately a pseudo-terminal rather than `child_process.exec`.
 * Anything that expects a TTY — an interactive `node` prompt, `vim`, and most
 * importantly the Claude Code and Codex CLIs — will not work without one, and
 * those CLIs are the point: Backstage is a visual shell around a real session,
 * not a reimplementation of it.
 *
 * A session stays connected for its whole life. The renderer writes keystrokes
 * in and receives output as it is produced, so the user is genuinely talking to
 * the process, not replaying a transcript.
 */

export type SessionStatus = 'starting' | 'running' | 'exited'

/** Which CLI agent, if any, this session is currently running. */
export type SessionAgent = 'claude' | 'codex' | 'gemini' | null

export interface TerminalSession {
  id: string
  title: string
  cwd: string
  shell: string
  status: SessionStatus
  createdAt: number
  exitCode?: number
  /** The external CLI agent detected in this session, if any. */
  agent: SessionAgent
  /** Command currently believed to be running in the foreground. */
  command: string | null
  pid?: number
}

/** Scrollback kept per session, so a chatty build cannot exhaust memory. */
const MAX_BUFFER_CHARS = 200_000

interface Live {
  meta: TerminalSession
  proc: pty.IPty
  buffer: string
  /** Keystrokes since the last newline, used to spot the command being run. */
  pending: string
  /** True while an escape sequence is being skipped over. */
  inEscape: boolean
}

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'powershell.exe'
  }
  return process.env.SHELL ?? '/bin/bash'
}

/**
 * Recognise a CLI agent from a command line the user typed.
 *
 * Deliberately conservative: it matches the command at the start of the line,
 * so `git commit -m "ask claude"` is not mistaken for launching Claude.
 */
export function detectAgent(command: string): SessionAgent {
  const first = command.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const base = first.replace(/\.(exe|cmd|bat|ps1)$/i, '').split(/[\\/]/).pop() ?? ''
  if (base === 'claude') return 'claude'
  if (base === 'codex') return 'codex'
  if (base === 'gemini') return 'gemini'
  return null
}

class TerminalSessions extends EventEmitter {
  private sessions = new Map<string, Live>()
  private seq = 0

  list(): TerminalSession[] {
    return [...this.sessions.values()].map((s) => ({ ...s.meta }))
  }

  get(id: string): TerminalSession | undefined {
    const live = this.sessions.get(id)
    return live ? { ...live.meta } : undefined
  }

  /** Replay buffer, so a reopened panel shows what already happened. */
  buffer(id: string): string {
    return this.sessions.get(id)?.buffer ?? ''
  }

  create(options: { cwd?: string; title?: string; cols?: number; rows?: number } = {}): TerminalSession {
    const cwd = options.cwd ?? getWorkspaceRoot() ?? process.cwd()
    const shell = defaultShell()
    const id = `terminal-${String(++this.seq).padStart(2, '0')}`

    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd,
      env: {
        ...process.env,
        // Colour is wanted here, unlike the agent's one-shot tool runner.
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    })

    const meta: TerminalSession = {
      id,
      title: options.title ?? `shell ${this.seq}`,
      cwd,
      shell,
      status: 'running',
      createdAt: Date.now(),
      agent: null,
      command: null,
      pid: proc.pid
    }

    const live: Live = { meta, proc, buffer: '', pending: '', inEscape: false }
    this.sessions.set(id, live)

    proc.onData((data) => {
      live.buffer += data
      if (live.buffer.length > MAX_BUFFER_CHARS) {
        live.buffer = live.buffer.slice(-MAX_BUFFER_CHARS)
      }
      this.emit('output', { id, data })
    })

    proc.onExit(({ exitCode }) => {
      live.meta.status = 'exited'
      live.meta.exitCode = exitCode
      live.meta.command = null
      const hadAgent = live.meta.agent
      live.meta.agent = null
      this.emit('exit', { id, exitCode, agent: hadAgent })
      this.emit('changed', this.list())
    })

    this.emit('changed', this.list())
    return { ...meta }
  }

  /**
   * Forward keystrokes to the PTY.
   *
   * Also watches for a completed command line so the UI can tell when an
   * agent CLI has been launched. This is observation of what the user typed,
   * not interception: every byte still reaches the process unchanged.
   */
  write(id: string, data: string): boolean {
    const live = this.sessions.get(id)
    if (!live || live.meta.status === 'exited') return false

    /*
     * The stream carries terminal protocol as well as typed characters —
     * xterm reports focus changes, mouse moves and bracketed paste as escape
     * sequences. Those must be skipped, or a focus report arriving just before
     * a keystroke turns "claude" into "[Iclaude" and nothing matches.
     */
    for (const ch of data) {
      if (live.inEscape) {
        // CSI and OSC sequences terminate on a letter or a bell.
        if (/[a-zA-Z~]/.test(ch)) live.inEscape = false
        continue
      }

      if (ch === '\x1b') {
        live.inEscape = true
      } else if (ch === '\r' || ch === '\n') {
        const command = live.pending.trim()
        live.pending = ''
        if (command) this.noteCommand(live, command)
      } else if (ch === '\x7f' || ch === '\b') {
        live.pending = live.pending.slice(0, -1)
      } else if (ch === '\x03') {
        live.pending = ''
      } else if (ch >= ' ') {
        live.pending += ch
      }
    }

    live.proc.write(data)
    return true
  }

  private noteCommand(live: Live, command: string): void {
    live.meta.command = command
    const agent = detectAgent(command)
    if (agent) {
      live.meta.agent = agent
      live.meta.title = agent
      this.emit('agent', { id: live.meta.id, agent, cwd: live.meta.cwd, command })
    }
    this.emit('command', { id: live.meta.id, command, agent })
    this.emit('changed', this.list())
  }

  resize(id: string, cols: number, rows: number): void {
    const live = this.sessions.get(id)
    if (!live || live.meta.status === 'exited') return
    try {
      live.proc.resize(Math.max(2, cols), Math.max(1, rows))
    } catch {
      // A process that exited between the check and the call is not an error.
    }
  }

  kill(id: string): void {
    const live = this.sessions.get(id)
    if (!live) return
    try {
      live.proc.kill()
    } catch {
      // Already gone is the desired end state.
    }
  }

  /** Close every session. Called when the app quits so no PTY is orphaned. */
  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
    this.sessions.clear()
  }

  remove(id: string): void {
    this.kill(id)
    this.sessions.delete(id)
    this.emit('changed', this.list())
  }
}

export const terminals = new TerminalSessions()
