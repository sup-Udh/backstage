import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalSession } from '../shared/providerApi'

/**
 * A real terminal.
 *
 * xterm.js on the front, a PTY in the main process on the back. Keystrokes go
 * straight through, so anything expecting a TTY works: an interactive `node`
 * prompt, `git` paging, and the Claude Code and Codex CLIs — which is the
 * point. Backstage is the visual shell around a real session, not a transcript
 * viewer.
 *
 * The xterm instance deliberately lives outside React state. Terminal output
 * arrives dozens of times a second, and routing it through a re-render would
 * drop frames in the pixel world next door.
 */

const THEME = {
  background: '#14141F',
  foreground: '#E4E0D4',
  cursor: '#FFC94F',
  cursorAccent: '#14141F',
  selectionBackground: '#3A3A55',
  black: '#1B1B2A',
  red: '#C4614A',
  green: '#7BA05B',
  yellow: '#FFC94F',
  blue: '#5E7FA8',
  magenta: '#9A6EA8',
  cyan: '#5E9AA8',
  white: '#D9D4C6',
  brightBlack: '#4A4A63',
  brightRed: '#E07A5F',
  brightGreen: '#9DC178',
  brightYellow: '#FFE29A',
  brightBlue: '#7FA3CC',
  brightMagenta: '#BC8FCC',
  brightCyan: '#7FBFCC',
  brightWhite: '#FFF6E4'
}

export function TerminalPanel() {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const activeRef = useRef<string | null>(null)

  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Keep a ref in step, so the output listener can filter without re-binding.
  useEffect(() => {
    activeRef.current = active
  }, [active])

  /* Build the xterm instance once. */
  useEffect(() => {
    if (!hostRef.current || termRef.current) return

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      theme: THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    termRef.current = term
    fitRef.current = fit

    // Every keystroke goes to the PTY. This is real stdin, including Ctrl+C.
    term.onData((data) => {
      const id = activeRef.current
      if (id) void window.backstage.terminal.write(id, data)
    })

    return () => {
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  /* Stream output for whichever session is on screen. */
  useEffect(() => {
    const offOutput = window.backstage.terminal.onOutput(({ id, data }) => {
      if (id === activeRef.current) termRef.current?.write(data)
    })
    const offSessions = window.backstage.terminal.onSessions((list) => {
      setSessions(list)
    })
    const offExit = window.backstage.terminal.onExit(({ id, exitCode }) => {
      if (id === activeRef.current) {
        termRef.current?.write(`\r\n\x1b[90m[process exited with code ${exitCode}]\x1b[0m\r\n`)
      }
    })
    void window.backstage.terminal.list().then(setSessions)
    return () => {
      offOutput()
      offSessions()
      offExit()
    }
  }, [])

  /** Match the PTY's grid to the panel, so full-screen CLIs lay out right. */
  const fit = useCallback(() => {
    const term = termRef.current
    const addon = fitRef.current
    if (!term || !addon) return
    try {
      addon.fit()
    } catch {
      // Fitting a zero-size panel throws; nothing to do until it is visible.
      return
    }
    const id = activeRef.current
    if (id) void window.backstage.terminal.resize(id, term.cols, term.rows)
  }, [])

  useEffect(() => {
    const ro = new ResizeObserver(() => fit())
    if (hostRef.current) ro.observe(hostRef.current)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [fit])

  /** Switch sessions by replaying that session's buffer. */
  const show = useCallback(
    async (id: string) => {
      setActive(id)
      activeRef.current = id
      const term = termRef.current
      if (!term) return
      term.clear()
      term.reset()
      const buffer = await window.backstage.terminal.buffer(id)
      if (buffer) term.write(buffer)
      requestAnimationFrame(() => {
        fit()
        term.focus()
      })
    },
    [fit]
  )

  const create = useCallback(async () => {
    setError(null)
    try {
      const term = termRef.current
      const session = await window.backstage.terminal.create({
        cols: term?.cols ?? 80,
        rows: term?.rows ?? 24
      })
      await show(session.id)
    } catch {
      setError('Terminal failed to start.')
    }
  }, [show])

  // Open one automatically, so the panel is useful the moment it appears.
  useEffect(() => {
    if (sessions.length === 0 && !active) {
      void create()
    } else if (!active && sessions.length > 0) {
      void show(sessions[sessions.length - 1].id)
    }
    // Only on mount and when the session list first arrives.
  }, [sessions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#14141F]">
      {/* Session tabs. Each is its own PTY, cwd and process. */}
      <div className="flex shrink-0 items-center gap-1 border-b-2 border-ink-3 bg-ink px-2 py-1.5">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => void show(s.id)}
            className={`flex items-center gap-1.5 border-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${
              s.id === active
                ? 'border-brand bg-ink-2 text-brand'
                : 'border-ink-3 text-dim hover:text-cream'
            }`}
          >
            {s.agent && (
              <span aria-hidden className="text-brand">
                ◆
              </span>
            )}
            {s.title}
            {s.status === 'exited' && <span className="text-dim">·exited</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void create()}
          title="New terminal session"
          className="border-2 border-ink-3 px-2 py-0.5 font-mono text-[10px] text-dim transition-colors hover:border-brand hover:text-brand"
        >
          +
        </button>

        <span className="ml-auto truncate pl-2 font-mono text-[10px] text-dim">
          {sessions.find((s) => s.id === active)?.cwd ?? ''}
        </span>
      </div>

      {error && (
        <p className="shrink-0 bg-ink-2 px-3 py-1.5 font-ui text-xs text-cream">
          {error}
        </p>
      )}

      <div ref={hostRef} className="min-h-0 flex-1 px-2 py-1" />
    </div>
  )
}
