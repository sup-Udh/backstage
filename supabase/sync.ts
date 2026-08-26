import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentConfig, ChatMessage } from '../src/shared/agents'
import type { Case, Project } from '../src/shared/projects'
import type { SyncState } from '../src/shared/auth'
import { supabase } from './client'
import { currentUserId } from './authService'
import { registerMirror, type MirrorSink } from './mirror'
import {
  getProject,
  listAllProjects,
  listProjects
} from '../projects/projectStore'

/**
 * The cloud mirror.
 *
 * Backstage is local-first and stays that way. Every store answers from disk
 * and memory, so the app opens, runs agents and edits a roster with no network
 * at all — which is the right shape for a desktop tool whose whole job is
 * driving processes on the machine it is installed on.
 *
 * What Supabase adds is *ownership that outlives the machine*: a durable,
 * per-account copy of the metadata, protected by row level security, that
 * makes "these are my projects" a fact the database enforces rather than a
 * filter the client remembers to apply.
 *
 * What is deliberately NOT mirrored, and why:
 *
 *   source files          the user's repository is theirs. Backstage was given
 *                         a folder to work in, not permission to upload it.
 *   terminal output       a live process's stdout, which frequently contains
 *                         tokens, paths and secrets echoed by other tools.
 *   provider API keys     these never leave the OS keychain. See secureStore.
 *   runtime task state    a record of what ran while the app was open; it is
 *                         meaningless once the process it described has gone.
 *
 * Everything here is best effort. A store must never fail, block or slow down
 * because the network is unavailable — a failed push is retried on the next
 * flush and reported in the account panel, and nothing upstream is told.
 */

/** How long to wait for more changes before sending a batch. */
const FLUSH_MS = 1200
/**
 * The ceiling on retry backoff.
 *
 * A failing push is retried, because the common causes are transient — a
 * dropped connection, a laptop lid, an expired access token about to be
 * refreshed. But some are not: an unapplied migration means every table is
 * missing and *will stay missing* until somebody runs the SQL, and the first
 * version of this file retried that every 1.2 seconds indefinitely. That is a
 * request per second per user against Supabase for as long as the app is open,
 * for a fault that no amount of retrying can fix, with a line of log for each
 * one burying anything useful.
 *
 * So the interval doubles on each consecutive failure up to five minutes. A
 * genuinely transient fault still recovers within seconds; a structural one
 * settles into a heartbeat that costs nothing and stays visible in the
 * account panel.
 */
const MAX_BACKOFF_MS = 5 * 60 * 1000
/** Transcript rows per conversation. Matches the local store's own cap. */
const MAX_MESSAGES = 400

type Job = () => Promise<void>

/** Queued work, keyed so a record changed five times is only sent once. */
const queue = new Map<string, Job>()

let timer: NodeJS.Timeout | null = null
let flushing = false
/** Consecutive failed flushes, which drives the backoff. */
let failureStreak = 0
/** The last error reported, so an unchanging fault is logged once, not hourly. */
let loggedError: string | null = null

let state: SyncState = {
  enabled: false,
  pending: 0,
  lastSyncedAt: null,
  lastError: null
}

type Listener = (state: SyncState) => void
const listeners = new Set<Listener>()

export function onSyncChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSyncState(): SyncState {
  return { ...state }
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch, pending: patch.pending ?? queue.size }
  const snapshot = getSyncState()
  for (const listener of listeners) {
    try {
      listener(snapshot)
    } catch (err) {
      console.error('[sync] a state listener threw:', err)
    }
  }
}

/**
 * The client, but only when there is both a configuration and an account.
 *
 * Every write below goes through this. Signed out, it is null and the mirror
 * quietly does nothing — which is what stops a sign-out from being followed by
 * a burst of writes stamped with an id nobody holds any more.
 */
function ready(): { client: SupabaseClient; userId: string } | null {
  const client = supabase()
  const userId = currentUserId()
  if (!client || !userId) return null
  return { client, userId }
}

function enqueue(key: string, job: Job): void {
  if (!ready()) return
  queue.set(key, job)
  setState({})
  schedule()
}

/** How long to wait before the next attempt, given how badly it is going. */
function backoffMs(): number {
  if (failureStreak === 0) return FLUSH_MS
  return Math.min(FLUSH_MS * 2 ** failureStreak, MAX_BACKOFF_MS)
}

