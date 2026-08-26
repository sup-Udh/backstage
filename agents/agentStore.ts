import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig, ExecutionProfile } from './agent.types'
import {
  DEFAULT_CAPABILITIES,
  normaliseCapabilities
} from '../../src/shared/capabilities'
import {
  canConnect,
  connectionsOf as graphConnectionsOf,
  groupOf as graphGroupOf,
  leadOf as graphLeadOf,
  workersOf as graphWorkersOf,
  type LinkResult
} from './relationships'
import { getActiveProjectId } from '../projects/projectStore'
import type { RosterEntry } from '../../src/shared/projects'
import { roleProfile } from './roleProfiles'
import { once } from './migrations'

/**
 * The team roster, persisted.
 *
 * This is *configuration* — who an agent is — and is deliberately separate
 * from runtime state, which is what an agent is doing right now. Nothing here
 * ever holds a task, a status or an API key: configuration survives restarts,
 * runtime state does not.
 *
 * One file holds every project's agents, and every read above `loadAgents` is
 * filtered to the open project. That filter is the whole of project isolation:
 * the orchestrator, the team tools, the registry, the threads, the awareness
 * block and the prompt builder all reach the roster through `listAgents` and
 * `getAgent`, so scoping those two scopes all of them. Anything that needs to
 * see across projects has to say so, by name, through `listAllAgents`.
 */

const FILE = 'agents.json'

function path(): string {
  return join(app.getPath('userData'), FILE)
}

const PROFILES: ExecutionProfile[] = ['quick', 'normal', 'deep']

let agents: AgentConfig[] | null = null

/**
 * Coerce anything into a valid agent, or reject it.
 *
 * Also the migration path: a roster written by an earlier build stored tool
 * *families* rather than capabilities, and had no spawned/theme fields.
 * Reading it must not lose the user's permission choices, so families are
 * mapped rather than discarded.
 */
function normalise(raw: unknown): AgentConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const id = typeof a.id === 'string' ? a.id.trim() : ''
  const name = typeof a.name === 'string' ? a.name.trim() : ''
  if (!id || !name) return null

  const capabilitySource =
    a.capabilities !== undefined ? a.capabilities : (a as { tools?: unknown }).tools

  /*
   * Presence, and the one place it is inferred.
   *
   * `spawned` did not exist before agents could be spawned, so a roster from
   * an earlier build has no opinion on it. Treating that silence as "not in
   * the office" emptied teams that were already working and made the app look
   * broken on upgrade. An absent field therefore means "this agent predates
   * the idea", and an enabled agent from that era is restored to the office it
   * was already in. An explicitly false field is the user's own decision and
   * is always honoured.
   */
  const declaresSpawn = Object.prototype.hasOwnProperty.call(a, 'spawned')
  const spawned = declaresSpawn ? a.spawned === true : a.enabled !== false

  return {
    id,
    /*
     * Never inferred from the open project.
     *
     * An agent written before projects existed genuinely has no project, and
     * guessing the active one would silently adopt another project's agents
     * into whichever one happened to be open at the time. The migration
     * stamps them deliberately, once; everything else leaves an unstamped
     * agent invisible, which is the safe reading.
     */
    projectId: typeof a.projectId === 'string' ? a.projectId : '',
    name,
    displayName: typeof a.displayName === 'string' ? a.displayName.trim() : '',
    role: typeof a.role === 'string' && a.role.trim() ? a.role.trim() : 'Agent',
    providerId: typeof a.providerId === 'string' ? a.providerId : 'openai',
    modelId: typeof a.modelId === 'string' && a.modelId ? a.modelId : null,
    instructions: typeof a.instructions === 'string' ? a.instructions : '',
    capabilities:
      capabilitySource === undefined
        ? [...DEFAULT_CAPABILITIES]
        : normaliseCapabilities(capabilitySource),
    profile: PROFILES.includes(a.profile as ExecutionProfile)
      ? (a.profile as ExecutionProfile)
      : 'normal',
    characterSlot: Number.isFinite(a.characterSlot) ? Number(a.characterSlot) : 0,
    enabled: a.enabled !== false,
    spawned,
    workspace: typeof a.workspace === 'string' && a.workspace ? a.workspace : null,
    canTalkTo: Array.isArray(a.canTalkTo)
      ? a.canTalkTo.filter((x): x is string => typeof x === 'string')
      : [],
    /*
     * Absent means "leads nobody", which is the right reading for a roster
     * written before direction existed: those connections were symmetrical,
     * and inventing a lead for them would grant an authority the user never
     * expressed. They stay peers until somebody re-draws the link.
     */
    leads: Array.isArray(a.leads)
      ? a.leads.filter((x): x is string => typeof x === 'string')
      : [],
    createdAt: Number.isFinite(a.createdAt) ? Number(a.createdAt) : Date.now(),
    updatedAt: Number.isFinite(a.updatedAt) ? Number(a.updatedAt) : Date.now()
  }
}

