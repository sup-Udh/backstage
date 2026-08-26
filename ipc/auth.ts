import { BrowserWindow, ipcMain } from 'electron'
import type { AuthState, SyncState } from '../src/shared/auth'
import {
  cancelSignIn,
  getAuthState,
  initAuth,
  onAuthChanged,
  signInWithGoogle,
  signOut
} from '../supabase/authService'
import {
  flush,
  getSyncState,
  initSync,
  onSignedIn,
  onSignedOut,
  onSyncChanged,
  pullAll
} from '../supabase/sync'
import { claimUnownedProjects, closeActiveProject } from '../projects/projectStore'
import { agentRegistry } from '../agents/AgentRegistry'
import { orchestrator } from '../agents/AgentOrchestrator'
import { fileWatcher } from '../workspace/FileWatcher'
import { terminals } from '../terminal/TerminalSessionManager'
import { agentSessions } from '../terminal/AgentSessionManager'

/**
 * The account surface.
 *
 * Four verbs and two subscriptions. Note what is *not* here: there is no way
 * for the renderer to obtain a token, a session, or a Supabase client. It can
 * ask who is signed in and ask for that to change, and that is the whole of
 * its authority — the same shape as the provider surface, which lets the
 * renderer connect a key it can never read back.
 */

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** The last status seen, so a transition can be told from a repeat. */
let previousStatus: AuthState['status'] = 'initialising'

/**
 * React to somebody signing in.
 *
 * Two things have to happen before the renderer is allowed to render a
 * dashboard, and both are here rather than in `authService` because they reach
 * into stores that authentication itself must not depend on:
 *
 *   1. pre-account projects are claimed, once per machine, so an existing
 *      install does not present as having lost everything;
 *   2. the roster registry is rebuilt, because which agents exist is a
 *      function of which project is open, which is now a function of who is
 *      signed in.
 */
function handleSignedIn(): void {
  const claimed = claimUnownedProjects()
  if (claimed > 0) agentRegistry.refreshAll()
  onSignedIn()
}

/**
 * React to somebody signing out.
 *
 * This is the part that makes logout mean something beyond the interface
 * changing. In order:
 *
 *   stop every running execution   an agent mid-task is holding a workspace
 *                                  path and a provider key on behalf of an
 *                                  account that has just ended
 *   kill the terminals and the     a PTY outlives the window that opened it.
 *   external CLI sessions          Left alone, a signed-out user's shell keeps
 *                                  running with its cwd inside their
 *                                  repository, and its scrollback — which
 *                                  routinely contains paths, tokens and git
 *                                  history — is still there for whoever signs
 *                                  in next. This is the same teardown
 *                                  `before-quit` performs, for the same
 *                                  reason: signing out is handing the machine
 *                                  over.
 *   close the active project       which clears the workspace root, so the
 *                                  path validator every file and terminal tool
 *                                  resolves against now refuses everything
 *   stop watching the folder       nothing should be reporting file changes in
 *                                  a signed-out user's repository
 *   drop queued cloud writes       they belong to the previous account and
 *                                  must not be sent under the next one's id
 *   rebuild the registry           so the roster resolves to nothing
 *
 * After this the main process answers every scoped read with nothing, whatever
 * the renderer asks — which is what requirement 16's back-navigation test is
 * actually testing.
 */
function handleSignedOut(): void {
  orchestrator.stopAll()
  agentSessions.dispose()
  terminals.disposeAll()
  closeActiveProject()
  fileWatcher.sync()
  onSignedOut()
  agentRegistry.refreshAll()
}

export function registerAuthHandlers(): void {
  initSync()

  ipcMain.handle('auth:state', (): AuthState => getAuthState())
  ipcMain.handle('auth:signInWithGoogle', (): Promise<AuthState> => signInWithGoogle())
  ipcMain.handle('auth:cancelSignIn', (): AuthState => cancelSignIn())
  ipcMain.handle('auth:signOut', (): Promise<AuthState> => signOut())

  ipcMain.handle('auth:syncState', (): SyncState => getSyncState())
  ipcMain.handle('auth:syncNow', async (): Promise<SyncState> => {
    await flush()
    await pullAll()
    return getSyncState()
  })

  /*
   * One subscription, mirrored to every window.
   *
   * The transition is detected here rather than inside `authService`, because
   * the side effects above belong to the application and not to
   * authentication — `authService` deciding to stop agent executions would
   * make the module that knows about Google also the module that knows about
   * the orchestrator.
   */
  onAuthChanged((state) => {
    if (state.status !== previousStatus) {
      const was = previousStatus
      previousStatus = state.status

      if (state.status === 'authenticated') handleSignedIn()
      else if (state.status === 'unauthenticated' && was === 'authenticated') {
        handleSignedOut()
      }
    }

    broadcast('auth:changed', state)
  })

  onSyncChanged((state) => broadcast('auth:syncChanged', state))
}

/**
 * Resolve the stored session.
 *
 * Awaited before the first window is created. That ordering is the whole of
 * requirement 11's "no flash": the renderer's very first paint already knows
 * whether it is showing the workspace or the login page, so neither is ever
 * rendered and then withdrawn.
 */
export async function initAuthState(): Promise<AuthState> {
  const state = await initAuth()

  // `onAuthChanged` was not subscribed for the initial resolve, so the
  // sign-in side effects for a *restored* session are applied here.
  previousStatus = state.status
  if (state.status === 'authenticated') handleSignedIn()

  return state
}
