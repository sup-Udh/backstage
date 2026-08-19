import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig, ExecutionProfile } from './agent.types'

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

/**
 * The starting team.
 *
 * Deliberately opinionated rather than empty: an app that opens with no agents
 * gives the user nothing to try. Tool permissions differ per agent, because
 * that is the point — a researcher has no business running shell commands.
 */
function defaults(): AgentConfig[] {
  return [
    {
      id: 'jane',
      name: 'Jane',
      role: 'Investigator',
      characterSlot: 0,
      providerId: 'openai',
      modelId: null,
      instructions:
        'You are an investigator. Inspect evidence before drawing conclusions. Use the workspace tools whenever the task concerns the project. Never invent project details.',
      tools: ['filesystem', 'git', 'web'],
      profile: 'normal',
      enabled: true
    },
    {
      id: 'codex',
      name: 'Codex',
      role: 'Developer',
      characterSlot: 2,
      providerId: 'openai',
      modelId: null,
      instructions:
        'You are a software engineer. Inspect the existing implementation before modifying it. Prefer minimal, safe changes. Run the relevant build or tests after a modification and report what actually happened.',
      tools: ['filesystem', 'terminal', 'git'],
      profile: 'deep',
      enabled: true
    },
    {
      id: 'researcher',
      name: 'Researcher',
      role: 'Research Specialist',
      characterSlot: 3,
      providerId: 'openai',
      modelId: null,
      instructions:
        'You are a research specialist. Use the web tools when current external information is required. Clearly separate sourced facts from your own inference, and cite the URL you took something from.',
      tools: ['web', 'filesystem'],
      profile: 'normal',
      enabled: true
    },
    {
      id: 'lead',
      name: 'Lisbon',
      role: 'Team Lead',
      characterSlot: 1,
      providerId: 'openai',
      modelId: null,
      instructions:
        'You are the team lead. Assess scope and risk, and say what should be done first and why. Keep answers short and decisive.',
      tools: ['filesystem', 'git'],
      profile: 'quick',
      enabled: true
    }
  ]
}

let agents: AgentConfig[] | null = null

function normalise(raw: unknown): AgentConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Partial<AgentConfig>
  if (!a.id || !a.name) return null
  return {
    id: String(a.id),
    name: String(a.name),
    role: String(a.role ?? 'Agent'),
    characterSlot: Number.isFinite(a.characterSlot) ? Number(a.characterSlot) : 0,
    providerId: String(a.providerId ?? 'openai'),
    modelId: a.modelId ? String(a.modelId) : null,
    instructions: String(a.instructions ?? ''),
    tools: Array.isArray(a.tools) ? a.tools.map(String) : ['filesystem', 'git', 'web'],
    profile: (['quick', 'normal', 'deep'] as ExecutionProfile[]).includes(
      a.profile as ExecutionProfile
    )
      ? (a.profile as ExecutionProfile)
      : 'normal',
    enabled: a.enabled !== false
  }
}

export function loadAgents(): AgentConfig[] {
  if (agents) return agents
  try {
    if (existsSync(path())) {
      const parsed = JSON.parse(readFileSync(path(), 'utf8'))
      const list = Array.isArray(parsed) ? parsed : []
      const clean = list.map(normalise).filter((a): a is AgentConfig => a !== null)
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

export function upsertAgent(input: Partial<AgentConfig> & { id?: string }): AgentConfig {
  const list = loadAgents()
  const existing = input.id ? list.find((a) => a.id === input.id) : undefined

  if (existing) {
    Object.assign(existing, normalise({ ...existing, ...input }))
    persist()
    return existing
  }

  const id =
    input.id?.trim() ||
    `${String(input.name ?? 'agent')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'agent'}-${Date.now().toString(36).slice(-4)}`

  const created = normalise({
    characterSlot: list.length,
    ...input,
    id
  }) as AgentConfig
  list.push(created)
  persist()
  return created
}

export function deleteAgent(id: string): void {
  const list = loadAgents()
  const i = list.findIndex((a) => a.id === id)
  if (i !== -1) {
    list.splice(i, 1)
    persist()
  }
}
