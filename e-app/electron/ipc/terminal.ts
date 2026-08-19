import { BrowserWindow, ipcMain } from 'electron'
import { terminals } from '../terminal/TerminalSessionManager'
import { agentSessions } from '../terminal/AgentSessionManager'
import { fileWatcher } from '../workspace/FileWatcher'

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

  fileWatcher.on('changes', (payload) => broadcast('workspace:fileChanges', payload))

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
}
