import { app } from 'electron'
import { registerProviderHandlers, primeProviders } from './providers'
import { registerWorkspaceHandlers } from './workspace'
import { registerAgentHandlers, disposeAgentHandlers } from './agents'
import { registerTerminalHandlers } from './terminal'
import { registerProjectHandlers } from './project'
import { registerProjectsHandlers } from './projects'
import { registerAuthHandlers, initAuthState } from './auth'
import { bootstrapProjects } from '../projects/bootstrap'
import { loadWorkspace } from '../workspace/WorkspaceManager'
import { fileWatcher } from '../workspace/FileWatcher'
import { terminals } from '../terminal/TerminalSessionManager'
import { agentSessions } from '../terminal/AgentSessionManager'

/**
 * Register every IPC surface. Called once, after the app is ready.
 *
 * Async now, and awaited before the first window opens, because of the one
 * step that cannot be deferred: resolving the stored Supabase session. Every
 * scoped read in the main process asks "who is signed in?" before it asks
 * anything else, so a window that painted while that answer was still
 * outstanding would render the login page over a valid session — or, worse,
 * ask for a roster and be told there is none because nobody had been
 * identified yet.
 */
export async function registerIpcHandlers(): Promise<void> {
  loadWorkspace()

  registerProviderHandlers()
  registerWorkspaceHandlers()
  registerAgentHandlers()
  registerTerminalHandlers()
  registerProjectHandlers()
  registerProjectsHandlers()
  registerAuthHandlers()

  /*
   * Who is signed in, before anything is scoped to them.
   *
   * This reads an encrypted file and, if the access token has expired,
   * refreshes it over the network — so it is genuinely awaited rather than
   * fired off. It is bounded by supabase-js's own request timeout; a machine
   * with no connectivity resolves to "signed out", which is the correct and
   * recoverable answer.
   */
  await initAuthState()

  /*
   * Resolve which project is open, now that there is an owner to resolve it
   * against.
   *
   * Every scoped read — the roster, the automations, the relationships —
   * answers against whatever is active, so a window that rendered before this
   * ran would ask for its team and be told, correctly, that there isn't one.
   * It also re-points the workspace at the stored project, which is why it
   * comes after `loadWorkspace` rather than instead of it, and after the
   * session resolve because a project is now owned by somebody.
   */
  bootstrapProjects()

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