/**
 * Every agent on disk, across every project.
 *
 * Internal, and exported only as `listAllAgents` for the two callers that
 * genuinely need to see across projects: the migration, and id allocation.
 * Everything else goes through `roster()`.
 *
 * There is no starting team any more. An agent belongs to a project, projects
 * are created by the setup wizard, and the wizard seeds the roster from the
 * cast the user picked — so inventing four agents here would put people in an
 * office that does not exist yet, in a theme nobody has chosen.
 */
export function loadAgents(): AgentConfig[] {
  if (agents) return agents
  try {
    if (existsSync(path())) {
      const parsed = JSON.parse(readFileSync(path(), 'utf8'))
      const list = Array.isArray(parsed) ? parsed : []
      agents = list.map(normalise).filter((a): a is AgentConfig => a !== null)
      grantTeamTalkOnce()
      return agents
    }
  } catch {
    /*
     * A corrupt file should not stop the app. It is deliberately *not*
     * persisted over: an empty in-memory roster is recoverable by hand, and
     * writing `[]` back would destroy the file that still holds the user's
     * agents.
     */
  }
  agents = []
  return agents
}

/**
 * Give every existing agent the team capability, once.
 *
 * `agents.talk` used to be granted by a keyword regex over the agent's role
 * string, so whether a team could collaborate depended on how its theme had
 * worded its job titles. That was fixed in `roleProfiles.ts` — every seeded
 * agent now gets it — but seeding only runs when a project is *created*.
 *
 * Every project that already existed kept the capabilities written to disk on
 * the day it was made. So the fix silently applied to new projects only, and
 * the people most affected by the bug — anyone who had already built a team —
 * saw exactly no change. Their workers still could not use the team tools, and
 * their lead only could because being the lead grants it separately at
 * execution time.
 *
 * Granting it is not granting reach: `agents.talk` is unprivileged, spends
 * nothing, and only allows the team tools to be *used*. Who an agent may
 * actually contact is still `canTalkTo`, which this does not touch.
 *
 * Runs once and is then recorded, so a user who deliberately mutes an agent on
 * the Agents page stays muted rather than having it handed back next launch.
 */
function grantTeamTalkOnce(): void {
  once('agents.talk-for-existing-rosters', () => {
    const all = agents ?? []
    let changed = false
    for (const agent of all) {
      if (agent.capabilities.includes('agents.talk')) continue
      agent.capabilities = [...agent.capabilities, 'agents.talk']
      agent.updatedAt = Date.now()
      changed = true
    }
    if (changed) persist()
  })
}

/** Every agent in every project. Say so by name; the default is scoped. */
export function listAllAgents(): AgentConfig[] {
  return loadAgents()
}

