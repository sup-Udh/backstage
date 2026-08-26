import { ipcMain } from 'electron'
import type { WorkspaceInfo } from '../src/shared/providerApi'
import {
  getWorkspace,
  pickWorkspace,
  setWorkspace
} from '../workspace/WorkspaceManager'
import { fileWatcher } from '../workspace/FileWatcher'

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:get', (): WorkspaceInfo => getWorkspace())

  ipcMain.handle('workspace:choose', async (): Promise<WorkspaceInfo> => {
    const info = await pickWorkspace()
    // Re-point the watcher, or it keeps reporting the old project.
    fileWatcher.sync()
    return info
  })

  ipcMain.handle('workspace:clear', (): WorkspaceInfo => {
    const info = setWorkspace(null)
    fileWatcher.sync()
    return info
  })
}