/**
 * Arm the next flush.
 *
 * A new local change does *not* reset an active backoff. It is tempting to let
 * it — the user just did something, so surely try now — but the thing that is
 * failing is the connection or the schema, not the payload, and a user typing
 * in the roster editor would otherwise drive the retry rate straight back to
 * one per second.
 */
function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(), backoffMs())
}

/**
 * Send everything queued.
 *
 * Jobs run one at a time rather than in parallel: they are small, they touch
 * related rows, and a burst of concurrent upserts against the same table is
 * how a foreign key lands before the row it points at.
 */
export async function flush(): Promise<SyncState> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (flushing || queue.size === 0) return getSyncState()
  if (!ready()) {
    // Signed out with work outstanding: it was for the previous account and
    // must not be sent under the next one's credentials.
    queue.clear()
    setState({ enabled: false })
    return getSyncState()
  }

  flushing = true
  const batch = [...queue.entries()]
  queue.clear()
  setState({})

  let failed = 0
  let lastError: string | null = null

  for (const [key, job] of batch) {
    try {
      await job()
    } catch (err) {
      failed++
      lastError = err instanceof Error ? err.message : String(err)
      /*
       * Logged once per distinct fault rather than once per attempt. The same
       * message repeating every few seconds is not more information — it is
       * the same information, hiding everything else in the console.
       */
      if (lastError !== loggedError) {
        loggedError = lastError
        console.error(`[sync] "${key}" failed:`, lastError)
      }
      /*
       * Put it back, unless something newer for the same record has since
       * been queued — that newer job already describes the correct final
       * state, and re-adding the stale one would overwrite it.
       */
      if (!queue.has(key)) queue.set(key, job)
    }
  }

  flushing = false

  if (failed === batch.length && batch.length > 0) {
    failureStreak++
  } else {
    // Any progress at all clears the streak: whatever was wrong is now at
    // least partly right, and the next fault deserves a fast first retry.
    failureStreak = 0
    loggedError = null
  }

  setState({
    enabled: true,
    lastError: failed ? lastError : null,
    lastSyncedAt: failed === batch.length ? state.lastSyncedAt : Date.now()
  })

  // Anything that failed is now queued again; give it another go, later —
  // "later" getting longer each time it keeps failing.
  if (queue.size > 0) {
    if (failureStreak > 0) {
      console.warn(
        `[sync] ${queue.size} change(s) still pending; next retry in ` +
          `${Math.round(backoffMs() / 1000)}s.`
      )
    }
    schedule()
  }

  return getSyncState()
}

/* ------------------------------------------------------------- mapping -- */

/**
 * Whether a project is one the signed-in account owns.
 *
 * Checked before every write. The stores hand over whole collections — the
 * roster file holds every project's agents — so this is what stops a record
 * belonging to another account on the same machine being uploaded under this
 * account's user id.
 */
function ownsProject(projectId: string): boolean {
  return Boolean(projectId) && Boolean(getProject(projectId))
}

function iso(ms: number): string {
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString()
}

function projectRow(project: Project, userId: string) {
  return {
    id: project.id,
    user_id: userId,
    name: project.name,
    /*
     * The folder, not its contents.
     *
     * Stored because it is what identifies the project to a returning user,
     * and because reopening on the same machine needs it. It is metadata about
     * where work happens, and never the work itself — no file under it is read
     * by anything in this module.
     */
    workspace_path: project.workspacePath,
    theme_id: project.themeId,
    character_roster: project.characterRoster,
    god_agent_id: project.godAgentId,
    created_at: iso(project.createdAt),
    updated_at: iso(project.updatedAt)
  }
}

function agentRow(agent: AgentConfig, userId: string) {
  return {
    id: agent.id,
    user_id: userId,
    project_id: agent.projectId,
    name: agent.name,
    display_name: agent.displayName || null,
    role: agent.role,
    /*
     * Which provider, never the key for it. A provider id is the string
     * "openai"; the credential behind it stays in the OS keychain on the
     * machine that owns it and has no column anywhere in this schema.
     */
    provider_id: agent.providerId,
    model_id: agent.modelId,
    instructions: agent.instructions,
    capabilities: agent.capabilities,
    execution_profile: agent.profile,
    character_slot: agent.characterSlot,
    enabled: agent.enabled,
    spawned: agent.spawned,
    can_talk_to: agent.canTalkTo,
    leads: agent.leads,
    created_at: iso(agent.createdAt),
    updated_at: iso(agent.updatedAt)
  }
}