/**
 * Write the roster out.
 *
 * Every mutator here persists on its own, so this exists for exactly one
 * caller: the migration, which stamps a project id onto records it holds
 * directly. Giving it a named function beats adding a migration-shaped mutator
 * to the store, and beats the migration reaching back in through a require.
 */
export function persistAgents(): void {
  // Load first. Persisting before the file has been read would write the empty
  // in-memory list over the roster it was about to be filled from.
  loadAgents()
  persist()
}

/** The open project's agents. The default view everything else gets. */
function roster(): AgentConfig[] {
  const projectId = getActiveProjectId()
  if (!projectId) return []
  return loadAgents().filter((a) => a.projectId === projectId)
}

function persist(): void {
  try {
    writeFileSync(path(), JSON.stringify(agents ?? [], null, 2), 'utf8')
  } catch {
    // Losing the write is survivable; the in-memory list still works.
  }
}

export function listAgents(): AgentConfig[] {
  return roster()
}

/**
 * One agent, if it belongs to the open project.
 *
 * An agent from another project is reported as not existing rather than as
 * refused. That is the honest answer from inside a project: the runtime, the
 * tools and the UI have no concept of an agent they cannot address, and a
 * distinct "exists but is elsewhere" result would only invite callers to
 * handle a case that must never be reachable.
 */
export function getAgent(id: string): AgentConfig | undefined {
  return roster().find((a) => a.id === id)
}

