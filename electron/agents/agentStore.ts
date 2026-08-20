import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig, ExecutionProfile } from './agent.types'
import {
  DEFAULT_CAPABILITIES,
  normaliseCapabilities
} from '../../src/shared/capabilities'

/**
 * The team roster, persisted.
 *
 * This is *configuration* — who an agent is — and is deliberately separate
 * from runtime state, which is what an agent is doing right now. Nothing here
 * ever holds a task, a status or an API key: configuration survives restarts,
 * runtime state does not.
 */

const FILE = 'agents.json'

function path(): string {
  return join(app.getPath('userData'), FILE)
}

const PROFILES: ExecutionProfile[] = ['quick', 'normal', 'deep']

/**
 * The starting team.
 *
 * Deliberately opinionated rather than empty: an app that opens with no agents
 * gives the user nothing to try. Permissions differ per agent, because that is
 * the point — a researcher has no business running shell commands.
 *
 * Nobody starts spawned. Bringing an agent into the office is the user's
 * decision, and it is the moment the product is supposed to feel like hiring
 * someone.
 */
function defaults(): AgentConfig[] {
  const now = Date.now()
  const base = {
    displayName: '',
    modelId: null,
    themeId: null,
    enabled: true,
    spawned: false,
    workspace: null,
    canTalkTo: [] as string[],
    createdAt: now,
    updatedAt: now
  }

  return [
    {
      ...base,
      id: 'jane',
      name: 'Jane',
      role: 'Investigator',
      characterSlot: 0,
      providerId: 'openai',
      instructions:
        'You are the investigator of the team. Inspect evidence before drawing conclusions. Prefer evidence from actual files over inference. Never invent project details.',
      capabilities: ['files.read', 'git.read', 'web.search'],
      profile: 'normal'
    },
    {
      ...base,
      id: 'lisbon',
      name: 'Lisbon',
      role: 'Team Lead',
      characterSlot: 1,
      providerId: 'openai',
      instructions:
        'You are the team lead. Assess scope and risk, and say what should be done first and why. Keep answers short and decisive.',
      capabilities: ['files.read', 'git.read', 'agents.talk'],
      profile: 'quick'
    },
    {
      ...base,
      id: 'cho',
      name: 'Cho',
      role: 'Developer',
      characterSlot: 2,
      providerId: 'openai',
      instructions:
        'You are a software engineer. Inspect the existing implementation before modifying it. Prefer minimal, safe changes. Run the relevant build or tests after a modification and report what actually happened.',
      capabilities: ['files.read', 'files.write', 'terminal.execute', 'git.read'],
      profile: 'deep'
    },
    {
      ...base,
      id: 'vanpelt',
      name: 'Van Pelt',
      role: 'Researcher',
      characterSlot: 3,
      providerId: 'openai',
      instructions:
        'You are a research specialist. Use the web tools when current external information is required. Clearly separate sourced facts from your own inference, and cite the URL you took something from.',
      capabilities: ['files.read', 'web.search'],
      profile: 'normal'
    }
  ]
}

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
    themeId: typeof a.themeId === 'string' && a.themeId ? a.themeId : null,
    characterSlot: Number.isFinite(a.characterSlot) ? Number(a.characterSlot) : 0,
    enabled: a.enabled !== false,
    spawned,
    workspace: typeof a.workspace === 'string' && a.workspace ? a.workspace : null,
    canTalkTo: Array.isArray(a.canTalkTo)
      ? a.canTalkTo.filter((x): x is string => typeof x === 'string')
      : [],
    createdAt: Number.isFinite(a.createdAt) ? Number(a.createdAt) : Date.now(),
    updatedAt: Number.isFinite(a.updatedAt) ? Number(a.updatedAt) : Date.now()
  }
}

export function loadAgents(): AgentConfig[] {
  if (agents) return agents
  try {
    if (existsSync(path())) {
      const parsed = JSON.parse(readFileSync(path(), 'utf8'))
      const list = Array.isArray(parsed) ? parsed : []
      const clean = list
        .map(normalise)
        .filter((a): a is AgentConfig => a !== null)
      if (clean.length > 0) {
        agents = clean
        return agents
      }
    }
  } catch {
    // A corrupt file should not stop the app; fall back to the defaults.
  }
  agents = defaults()
  persist()
  return agents
}

function persist(): void {
  try {
    writeFileSync(path(), JSON.stringify(agents ?? [], null, 2), 'utf8')
  } catch {
    // Losing the write is survivable; the in-memory list still works.
  }
}

export function listAgents(): AgentConfig[] {
  return loadAgents()
}

