import { create } from 'zustand'
import type {
  AgentConfig,
  AgentTask,
  AgentValidation,
  CapabilityInfo,
  OrchestrationSettings,
  Trigger
} from '../shared/providerApi'

/**
 * The team's configuration, mirrored from the main process.
 *
 * Separate from the workspace store because it answers a different question:
 * that one holds what is on screen right now, this one holds who the team is
 * and how it is allowed to behave. Both are stores rather than component
 * state, so the roster, the world, the chat header and the automations page
 * cannot end up describing different teams.
 *
 * Nothing here is the source of truth. The main process owns and persists all
 * of it; every mutator round-trips and replaces the mirror with what came
 * back, so an optimistic update can never leave the UI claiming a change that
 * did not persist.
 */

const DEFAULT_SETTINGS: OrchestrationSettings = {
  autoCollaboration: false,
  maxChainDepth: 3,
  defaultCooldownMs: 30_000,
  maxMessagesPerChain: 12
}

interface TeamState {
  agents: AgentConfig[]
  capabilities: CapabilityInfo[]
  triggers: Trigger[]
  settings: OrchestrationSettings
  /** Why each agent cannot be spawned. Keyed by agentId. */
  validations: Record<string, AgentValidation>
  tasks: AgentTask[]
  /** A key identifying the operation in flight, for disabling controls. */
  busy: string | null
  loaded: boolean

  refresh: () => Promise<void>
  refreshTasks: () => Promise<void>

  save: (agent: Partial<AgentConfig>) => Promise<AgentConfig[]>
  remove: (agentId: string) => Promise<void>
  spawn: (agentId: string) => Promise<AgentValidation>
  despawn: (agentId: string) => Promise<void>
  setEnabled: (agentId: string, enabled: boolean) => Promise<void>
  validate: (agentId: string) => Promise<AgentValidation>

  cancel: (agentId: string) => Promise<void>
  stopAll: () => Promise<number>
  retry: (taskId: string) => Promise<string | null>

  /**
   * Collaboration links. Resolve to an error message, or null on success.
   *
   * The main process owns the limits and can refuse, so these report back
   * rather than assuming. The roster it returns replaces the mirror, which is
   * what keeps a refused link from lingering in the UI as though it existed.
   */
  connect: (a: string, b: string) => Promise<string | null>
  disconnect: (a: string, b: string) => Promise<string | null>

  saveTrigger: (trigger: Partial<Trigger>) => Promise<void>
  removeTrigger: (triggerId: string) => Promise<void>
  updateSettings: (patch: Partial<OrchestrationSettings>) => Promise<void>
}

export const useTeam = create<TeamState>((set, get) => ({
  agents: [],
  capabilities: [],
  triggers: [],
  settings: DEFAULT_SETTINGS,
  validations: {},
  tasks: [],
  busy: null,
  loaded: false,

  refresh: async () => {
    if (!window.backstage?.agents) return
    const [agents, capabilities, triggers, settings] = await Promise.all([
      window.backstage.agents.list(),
      window.backstage.agents.capabilities(),
      window.backstage.automation.listTriggers(),
      window.backstage.automation.settings()
    ])

    // Validate every agent up front, so a card can say *why* it cannot be
    // spawned rather than only that it cannot.
    const results = await Promise.all(
      agents.map((a) => window.backstage.agents.validate(a.id))
    )
    const validations: Record<string, AgentValidation> = {}
    for (const v of results) validations[v.agentId] = v

    set({ agents, capabilities, triggers, settings, validations, loaded: true })
  },

  refreshTasks: async () => {
    if (!window.backstage?.agents) return
    set({ tasks: await window.backstage.agents.tasks() })
  },

  save: async (agent) => {
    set({ busy: `save:${agent.id ?? 'new'}` })
    try {
      const agents = await window.backstage.agents.save(agent)
      set({ agents })
      await get().refresh()
      return agents
    } finally {
      set({ busy: null })
    }
  },

  remove: async (agentId) => {
    set({ busy: `remove:${agentId}` })
    try {
      set({ agents: await window.backstage.agents.remove(agentId) })
      await get().refresh()
    } finally {
      set({ busy: null })
    }
  },

  spawn: async (agentId) => {
    set({ busy: `spawn:${agentId}` })
    try {
      const { agents, validation } = await window.backstage.agents.spawn(agentId)
      set((s) => ({
        agents,
        validations: { ...s.validations, [agentId]: validation }
      }))
      return validation
    } finally {
      set({ busy: null })
    }
  },

  despawn: async (agentId) => {
    set({ busy: `despawn:${agentId}` })
    try {
      set({ agents: await window.backstage.agents.despawn(agentId) })
    } finally {
      set({ busy: null })
    }
  },

  setEnabled: async (agentId, enabled) => {
    const agent = get().agents.find((a) => a.id === agentId)
    if (!agent) return
    /*
     * Disabling also takes the agent out of the world. A disabled agent that
     * kept its desk would look available while refusing every task.
     */
    await get().save({ id: agentId, enabled, spawned: enabled ? agent.spawned : false })
  },

  validate: async (agentId) => {
    const validation = await window.backstage.agents.validate(agentId)
    set((s) => ({ validations: { ...s.validations, [agentId]: validation } }))
    return validation
  },

  cancel: async (agentId) => {
    await window.backstage.agents.cancel(agentId)
  },

  stopAll: async () => window.backstage.agents.stopAll(),

  retry: async (taskId) => {
    const ack = await window.backstage.agents.retry(taskId)
    return ack.accepted ? null : (ack.error ?? 'Could not retry that task.')
  },

  connect: async (a, b) => {
    const result = await window.backstage.agents.connect(a, b)
    set({ agents: result.agents })
    return result.ok ? null : (result.error ?? 'Could not connect those agents.')
  },

  disconnect: async (a, b) => {
    const result = await window.backstage.agents.disconnect(a, b)
    set({ agents: result.agents })
    return result.ok ? null : (result.error ?? 'Could not remove that connection.')
  },

  saveTrigger: async (trigger) => {
    set({ busy: `trigger:${trigger.id ?? 'new'}` })
    try {
      set({ triggers: await window.backstage.automation.saveTrigger(trigger) })
    } finally {
      set({ busy: null })
    }
  },

  removeTrigger: async (triggerId) => {
    set({ busy: `trigger:${triggerId}` })
    try {
      set({ triggers: await window.backstage.automation.removeTrigger(triggerId) })
    } finally {
      set({ busy: null })
    }
  },

  updateSettings: async (patch) => {
    set({ settings: await window.backstage.automation.updateSettings(patch) })
  }
}))

/* --------------------------------------------------------------- selectors -- */

/** Agents that are in the world and able to take work. */
export function spawnedAgents(agents: AgentConfig[]): AgentConfig[] {
  return agents.filter((a) => a.enabled && a.spawned)
}

/** Who a broadcast would actually reach, so the UI can say "3 recipients". */
export function recipientsFor(agents: AgentConfig[], target: string): AgentConfig[] {
  if (target === 'all') return spawnedAgents(agents)
  const one = agents.find((a) => a.id === target)
  return one ? [one] : []
}
