import { BrowserWindow, ipcMain } from 'electron'
import { terminals } from '../terminal/TerminalSessionManager'
import { agentSessions } from '../terminal/AgentSessionManager'
import { sessionTranscripts } from '../terminal/sessionTranscript'
import { fileWatcher, type FileChange } from '../workspace/FileWatcher'
import { systemBus } from '../agents/EventBus'
import { refreshGit } from '../workspace/awareness'

/**
 * Terminal IPC.
 *
 * The renderer never touches node-pty. It asks for a session, sends keystrokes
 * by id, and receives output on a channel — so the privileged half of the app
 * keeps sole control of process creation, and no page script can spawn
 * anything of its own choosing.
 *
 * Output is streamed as it arrives rather than buffered to the end, because a
 * long-running `npm run dev` or an interactive CLI has no end to wait for.
 */

/** How many file changes from one burst reach the bus. Panels still get all. */
const BUS_FILE_LIMIT = 6

/** Last seen status per PTY, so start and exit are each announced once. */
const knownTerminals = new Map<string, string>()

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function registerTerminalHandlers(): void {
  // Stream PTY output straight through; the renderer feeds it to xterm.
  terminals.on('output', (payload) => broadcast('terminal:output', payload))
  terminals.on('exit', (payload) => broadcast('terminal:exit', payload))
  terminals.on('changed', (sessions) => broadcast('terminal:sessions', sessions))
  terminals.on('command', (payload) => broadcast('terminal:command', payload))

  agentSessions.on('changed', (sessions) =>
    broadcast('agentSession:changed', sessions)
  )
  agentSessions.on('started', (session) =>
    broadcast('agentSession:started', session)
  )
  agentSessions.on('ended', (session) => broadcast('agentSession:ended', session))

  /*
   * Workspace and session activity also go onto the central bus, which is what
   * lets an automation react to a file change or a session ending. The
   * renderer still gets its own direct channel: the panels want every change,
   * while the bus is capped so one noisy build cannot flood it.
   */
  fileWatcher.on('changes', (payload: { changes: FileChange[]; total: number }) => {
    broadcast('workspace:fileChanges', payload)

    for (const change of payload.changes.slice(0, BUS_FILE_LIMIT)) {
      systemBus.emit({
        type: `file.${change.kind}`,
        path: change.path,
        at: change.at,
        activity: `${change.kind} ${change.path}`
      })
    }

    // A file change is usually a git change too, and the awareness layer's
    // cache would otherwise report the branch state from before the edit.
    void refreshGit().then((git) => {
      if (git.branch === null) return
      systemBus.emit({
        type: 'git.changed',
        activity: `git: ${git.dirty} uncommitted change${git.dirty === 1 ? '' : 's'} on ${git.branch}`
      })
    })
  })

  terminals.on('changed', (sessions: { id: string; status: string; title: string }[]) => {
    for (const session of sessions) {
      const seen = knownTerminals.get(session.id)
      if (seen === session.status) continue
      knownTerminals.set(session.id, session.status)
      if (seen === undefined) {
        systemBus.emit({
          type: 'terminal.started',
          activity: `terminal "${session.title}" started`
        })
      } else if (session.status === 'exited') {
        systemBus.emit({
          type: 'terminal.exited',
          activity: `terminal "${session.title}" exited`
        })
      }
    }
  })

  ipcMain.handle('terminal:list', () => terminals.list())

  ipcMain.handle('terminal:create', (_e, options: unknown) => {
    const o = (options ?? {}) as { cols?: number; rows?: number; title?: string }
    return terminals.create({
      cols: Number(o.cols) || 80,
      rows: Number(o.rows) || 24,
      title: typeof o.title === 'string' ? o.title : undefined
    })
  })

  ipcMain.handle('terminal:write', (_e, id: unknown, data: unknown) => {
    if (typeof id !== 'string' || typeof data !== 'string') return false
    return terminals.write(id, data)
  })

  ipcMain.handle('terminal:resize', (_e, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id !== 'string') return
    terminals.resize(id, Number(cols) || 80, Number(rows) || 24)
  })

  ipcMain.handle('terminal:kill', (_e, id: unknown) => {
    if (typeof id === 'string') terminals.kill(String(id))
  })

  ipcMain.handle('terminal:close', (_e, id: unknown) => {
    if (typeof id === 'string') terminals.remove(String(id))
    return terminals.list()
  })

  /** Replay so a reopened panel shows what already happened. */
  ipcMain.handle('terminal:buffer', (_e, id: unknown) =>
    typeof id === 'string' ? terminals.buffer(id) : ''
  )

  ipcMain.handle('agentSession:list', () => agentSessions.list())

  /* ---------------------------------------------- CLI sessions as agents -- */

  sessionTranscripts.on('line', (line) => broadcast('agentSession:line', line))

  ipcMain.handle('agentSession:lines', (_e, id: unknown) =>
    typeof id === 'string' ? sessionTranscripts.lines(id) : []
  )

  ipcMain.handle('agentSession:rename', (_e, id: unknown, name: unknown) =>
    agentSessions.rename(String(id ?? ''), String(name ?? ''))
  )

  ipcMain.handle('agentSession:setCharacter', (_e, id: unknown, slot: unknown) =>
    agentSessions.setCharacter(String(id ?? ''), Number(slot))
  )

  /**
   * Stop what a session is doing.
   *
   * An interrupt, not a kill: the CLI abandons its current turn and keeps its
   * context, which is what "stop working" has to mean for something the user
   * has been holding a conversation with. Ending the session outright is
   * `terminal:close`, which is a different and louder decision.
   */
  ipcMain.handle('agentSession:interrupt', (_e, id: unknown) =>
    agentSessions.interrupt(String(id ?? ''))
  )

  /**
   * Send a message to a CLI session from the chat surface.
   *
   * This is the same stdin the keyboard writes to — there is one session, and
   * the chat is another way into it rather than a parallel conversation with
   * a copy. Whatever the user sends here appears in the terminal panel, and
   * whatever they type in the terminal appears in the chat, because both are
   * views of one process.
   */
  ipcMain.handle('agentSession:send', (_e, id: unknown, text: unknown) => {
    const sessionId = String(id ?? '')
    const message = String(text ?? '')
    if (!message.trim()) return { ok: false, error: 'Empty message.' }

    const session = agentSessions.get(sessionId)
    if (!session || session.status === 'exited') {
      return { ok: false, error: 'That session is no longer running.' }
    }

    /*
     * Recorded before the write, so the user's own line is in the transcript
     * even if the PTY rejects it — a message that visibly vanished would be
     * worse than one shown next to an error.
     */
    sessionTranscripts.recordInput(sessionId, message)

    const sent = terminals.write(
      session.terminalSessionId,
      `${message}${String.fromCharCode(13)}`
    )
    return sent ? { ok: true } : { ok: false, error: 'Could not reach that session.' }
  })
}
