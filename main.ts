import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { appIconPath, applyAppIdentity } from './appIcon'

/**
 * The end-to-end automation endpoint.
 *
 * Backstage has no way to be driven by a test. Every surface it has is a
 * rendered one, so "does spawning an agent work" can only be answered by a
 * person clicking it — which is why the delegation regression that shipped
 * (ALL AGENTS silently broadcasting instead of routing to the lead) was
 * invisible to `npm test` and stayed that way. This opens the standard
 * Chrome DevTools Protocol against the renderer so a harness can drive the
 * real preload bridge, the real IPC handlers and the real stores.
 *
 * Three gates, all of which must pass, because a debugging port is remote
 * code execution against whatever the signed-in user can reach:
 *
 *   1. Never in a packaged build. `app.isPackaged` is the only check here
 *      that cannot be faked by an environment variable.
 *   2. Only when Vite is serving the renderer. `ELECTRON_RENDERER_URL` is
 *      set by electron-vite for a dev run and by nothing else.
 *   3. Only on explicit opt-in. Off unless BACKSTAGE_AUTOMATION_PORT names
 *      a port, so an ordinary `npm run dev` is unchanged.
 *
 * Bound to 127.0.0.1 explicitly rather than relying on Chromium's default,
 * so the endpoint cannot be reached from another machine even if the default
 * changes. Must run before `app.whenReady()`: command-line switches are read
 * when the browser process initialises and appending one afterwards is
 * silently ignored.
 */
function enableAutomationEndpoint(): void {
  const port = process.env.BACKSTAGE_AUTOMATION_PORT
  if (!port) return
  if (app.isPackaged) return
  if (!process.env.ELECTRON_RENDERER_URL) return
  if (!/^\d+$/.test(port)) return

  app.commandLine.appendSwitch('remote-debugging-port', port)
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  console.log(`[backstage] automation endpoint on 127.0.0.1:${port} (dev only)`)
}

enableAutomationEndpoint()

function createWindow() {
  const icon = appIconPath()

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,

    /*
     * Backstage's own icon rather than Electron's default.
     *
     * Only set when the asset was actually found: passing `undefined` keeps
     * Electron's default, whereas passing a path that does not exist gets the
     * same result while looking like it worked. macOS ignores this entirely
     * and reads the .app bundle instead, which is why `appIconPath` returns
     * null there.
     */
    ...(icon ? { icon } : {}),

    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  /*
   * The renderer URL is only set when Vite is serving, so it doubles as the
   * test for "is this a development run". DevTools no longer opens on its
   * own — even in dev it docked an inspector over half the office on every
   * launch. Set OPEN_DEVTOOLS=1 to get it back for a session, or reach for
   * the View menu / Ctrl+Shift+I once the window is up.
   */
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    win.loadURL(devUrl)
    if (process.env.OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools()
    }
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/*
 * One Backstage per machine.
 *
 * Two instances would each hold their own Supabase client over the same
 * encrypted session file, and both would run a refresh timer against the same
 * refresh token — which rotates on use, so whichever refreshed second would
 * present a token the server had already retired and be signed out at random.
 * A second launch raises the existing window instead.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(async () => {
    // The name and the Windows AppUserModelID, before any window exists —
    // the taskbar reads them when the first one is created.
    applyAppIdentity()

    /*
     * Handlers must exist before any window can call them — and the stored
     * session must be resolved before any window can *paint*, which is why
     * this is awaited. The renderer's first frame then already knows whether
     * it is showing the workspace or the login page, so neither is ever shown
     * and then withdrawn.
     */
    await registerIpcHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})