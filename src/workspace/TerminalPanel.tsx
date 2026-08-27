import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { AgentSession, SessionAgent, TerminalSession } from '../shared/providerApi'
import { useBackstage } from '../stores/backstageStore'
import { useAppearance } from '../stores/appearanceStore'
import { ActivityRail } from './ActivityRail'
import { CLAUDE_COPY, CLAUDE_INSTALL_URL } from '../claude/useClaude'
import type { ClaudeDetection } from '../shared/providerApi'

/**
 * The session surface.
 *
 * Underneath this is exactly what it was: xterm.js on the front, a real PTY in
 * the main process on the back, keystrokes going straight through. That is not
 * negotiable — Claude Code, Codex and Gemini are full-screen TUIs, and only a
 * real terminal emulator can draw one. Replacing it with a hand-rolled log
 * viewer would mean inventing structure the process never emitted, which is
 * the one thing a session view must never do.
 *
 * What changed is everything around and on top of it. The surface is warm
 * paper rather than a black rectangle, the ANSI palette is remapped for a light
 * ground, and the chrome is Backstage: who is running, where, on what, and what
 * you can do about it. Real terminal, Backstage presentation.
 *
 * The xterm instance deliberately lives outside React state. Output arrives
 * dozens of times a second, and routing it through a re-render would drop
 * frames in the pixel world next door.
 */

/**
 * The palette, remapped for paper.
 *
 * Every colour a CLI can ask for has to stay legible on cream, which rules out
 * the usual terminal set wholesale. `brightWhite` matters most: CLIs reach for
 * it to emphasise, and left as white it would erase the very lines the tool
 * considers important.
 */
const LIGHT_THEME = {
  background: '#FFFDF5',
  foreground: '#2E2E45',
  cursor: '#E8A128',
  cursorAccent: '#FFFDF5',
  selectionBackground: '#FFC94F',
  selectionForeground: '#1B1B2A',
  black: '#1B1B2A',
  red: '#B03A28',
  green: '#4A7233',
  yellow: '#A8760F',
  blue: '#33568A',
  magenta: '#7B3F8C',
  cyan: '#2F6F7D',
  white: '#6A6A85',
  brightBlack: '#7A7A96',
  brightRed: '#C9503A',
  brightGreen: '#5E8C42',
  brightYellow: '#C08A16',
  brightBlue: '#456FA8',
  brightMagenta: '#95539F',
  brightCyan: '#3D8794',
  brightWhite: '#1B1B2A'
}

/**
 * The same palette, remapped for midnight.
 *
 * Not the light one inverted, and not xterm's default dark set either. Every
 * hue keeps its *meaning* — red is still the error red the light theme uses,
 * two stops brighter — so a CLI's output reads the same way in both
 * appearances. `brightWhite` is again the one that matters: on paper it had to
 * be pushed down to near-black, and here it goes back to being the brightest
 * thing on screen, because that is what a tool means by it.
 */
const DARK_THEME = {
  background: '#0B0B14',
  foreground: '#D6D0C3',
  cursor: '#FFB733',
  cursorAccent: '#0B0B14',
  selectionBackground: '#FFC94F',
  selectionForeground: '#14141F',
  black: '#2E2E46',
  red: '#E2705A',
  green: '#8FB86A',
  yellow: '#E8B44C',
  blue: '#7BA1DB',
  magenta: '#C08AD0',
  cyan: '#6FBFCE',
  white: '#C9C4B8',
  brightBlack: '#6E6E8C',
  brightRed: '#F0917C',
  brightGreen: '#A9CE86',
  brightYellow: '#FFD073',
  brightBlue: '#9BBCEE',
  brightMagenta: '#D6A6E4',
  brightCyan: '#8FD8E6',
  brightWhite: '#FFF6E4'
}

/** How a CLI names itself in the session header. */
const AGENT_TITLE: Record<Exclude<SessionAgent, null>, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI'
}

type SessionState = 'live' | 'working' | 'waiting' | 'exited' | 'error'

const STATE_GLYPH: Record<SessionState, string> = {
  live: '●',
  working: '✦',
  waiting: '●',
  exited: '○',
  error: '◇'
}

const STATE_LABEL: Record<SessionState, string> = {
  live: 'Live',
  working: 'Working',
  waiting: 'Waiting',
  exited: 'Exited',
  error: 'Error'
}

/** The last path segment, for a short session label. */
function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/**
 * Which CLI a terminal was running.
 *
 * The PTY clears its own `agent` when the process exits — correctly, because
 * nothing is running there any more. But the panel still has to be able to say
 * "this was Claude Code" and offer to restart it as Claude Code rather than as
 * a bare shell, so the answer comes from the session record, which outlives the
 * process.
 */
