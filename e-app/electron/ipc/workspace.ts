import { ipcMain } from 'electron'
import type { WorkspaceInfo } from '../../src/shared/providerApi'
import {
  getWorkspace,
  pickWorkspace,
  setWorkspace
} from '../workspace/WorkspaceManager'

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:get', (): WorkspaceInfo => getWorkspace())
  ipcMain.handle('workspace:choose', (): Promise<WorkspaceInfo> => pickWorkspace())
  ipcMain.handle('workspace:clear', (): WorkspaceInfo => setWorkspace(null))
}