/** Turn a name into a stable, readable, unique id. */
function idFor(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'agent'
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/**
 * Create or update an agent in the open project.
 *
 * Editing is scoped — an id belonging to another project is not found, so it
 * falls through to creation rather than letting one project reach into
 * another's roster through a guessed id. Ids themselves are allocated against
 * *every* project, because they key conversation files and task records, and
 * two agents called `jane` in different projects would share both.
 */
export function upsertAgent(input: Partial<AgentConfig> & { id?: string }): AgentConfig {
  const all = loadAgents()
  const mine = roster()
  const existing = input.id ? mine.find((a) => a.id === input.id) : undefined

  if (existing) {
    const merged = normalise({ ...existing, ...input, id: existing.id })
    if (merged) {
      merged.createdAt = existing.createdAt
      merged.projectId = existing.projectId
      merged.updatedAt = Date.now()
      Object.assign(existing, merged)
      persist()
    }
    return existing
  }

  const projectId = getActiveProjectId()
  if (!projectId) throw new Error('No project is open.')

  const taken = new Set(all.map((a) => a.id))
  const created = normalise({
    // Counted within the project, because the slot indexes that project's cast.
    characterSlot: mine.length,
    capabilities: [...DEFAULT_CAPABILITIES],
    // Stated rather than left absent, so a newly created agent is never
    // mistaken for one migrated from a roster that predates spawning.
    spawned: false,
    ...input,
    projectId,
    id: input.id?.trim() || idFor(String(input.name ?? 'agent'), taken),
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
  if (!created) throw new Error('An agent needs a name.')

  all.push(created)
  persist()
  return created
}

export function deleteAgent(id: string): void {
  const all = loadAgents()
  const target = roster().find((a) => a.id === id)
  if (!target) return

  all.splice(all.indexOf(target), 1)
  /*
   * A relationship pointing at a deleted agent would be a permission nobody
   * can see and nobody granted. Only this project's agents can be holding one
   * — a link never crosses projects — so only they are swept.
   */
  for (const other of roster()) {
    const before = other.canTalkTo.length + other.leads.length
    other.canTalkTo = other.canTalkTo.filter((x) => x !== id)
    other.leads = other.leads.filter((x) => x !== id)
    if (other.canTalkTo.length + other.leads.length !== before) {
      other.updatedAt = Date.now()
    }
  }
  persist()
}

/**
 * Remove every agent belonging to a project, and say which they were.
 *
 * Named by project rather than reusing `deleteAgent` in a loop, because
 * `deleteAgent` only sees the *open* project's roster — a project is deleted
 * from the picker, where nothing is open, so every one of those calls would
 * find nothing and return silently. The deleted records come back so the
 * caller can stop anything they are running and sweep what still points at
 * them; this store knows about neither.
 */
export function removeProjectAgents(projectId: string): AgentConfig[] {
  if (!projectId) return []
  const all = loadAgents()
  const doomed = all.filter((a) => a.projectId === projectId)
  if (!doomed.length) return []

  agents = all.filter((a) => a.projectId !== projectId)
  /*
   * No link sweep: a relationship never crosses projects, so everything that
   * could have been pointing at these agents has just been deleted with them.
   */
  persist()
  return doomed
}

/**
 * Create one agent per character the setup wizard picked.
 *
 * The roster arrives as characters because that is how the user chose it, and
 * their stated roles decide the instructions and permissions each one starts
 * with. `characterSlot` is the index into the project's roster, so the world,
 * the selector and the roster page all resolve the same face for the same
 * agent without any of them consulting the theme's full cast.
 *
 * Takes the entries rather than reading a theme: characters live beside canvas
 * code the main process cannot import, and keeping the lookup on the renderer
 * side is what preserves the rule that nothing behind the IPC boundary knows a
 * theme id from any other string.
 */
export function seedRoster(
  projectId: string,
  entries: RosterEntry[],
  providerId: string
): AgentConfig[] {
  const all = loadAgents()
  const taken = new Set(all.map((a) => a.id))
  const created: AgentConfig[] = []
  const now = Date.now()

  entries.forEach((entry, slot) => {
    const profile = roleProfile(entry.role)
    const agent = normalise({
      id: idFor(entry.name, taken),
      projectId,
      name: entry.name,
      role: entry.role,
      providerId,
      instructions: profile.instructions,
      capabilities: profile.capabilities,
      profile: profile.profile,
      characterSlot: slot,
      enabled: true,
      // Nobody starts spawned. Bringing an agent into the office is the user's
      // decision, and it is the moment the product feels like hiring someone.
      spawned: false,
      createdAt: now,
      updatedAt: now
    })
    if (!agent) return
    taken.add(agent.id)
    all.push(agent)
    created.push(agent)
  })

  persist()
  return created
}

/**
 * Spawn or despawn. Persisted, so the room is the same one when the app
 * reopens — the office is a place, not a session.
 */
export function setSpawned(id: string, spawned: boolean): AgentConfig | undefined {
  const agent = getAgent(id)
  if (!agent || agent.spawned === spawned) return agent
  agent.spawned = spawned
  agent.updatedAt = Date.now()
  persist()
  return agent
}

/** Whether `from` is permitted to send work or messages to `to`. */
export function mayTalkTo(fromId: string, toId: string): boolean {
  const from = getAgent(fromId)
  return !!from && from.canTalkTo.includes(toId)
}

/* --------------------------------------------------------- relationships -- */

export { MAX_CONNECTIONS, MAX_GROUP, threadIdFor } from './relationships'
export type { LinkResult } from './relationships'

/**
 * Connect two agents, with `aId` as the lead.
 *
 * Talking is mutual — both directions of `canTalkTo` are written, because a
 * worker has to be able to report back and ask for clarification. *Authority*
 * is not: the first agent, the one the user dragged the connection out of,
 * becomes the lead and is the only one of the pair who may assign work.
 *
 * That asymmetry is the whole point. A symmetrical link left a three-agent
 * group with no way to say who was in charge, so either of them could decide
 * to reassign the whole job to the other — which is how two agents end up
 * handing the same task back and forth.
 *
 * The rules live in `relationships.ts`, which is pure and tested; this applies
 * them and persists the result. The check happens here specifically because
 * this is the only place a link can be created — the UI checks too, but only
 * so a button can grey out, and a limit enforced solely in the renderer is
 * one an unrelated code path can walk straight past.
 */
export function connectAgents(aId: string, bId: string): LinkResult {
  // Scoped: a link never crosses projects, so the graph the rules are applied
  // to is this project's graph and the caps are counted within it.
  const verdict = canConnect(roster(), aId, bId)
  if (!verdict.ok) return verdict

  const a = getAgent(aId)
  const b = getAgent(bId)
  if (!a || !b) return { ok: false, error: 'That agent no longer exists.' }

  if (!a.canTalkTo.includes(bId)) a.canTalkTo.push(bId)
  if (!b.canTalkTo.includes(aId)) b.canTalkTo.push(aId)

  /*
   * Direction, written once. Re-drawing an existing link does not flip it:
   * the pair are already connected, and silently reversing who reports to whom
   * because the user dragged the same line the other way is a change they did
   * not ask for and would not see.
   */
  if (!a.leads.includes(bId) && !b.leads.includes(aId)) a.leads.push(bId)

  /*
   * Connecting also grants the ability to talk.
   *
   * `canTalkTo` decides *who* an agent may contact, but the tools that do the
   * contacting only exist for an agent holding `agents.talk` — so a link
   * without it produced a relationship the UI showed, the prompt described,
   * and the agent could not act on. Asked to pass something to a teammate it
   * would answer, correctly and uselessly, that it had no way to.
   *
   * Granting it here is not an escalation the user did not ask for: drawing a
   * line between two characters *is* the request for them to be able to talk,
   * and this is the least privilege that satisfies it. It reaches no files,
   * no shell and no network — only the teammates now named in `canTalkTo`,
   * which is the same list this call just wrote.
   */
  const granted: string[] = []
  for (const agent of [a, b]) {
    if (agent.capabilities.includes('agents.talk')) continue
    agent.capabilities = [...agent.capabilities, 'agents.talk']
    granted.push(agent.name)
  }

  a.updatedAt = Date.now()
  b.updatedAt = Date.now()
  persist()
  return { ok: true, granted }
}

/** Remove a connection, in both directions. */
export function disconnectAgents(aId: string, bId: string): LinkResult {
  const a = getAgent(aId)
  const b = getAgent(bId)
  if (!a || !b) return { ok: false, error: 'That agent no longer exists.' }

  const before =
    a.canTalkTo.length + b.canTalkTo.length + a.leads.length + b.leads.length
  a.canTalkTo = a.canTalkTo.filter((x) => x !== bId)
  b.canTalkTo = b.canTalkTo.filter((x) => x !== aId)
  // Authority goes with the connection. A lead entry outliving the link it
  // came from is a permission nobody can see and nobody granted.
  a.leads = a.leads.filter((x) => x !== bId)
  b.leads = b.leads.filter((x) => x !== aId)

  const after =
    a.canTalkTo.length + b.canTalkTo.length + a.leads.length + b.leads.length
  if (after === before) return { ok: true }

  a.updatedAt = Date.now()
  b.updatedAt = Date.now()
  persist()
  return { ok: true }
}

/**
 * Everyone this agent is connected to, in either direction.
 *
 * A link written by an earlier build, or by editing the agent directly, can be
 * one-way. Treating it as a connection is the safe reading: it is a route work
 * can travel along, so it counts against the cap and it is shown to the user.
 */
export function connectionsOf(agent: AgentConfig): string[] {
  return graphConnectionsOf(roster(), agent.id)
}

/**
 * Everyone reachable from this agent through connections, including itself.
 *
 * The collaboration group: who shares a thread, and what the group cap is
 * measured against.
 */
export function groupOf(agentId: string): string[] {
  return graphGroupOf(roster(), agentId)
}

/** Agents this one leads, and may therefore assign work to. */
export function workersOf(agentId: string): string[] {
  return graphWorkersOf(roster(), agentId)
}

/** The agent this one reports to, or null if it answers only to the user. */
export function leadOf(agentId: string): string | null {
  return graphLeadOf(roster(), agentId)
}
