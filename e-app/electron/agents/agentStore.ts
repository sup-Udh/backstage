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
