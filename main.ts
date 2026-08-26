import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { appIconPath, applyAppIdentity } from './appIcon'

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