export function getAgent(id: string): AgentConfig | undefined {
  return loadAgents().find((a) => a.id === id)
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

export function upsertAgent(input: Partial<AgentConfig> & { id?: string }): AgentConfig {
  const list = loadAgents()
  const existing = input.id ? list.find((a) => a.id === input.id) : undefined

  if (existing) {
    const merged = normalise({ ...existing, ...input, id: existing.id })
    if (merged) {
      merged.createdAt = existing.createdAt
      merged.updatedAt = Date.now()
      Object.assign(existing, merged)
      persist()
    }
    return existing
  }

  const taken = new Set(list.map((a) => a.id))
  const created = normalise({
    characterSlot: list.length,
    capabilities: [...DEFAULT_CAPABILITIES],
    // Stated rather than left absent, so a newly created agent is never
    // mistaken for one migrated from a roster that predates spawning.
    spawned: false,
    ...input,
    id: input.id?.trim() || idFor(String(input.name ?? 'agent'), taken),
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
  if (!created) throw new Error('An agent needs a name.')

  list.push(created)
  persist()
  return created
}

export function deleteAgent(id: string): void {
  const list = loadAgents()
  const i = list.findIndex((a) => a.id === id)
  if (i === -1) return
  list.splice(i, 1)
  // A relationship pointing at a deleted agent would be a permission nobody
  // can see and nobody granted. Clean them up with the agent itself.
  for (const other of list) {
    const before = other.canTalkTo.length
    other.canTalkTo = other.canTalkTo.filter((x) => x !== id)
    if (other.canTalkTo.length !== before) other.updatedAt = Date.now()
  }
  persist()
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

/**
 * How many other agents one agent may be connected to.
 *
 * A hard cap rather than a suggestion. Every connection is a route along which
 * one agent can hand work to another, and an unbounded graph is one where a
 * single task can fan out across the whole roster and spend real money doing
 * it. Two keeps a group to at most three agents in a chain — enough for a
 * genuine hand-off, small enough that the user can hold the whole shape of it
 * in their head.
 */
export const MAX_CONNECTIONS = 2

/**
 * How many agents may end up in one collaboration group.
 *
 * Two connections each does not on its own bound a group: A–B, B–C, C–D is a
 * chain where nobody exceeds two links and yet four agents share a thread,
 * and it can keep growing. The group cap is what actually holds the
 * conversation to a size a person can follow, and it is the guarantee the
 * shared thread is designed around — three voices in a transcript is a
 * discussion, seven is a log.
 */
export const MAX_GROUP = 3

export interface LinkResult {
  ok: boolean
  error?: string
}

/**
 * Connect two agents, in both directions.
 *
 * Collaboration is mutual: a link the user draws between two characters means
 * they can talk, not that one may lecture the other. The underlying
 * `canTalkTo` is directional because a trigger may legitimately be one-way,
 * so a link is stored as the pair of directions and both are checked here.
 *
 * The cap is enforced in this function specifically because this is the only
 * place a link can be created. Checking it in the UI as well is a courtesy to
 * the user — it lets a button grey out rather than fail — but a check that
 * lives only there is one an unrelated code path can walk straight past.
 */
export function connectAgents(aId: string, bId: string): LinkResult {
  if (aId === bId) return { ok: false, error: 'An agent cannot be connected to itself.' }

  const a = getAgent(aId)
  const b = getAgent(bId)
  if (!a) return { ok: false, error: 'That agent no longer exists.' }
  if (!b) return { ok: false, error: 'That agent no longer exists.' }

  if (a.canTalkTo.includes(bId) && b.canTalkTo.includes(aId)) return { ok: true }

  // Counted per agent, not per direction: a half-formed link from an earlier
  // build still occupies a slot and still lets work flow.
  if (connectionsOf(a).length >= MAX_CONNECTIONS && !connectionsOf(a).includes(bId)) {
    return { ok: false, error: `${a.name} already has ${MAX_CONNECTIONS} connections.` }
  }
  if (connectionsOf(b).length >= MAX_CONNECTIONS && !connectionsOf(b).includes(aId)) {
    return { ok: false, error: `${b.name} already has ${MAX_CONNECTIONS} connections.` }
  }

  /*
   * Joining two groups must not produce one larger than the cap. Checked on
   * the union of both sides rather than on either alone, because each can be
   * within its own limit while the merge is not.
   */
  const merged = new Set([...groupOf(aId), ...groupOf(bId)])
  if (merged.size > MAX_GROUP) {
    return {
      ok: false,
      error: `That would make a group of ${merged.size}. The most that can work together is ${MAX_GROUP}.`
    }
  }

  if (!a.canTalkTo.includes(bId)) a.canTalkTo.push(bId)
  if (!b.canTalkTo.includes(aId)) b.canTalkTo.push(aId)
  a.updatedAt = Date.now()
  b.updatedAt = Date.now()
  persist()
  return { ok: true }
}

/** Remove a connection, in both directions. */
export function disconnectAgents(aId: string, bId: string): LinkResult {
  const a = getAgent(aId)
  const b = getAgent(bId)
  if (!a || !b) return { ok: false, error: 'That agent no longer exists.' }

  const before = a.canTalkTo.length + b.canTalkTo.length
  a.canTalkTo = a.canTalkTo.filter((x) => x !== bId)
  b.canTalkTo = b.canTalkTo.filter((x) => x !== aId)
  if (a.canTalkTo.length + b.canTalkTo.length === before) return { ok: true }

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
  const live = new Set(loadAgents().map((a) => a.id))
  const out = new Set(agent.canTalkTo.filter((id) => live.has(id)))
  for (const other of loadAgents()) {
    if (other.id !== agent.id && other.canTalkTo.includes(agent.id)) out.add(other.id)
  }
  return [...out]
}

/**
 * Everyone reachable from this agent through connections, including itself.
 *
 * The collaboration group: who shares a thread, and what the group cap is
 * measured against. A plain breadth-first walk, which is more than the shape
 * needs today but costs nothing and cannot be wrong if the cap ever moves.
 */
export function groupOf(agentId: string): string[] {
  const start = getAgent(agentId)
  if (!start) return []

  const seen = new Set([agentId])
  const queue = [agentId]
  while (queue.length > 0) {
    const id = queue.shift()!
    const agent = getAgent(id)
    if (!agent) continue
    for (const next of connectionsOf(agent)) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  // Sorted, so the same group always produces the same thread id.
  return [...seen].sort()
}

/**
 * The stable id for a group's shared conversation.
 *
 * Derived from the members rather than stored, so a thread cannot outlive the
 * relationship that created it. Adding or removing a member deliberately
 * produces a *different* thread: the group is a different group, and folding
 * a new agent into an existing transcript would hand them a conversation they
 * were never part of.
 */
export function threadIdFor(members: string[]): string {
  return `thread:${[...members].sort().join('+')}`
}