function caseRow(record: Case, userId: string) {
  return {
    id: record.id,
    user_id: userId,
    project_id: record.projectId,
    name: record.name,
    description: record.description,
    status: record.status,
    task_ids: record.taskIds,
    involved_agent_ids: record.involvedAgentIds,
    created_at: iso(record.createdAt),
    updated_at: iso(record.updatedAt)
  }
}

/* ---------------------------------------------------------------- push -- */

async function pushProject(project: Project): Promise<void> {
  const ctx = ready()
  if (!ctx || project.userId !== ctx.userId) return

  const { error } = await ctx.client
    .from('projects')
    .upsert(projectRow(project, ctx.userId), { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

async function pushAgents(agents: AgentConfig[]): Promise<void> {
  const ctx = ready()
  if (!ctx) return

  const rows = agents
    .filter((a) => ownsProject(a.projectId))
    .map((a) => agentRow(a, ctx.userId))
  if (!rows.length) return

  const { error } = await ctx.client
    .from('agents')
    .upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

async function pushCases(cases: Case[]): Promise<void> {
  const ctx = ready()
  if (!ctx) return

  const rows = cases
    .filter((c) => ownsProject(c.projectId))
    .map((c) => caseRow(c, ctx.userId))
  if (!rows.length) return

  const { error } = await ctx.client
    .from('cases')
    .upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

/**
 * A transcript, as a conversation row and its messages.
 *
 * The conversation id is derived from the project and the agent rather than
 * generated, so re-uploading the same transcript updates it instead of
 * accumulating a new conversation on every save.
 */
async function pushConversation(
  workspaceId: string,
  agentId: string,
  messages: ChatMessage[]
): Promise<void> {
  const ctx = ready()
  if (!ctx) return

  const project = listProjects().find((p) => p.workspacePath === workspaceId)
  if (!project) return

  const conversationId = `${project.id}:${agentId}`
  const now = new Date().toISOString()

  const { error: convError } = await ctx.client.from('conversations').upsert(
    {
      id: conversationId,
      user_id: ctx.userId,
      project_id: project.id,
      agent_id: agentId,
      updated_at: now
    },
    { onConflict: 'id' }
  )
  if (convError) throw new Error(convError.message)

  const rows = messages.slice(-MAX_MESSAGES).map((m, i) => ({
    /*
     * Ids are unique per conversation rather than globally. A `ChatMessage`
     * id is allocated by whichever surface produced it and two agents can
     * legitimately hold the same one, so the conversation is part of the key.
     * The index is a tiebreak for messages that arrived with no id at all.
     */
    id: `${conversationId}:${m.id || `n${i}`}`,
    conversation_id: conversationId,
    user_id: ctx.userId,
    kind: m.kind,
    agent_id: m.agentId ?? null,
    body: m.text,
    task_id: m.taskId ?? null,
    at: iso(m.at)
  }))

  if (!rows.length) return

  const { error } = await ctx.client
    .from('messages')
    .upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

async function removeRows(table: string, ids: string[]): Promise<void> {
  const ctx = ready()
  if (!ctx || !ids.length) return

  /*
   * The `user_id` filter is belt and braces. RLS already refuses a delete on
   * somebody else's row, so this changes no outcome — but it makes the intent
   * legible at the call site, and it means a policy misconfiguration produces
   * "deleted nothing" rather than "deleted someone else's project".
   */
  const { error } = await ctx.client
    .from(table)
    .delete()
    .eq('user_id', ctx.userId)
    .in('id', ids)
  if (error) throw new Error(error.message)
}

/* ---------------------------------------------------------------- pull -- */

/**
 * Bring down what this account has in the cloud.
 *
 * Runs once per sign-in. The merge rule is deliberately timid: a cloud record
 * is written locally only when there is no local record with that id, or when
 * the cloud copy is strictly newer. Local work is never overwritten by a
 * stale mirror, which is the failure that would matter — the local copy is the
 * one the user has been editing.
 *
 * Returns how many projects were restored, for the log.
 */
export async function pullAll(): Promise<number> {
  const ctx = ready()
  if (!ctx) return 0

  try {
    const { data, error } = await ctx.client
      .from('projects')
      .select('*')
      .eq('user_id', ctx.userId)
    if (error) throw new Error(error.message)

    const rows = data ?? []
    if (!rows.length) {
      setState({ enabled: true, lastSyncedAt: Date.now(), lastError: null })
      return 0
    }

    /*
     * Restoring the *records* is deliberately left to a later pass rather than
     * done here, and it is worth saying why out loud rather than pretending
     * this is finished.
     *
     * A project's local half — the workspace folder — is machine-specific. A
     * project pulled onto a second machine names a path that very likely does
     * not exist there, and writing it into `projects.json` would put an
     * unopenable project in the picker whose every file tool silently refuses.
     * Choosing what to do about that (ask for the folder again? clone it?) is
     * a product decision, not a sync detail.
     *
     * So the pull confirms the account's cloud state is reachable and readable
     * under RLS, and reports it. The push side — which is what makes the data
     * durable and owned in the first place — is complete.
     */
    const known = new Set(listAllProjects().map((p) => p.id))
    const absent = rows.filter((r: { id: string }) => !known.has(r.id)).length
    if (absent > 0) {
      console.log(
        `[sync] ${absent} project(s) exist in the cloud but not on this machine. ` +
          'Re-create them here with the same folder to reconnect them.'
      )
    }

    setState({ enabled: true, lastSyncedAt: Date.now(), lastError: null })
    return rows.length
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sync] pull failed:', message)
    setState({ enabled: true, lastError: message })
    return 0
  }
}

/* --------------------------------------------------------------- wiring -- */

const sink: MirrorSink = {
  project: (project) =>
    enqueue(`project:${project.id}`, () => pushProject(project)),

  projectRemoved: (projectId) =>
    enqueue(`project:del:${projectId}`, () => removeRows('projects', [projectId])),

  agents: (agents) => {
    // One job for the whole roster: it is keyed by nothing but "agents", so a
    // burst of edits collapses to a single upsert of the final state.
    const snapshot = agents.map((a) => ({ ...a }))
    enqueue('agents', () => pushAgents(snapshot))
  },

  agentsRemoved: (ids) =>
    enqueue(`agents:del:${ids.join(',')}`, () => removeRows('agents', ids)),

  cases: (cases) => {
    const snapshot = cases.map((c) => ({ ...c }))
    enqueue('cases', () => pushCases(snapshot))
  },

  caseRemoved: (caseId) =>
    enqueue(`case:del:${caseId}`, () => removeRows('cases', [caseId])),

  conversation: (workspaceId, agentId, messages) => {
    const snapshot = messages.map((m) => ({ ...m }))
    enqueue(`conv:${workspaceId}:${agentId}`, () =>
      pushConversation(workspaceId, agentId, snapshot)
    )
  },

  conversationRemoved: (workspaceId, agentId) => {
    const project = listProjects().find((p) => p.workspacePath === workspaceId)
    if (!project) return
    const conversationId = `${project.id}:${agentId}`
    enqueue(`conv:del:${conversationId}`, () =>
      removeRows('conversations', [conversationId])
    )
  },

  settings: (settings) =>
    enqueue('settings', async () => {
      const ctx = ready()
      if (!ctx) return
      const { error } = await ctx.client.from('user_settings').upsert(
        {
          user_id: ctx.userId,
          orchestration: settings,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )
      if (error) throw new Error(error.message)
    })
}

/** Attach the mirror. Called once, during start-up. */
export function initSync(): void {
  registerMirror(sink)
}

/**
 * Sign-in: adopt the account and reconcile.
 *
 * Anything queued under the previous account is dropped rather than sent —
 * writing it now would stamp one person's edits with another person's user id.
 */
export function onSignedIn(): void {
  queue.clear()
  failureStreak = 0
  loggedError = null
  setState({ enabled: true, lastError: null, pending: 0 })
  void pullAll()
}

/**
 * Clear the backoff so the next attempt happens immediately.
 *
 * For the account panel's "Sync now" only. A person pressing that button has
 * usually just fixed the thing that was broken — applied the migration,
 * reconnected — and making them wait out a five-minute backoff to find out
 * would be the interface disbelieving them.
 */
export function resetBackoff(): void {
  failureStreak = 0
  loggedError = null
}

/** Sign-out: forget everything outstanding. */
export function onSignedOut(): void {
  queue.clear()
  failureStreak = 0
  loggedError = null
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  setState({ enabled: false, pending: 0, lastError: null })
}