function providerFor(
  session: TerminalSession | undefined,
  agentSessions: AgentSession[]
): SessionAgent {
  if (!session) return null
  if (session.agent) return session.agent
  const record = [...agentSessions]
    .reverse()
    .find((a) => a.terminalSessionId === session.id)
  return record?.provider ?? null
}

/**
 * What the session is doing, from things that can actually be observed.
 *
 * The process is alive or it is not; a CLI attached to it has produced output
 * recently or has gone quiet. Nothing here guesses at what a model is thinking.
 */
function stateOf(
  session: TerminalSession | undefined,
  agent: AgentSession | undefined
): SessionState {
  if (!session || session.status === 'exited') {
    return session?.exitCode ? 'error' : 'exited'
  }
  if (!agent) return 'live'
  if (agent.status === 'error') return 'error'
  if (agent.status === 'exited') return 'exited'
  if (agent.status === 'waiting') return 'waiting'
  return 'working'
}

export function TerminalPanel() {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const activeRef = useRef<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  /**
   * Set when Claude Code was asked for and cannot run.
   *
   * The detection itself, not a boolean, because the notice has to say which
   * of the two problems it is — missing, or present but broken — and those
   * need different words and different advice.
   */
  const [claudeProblem, setClaudeProblem] = useState<ClaudeDetection | null>(null)

  const sessions = useBackstage((s) => s.terminalSessions)
  const agentSessions = useBackstage((s) => s.agentSessions)
  const active = useBackstage((s) => s.activeTerminalId)
  const setActive = useBackstage((s) => s.setActiveTerminal)
  const requested = useBackstage((s) => s.requestedSessionId)
  const requestSession = useBackstage((s) => s.requestSession)
  const pendingCommand = useBackstage((s) => s.pendingCommand)
  const queueCommand = useBackstage((s) => s.queueCommand)
  const appearance = useAppearance((s) => s.appearance)

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
      lineHeight: 1.35,
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      theme: useAppearance.getState().appearance === 'dark' ? DARK_THEME : LIGHT_THEME
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

  /*
   * Repaint on an appearance change.
   *
   * The emulator is built once and deliberately lives outside React, so it
   * cannot be re-rendered into a new palette — the theme has to be pushed into
   * the instance. Scrollback keeps its colours because xterm stores ANSI
   * indices rather than resolved values, so output printed an hour ago
   * recolours with everything else.
   */
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = appearance === 'dark' ? DARK_THEME : LIGHT_THEME
  }, [appearance])

  /* Stream output for whichever session is on screen. */
  useEffect(() => {
    const offOutput = window.backstage.terminal.onOutput(({ id, data }) => {
      if (id === activeRef.current) termRef.current?.write(data)
    })
    const offExit = window.backstage.terminal.onExit(({ id, exitCode }) => {
      if (id === activeRef.current) {
        // Dim, not red: an exit is the normal end of a session.
        termRef.current?.write(
          `\r\n\x1b[90m[process exited with code ${exitCode}]\x1b[0m\r\n`
        )
      }
    })
    return () => {
      offOutput()
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
    [fit, setActive]
  )

  const create = useCallback(async (): Promise<string | null> => {
    setError(null)
    try {
      const term = termRef.current
      const session = await window.backstage.terminal.create({
        cols: term?.cols ?? 80,
        rows: term?.rows ?? 24
      })
      await show(session.id)
      return session.id
    } catch {
      setError('Terminal failed to start.')
      return null
    }
  }, [show])

  /**
   * Start a CLI agent in a real session.
   *
   * This spawns a PTY and types the command into it, which is exactly what
   * happens when the user types it themselves — the same shell, the same
   * workspace cwd, the same detection path that registers the session and
   * brings its character into the world. Nothing is simulated, and the
   * renderer gains no ability to name a program that it did not already have
   * by virtue of being able to type.
   */
  const launch = useCallback(
    async (command: string) => {
      setStarting(true)
      try {
        /*
         * Ask before opening a shell to type into.
         *
         * Without this the failure mode is genuinely confusing: a terminal
         * appears, the command runs, the shell prints
         * `'claude' is not recognized as an internal or external command`,
         * and the user has to work out from that whether Backstage is broken,
         * their PATH is broken, or Claude Code was never installed. Those need
         * different actions, and only the last one is common.
         *
         * The check is only for the CLI agents Backstage offers a button for.
         * A command the user types themselves goes straight through, because
         * intercepting arbitrary input would mean Backstage deciding which of
         * their programs exist.
         */
        if (command === 'claude') {
          const detection = await window.backstage?.claude.detect()
          if (detection && detection.state !== 'available') {
            setClaudeProblem(detection)
            return
          }
        }

        const id = (await create()) ?? null
        if (!id) return
        // A beat for the shell to come up and start reading stdin.
        window.setTimeout(() => {
          void window.backstage.terminal.write(id, command + String.fromCharCode(13))
        }, 400)
      } finally {
        setStarting(false)
      }
    },
    [create]
  )

  /* Adopt an existing session on first open, rather than spawning blind. */
  useEffect(() => {
    if (active || sessions.length === 0) return
    void show(sessions[sessions.length - 1].id)
  }, [sessions, active, show])

  /* If the active session disappears, fall back to whatever is left. */
  useEffect(() => {
    if (!active) return
    if (sessions.some((s) => s.id === active)) return
    if (sessions.length > 0) void show(sessions[sessions.length - 1].id)
    else setActive(null)
  }, [sessions, active, show, setActive])

  /* Another surface asked for a specific session — e.g. the tasks list. */
  useEffect(() => {
    if (!requested) return
    if (sessions.some((s) => s.id === requested)) void show(requested)
    requestSession(null)
  }, [requested, sessions, show, requestSession])

  /*
   * A command chosen in the Commands tab is typed into the live session rather
   * than run behind the user's back, so they see the real process and can
   * interrupt it. With no session open yet, one is started for it.
   */
  useEffect(() => {
    if (!pendingCommand) return
    const command = pendingCommand
    queueCommand(null)
    if (active) {
      void window.backstage.terminal.write(active, command + String.fromCharCode(13))
    } else {
      void launch(command)
    }
  }, [pendingCommand, active, queueCommand, launch])

  const session = sessions.find((s) => s.id === active)
  const agent = agentSessions.find(
    (a) => a.terminalSessionId === active && a.status !== 'exited'
  )
  const state = stateOf(session, agent)
  const live = Boolean(session && session.status !== 'exited')

  const provider = providerFor(session, agentSessions)
  const title = provider
    ? AGENT_TITLE[provider]
    : session
      ? 'Workspace shell'
      : 'No session'

  /* The character this session is driving, for the activity rail. */
  const railAgentId = useMemo(
    () => (agent ? `cli-${agent.terminalSessionId}` : undefined),
    [agent]
  )

  const stop = () => {
    if (active) void window.backstage.terminal.kill(active)
  }

  const clear = () => {
    termRef.current?.clear()
  }

  const restart = () => {
    const previous = session
    const was = provider
    void (async () => {
      if (previous) await window.backstage.terminal.close(previous.id)
      // Restarting an agent session brings the agent back, not just a shell.
      if (was) await launch(was)
      else await create()
    })()
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      {/* Session tabs. Each is its own PTY, cwd, process and character. */}
      {sessions.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b-2 border-rule bg-cream-2 px-2 py-1.5">
          {sessions.map((s) => {
            const a = agentSessions.find(
              (x) => x.terminalSessionId === s.id && x.status !== 'exited'
            )
            const ran = providerFor(s, agentSessions)
            const on = s.id === active
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => void show(s.id)}
                aria-pressed={on}
                title={s.cwd}
                className={`flex shrink-0 items-center gap-1.5 border-2 px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                  on
                    ? 'border-ink bg-brand text-on-brand'
                    : 'border-rule bg-paper text-ink-3 hover:border-ink hover:text-ink'
                }`}
              >
                <span
                  aria-hidden
                  className={
                    s.status === 'exited'
                      ? 'text-ink-3'
                      : a
                        ? 'text-brand-deep'
                        : 'text-ink-3'
                  }
                >
                  {s.status === 'exited' ? STATE_GLYPH.exited : STATE_GLYPH.live}
                </span>
                {ran ?? s.title}
                <span className="font-mono text-[9px] normal-case text-ink-3">
                  · {basename(s.cwd)}
                </span>
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => void create()}
            title="New terminal session"
            className="shrink-0 border-2 border-rule bg-paper px-2 py-0.5 font-pixel text-[10px] font-semibold text-ink-3 transition-colors hover:border-ink hover:bg-brand-pale hover:text-ink"
          >
            +
          </button>
        </div>
      )}

      {/* Who is running, where, and what can be done about it. */}
      {session && (
        <div className="flex shrink-0 items-center gap-3 border-b-2 border-rule bg-paper px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <span
                aria-hidden
                className={
                  state === 'exited'
                    ? 'font-pixel text-[11px] text-ink-3'
                    : `font-pixel text-[11px] text-brand-deep ${
                        state === 'working' ? 'blink' : ''
                      }`
                }
              >
                {STATE_GLYPH[state]}
              </span>
              <span
                className={`font-pixel text-[11px] font-semibold uppercase tracking-[0.12em] ${
                  state === 'exited' ? 'text-ink-3' : 'text-ink'
                }`}
              >
                {STATE_LABEL[state]}
              </span>
              <span aria-hidden className="h-3 w-px bg-rule" />
              <span className="truncate font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                {title}
              </span>
            </p>
            <p
              className="mt-0.5 truncate font-mono text-[10px] text-ink-3"
              title={session.cwd}
            >
              {basename(session.cwd)} · {session.cwd}
            </p>
          </div>

          {/* Only the controls that apply right now. */}
          <div className="flex shrink-0 items-center gap-1">
            {live ? (
              <>
                <SmallButton onClick={clear}>Clear</SmallButton>
                <SmallButton onClick={stop}>Stop</SmallButton>
              </>
            ) : (
              <SmallButton onClick={restart}>Restart</SmallButton>
            )}
          </div>
        </div>
      )}

      {/* Activity, in the session that produced it. */}
      {session && <ActivityRail limit={4} agentId={railAgentId} />}

      {error && (
        <p className="shrink-0 border-b-2 border-rule bg-brand-pale px-3 py-1.5 font-ui text-xs text-ink">
          {error}
        </p>
      )}

      {/*
        Claude Code was asked for and is not usable.

        Deliberately a Backstage notice rather than a shell error: it says what
        Backstage did, what it wanted, and what is missing — which is the whole
        of requirement 20. The two states get different words, because
        "reinstall it" is wrong advice for a CLI that is already installed.
      */}
      {claudeProblem && (
        <div
          role="alert"
          className="shrink-0 border-b-[3px] border-ink bg-brand-pale px-4 py-3"
        >
          <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.08em] text-rust">
            {claudeProblem.state === 'not_installed'
              ? 'Claude Code not found'
              : "Claude Code won't start"}
          </p>

          <p className="mt-1 max-w-[52ch] font-ui text-[13px] leading-snug text-ink">
            {claudeProblem.state === 'not_installed' ? (
              <>
                Backstage tried to start a Claude Code session, but Claude Code
                doesn&rsquo;t appear to be installed on this computer. Install
                it and try again — nothing else needs configuring.
              </>
            ) : (
              <>
                Backstage found Claude Code on this computer, but it
                wouldn&rsquo;t run. It is installed, so reinstalling is probably
                not the fix — check that it works from your own terminal.
              </>
            )}
          </p>

          {claudeProblem.path && (
            <p className="mt-1 break-all font-mono text-[10px] text-ink-3">
              {claudeProblem.path}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <a
              href={CLAUDE_INSTALL_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="border-2 border-ink bg-paper px-2.5 py-1 font-pixel text-[10px] font-bold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-lite focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
            >
              View setup
            </a>
            <button
              type="button"
              onClick={() => setClaudeProblem(null)}
              className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-bold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
            >
              Close
            </button>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              {CLAUDE_COPY[claudeProblem.state].label}
            </span>
          </div>
        </div>
      )}

      {/* The empty state, which offers the two things worth doing. */}
      {sessions.length === 0 && (
        <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 px-5">
          <p className="font-pixel text-sm font-bold uppercase tracking-[0.08em] text-ink">
            No active session
          </p>
          <p className="max-w-[36ch] font-ui text-[13px] leading-[1.6] text-ink-3">
            Open a workspace terminal, or start Claude Code in one. Either way it
            is a real process in your project folder.
          </p>
          <div className="flex flex-wrap gap-2">
            <BigButton onClick={() => void create()} disabled={starting}>
              Open terminal
            </BigButton>
            <BigButton onClick={() => void launch('claude')} disabled={starting} primary>
              Start Claude
            </BigButton>
          </div>
        </div>
      )}

      {/*
        The terminal itself. Kept mounted even while the empty state shows, so
        the xterm instance and its scrollback survive a session ending.
      */}
      <div
        ref={hostRef}
        className={`min-h-0 bg-paper px-2 py-1.5 ${
          sessions.length === 0 ? 'hidden' : 'flex-1'
        }`}
      />
    </div>
  )
}

/** A compact pixel control for the session header. */
function SmallButton({
  onClick,
  children
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-2 border-rule bg-cream px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3 transition-colors hover:border-ink hover:bg-brand-pale hover:text-ink"
    >
      {children}
    </button>
  )
}

function BigButton({
  onClick,
  children,
  disabled,
  primary
}: {
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'border-[3px] border-ink px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.08em] text-ink',
        'shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75',
        'enabled:hover:-translate-x-px enabled:hover:-translate-y-px',
        'enabled:active:translate-x-[2px] enabled:active:translate-y-[2px] enabled:active:shadow-[1px_1px_0_0_var(--color-shadow)]',
        'disabled:opacity-50',
        primary ? 'bg-brand' : 'bg-paper hover:bg-brand-pale'
      ].join(' ')}
    >
      {children}
    </button>
  )
}
