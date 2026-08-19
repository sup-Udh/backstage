import { registerProviderHandlers, primeProviders } from './providers'
import { registerWorkspaceHandlers } from './workspace'
import { registerAgentHandlers } from './agents'
import { loadWorkspace } from '../workspace/WorkspaceManager'

/** Register every IPC surface. Called once, after the app is ready. */
export function registerIpcHandlers(): void {
  loadWorkspace()
  registerProviderHandlers()
  registerWorkspaceHandlers()
  registerAgentHandlers()

  // Re-verify stored keys in the background so the UI shows the right state
  // on launch without blocking the window.
  void primeProviders()
}
