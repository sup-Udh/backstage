import { app } from 'electron'
import { registerProviderHandlers, primeProviders } from './providers'
import { registerWorkspaceHandlers } from './workspace'
import { registerAgentHandlers, disposeAgentHandlers } from './agents'
import { registerTerminalHandlers } from './terminal'
import { registerProjectHandlers } from './project'
import { registerProjectsHandlers } from './projects'
import { bootstrapProjects } from '../projects/bootstrap'
import { loadWorkspace } from '../workspace/WorkspaceManager'
import { fileWatcher } from '../workspace/FileWatcher'
import { terminals } from '../terminal/TerminalSessionManager'
import { agentSessions } from '../terminal/AgentSessionManager'

/** Register every IPC surface. Called once, after the app is ready. */
export function registerIpcHandlers(): void {
  loadWorkspace()
  /*
   * Resolve which project is open before any handler can be called.
   *
   * Every scoped read — the roster, the automations, the relationships —
   * answers against whatever is active, so a window that rendered before this
   * ran would ask for its team and be told, correctly, that there isn't one.
   * It also re-points the workspace at the stored project, which is why it
   * comes after `loadWorkspace` rather than instead of it.
   */
  bootstrapProjects()

  registerProviderHandlers()
  registerWorkspaceHandlers()
  registerAgentHandlers()
  registerTerminalHandlers()
  registerProjectHandlers()
  registerProjectsHandlers()

  // Watch the open project so changes made by external CLI agents are seen.
  fileWatcher.sync()

  // Re-verify stored keys in the background so the UI shows the right state
  // on launch without blocking the window.
  void primeProviders()

  /*
   * A PTY outlives its window unless it is killed explicitly, which would
   * leave orphaned shells behind every time the app closes.
   */
  app.on('before-quit', () => {
    // Stop Backstage's own executions first, so nothing is mid-tool-call
    // against a workspace whose watchers are about to go away.
    disposeAgentHandlers()
    terminals.disposeAll()
    agentSessions.dispose()
    fileWatcher.stop()
  })
}
