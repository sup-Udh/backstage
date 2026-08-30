import { create } from 'zustand'
import type {
  AgentConfig,
  AgentTask,
  AgentValidation,
  AutomationRun,
  CapabilityInfo,
  GroupChatSummary,
  OrchestrationSettings,
  PermissionCategory,
  PermissionCategoryInfo,
  PermissionDecision,
  PermissionRecord,
  ProjectPermissions,
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

/**
 * What happened to a collaboration link.
 *
 * Empty means it worked and there is nothing to say. Never both fields.
 */
export interface LinkOutcome {
  /** Set when nothing changed, and why. */
  error?: string
  /** Set when it worked but something happened worth telling the user. */
  notice?: string
}

const DEFAULT_SETTINGS: OrchestrationSettings = {
  autoCollaboration: false,
  maxChainDepth: 3,
  defaultCooldownMs: 30_000,
  maxMessagesPerChain: 12
}

/**
 * What the UI assumes before the main process has answered.
 *
 * Auto Allow is false and every impactful category asks. A mirror that guessed
 * optimistically would show "Auto Allow ON" for the instant before the real
 * answer arrived, and a permission switch that flickers into the permissive
 * position is not one anybody should trust.
 */
const DEFAULT_PERMISSIONS: ProjectPermissions = {
  projectId: '',
  autoAllow: false,
  rules: {
    'files.read': 'allow',
    'files.write': 'allow',
    'files.delete': 'ask',
    'commands.run': 'ask',
    'git.ops': 'ask',
    network: 'allow',
    'packages.install': 'ask',
    'services.start': 'ask',
    'config.modify': 'ask'
  },
  updatedAt: 0
}

interface TeamState {
  agents: AgentConfig[]
  capabilities: CapabilityInfo[]
  triggers: Trigger[]
  settings: OrchestrationSettings
  /** Why each agent cannot be spawned. Keyed by agentId. */
  validations: Record<string, AgentValidation>
  tasks: AgentTask[]
  /**
   * The project's group conversations, newest activity first.
   *
   * Derived in the main process from the connection graph, so this mirror can
   * never claim a group the roster does not support. Held here rather than in
   * the workspace store because a group is part of who the team *is*, and it
   * has to survive a page change the way the roster does.
   */
  groups: GroupChatSummary[]
  /** Recent automation runs for the project. */
  runs: AutomationRun[]
  permissions: ProjectPermissions
  permissionCategories: PermissionCategoryInfo[]
  permissionHistory: PermissionRecord[]
  /** A key identifying the operation in flight, for disabling controls. */
  busy: string | null
  loaded: boolean

  refresh: () => Promise<void>
  refreshTasks: () => Promise<void>
  refreshGroups: () => Promise<void>
  refreshRuns: () => Promise<void>
  refreshPermissions: () => Promise<void>

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
   * Collaboration links.
   *
   * The main process owns the limits and can refuse, so these report back
   * rather than assuming. The roster it returns replaces the mirror, which is
   * what keeps a refused link from lingering in the UI as though it existed.
   *
   * `error` and `notice` are kept apart because they are not the same thing:
   * a refusal means nothing happened, while a notice means something happened
   * that the user should know about. Collapsing both into one string made a
   * successful connection announce itself in the styling of a failure.
   */
  connect: (a: string, b: string) => Promise<LinkOutcome>
  disconnect: (a: string, b: string) => Promise<LinkOutcome>

  saveTrigger: (trigger: Partial<Trigger>) => Promise<Trigger | null>
  removeTrigger: (triggerId: string) => Promise<void>
  updateSettings: (patch: Partial<OrchestrationSettings>) => Promise<void>

  /** Start an automation by hand. Returns the reason it could not, if any. */
  runAutomation: (triggerId: string) => Promise<string | null>

  /** Rename a group. An empty name restores the generated one. */
  renameGroup: (threadId: string, name: string) => Promise<void>
  markGroupRead: (threadId: string) => Promise<void>

  setPermissions: (patch: {
    autoAllow?: boolean
    rules?: Partial<Record<PermissionCategory, PermissionDecision>>
  }) => Promise<void>
  clearPermissionHistory: () => Promise<void>
}

export const useTeam = create<TeamState>((set, get) => ({
  agents: [],
  capabilities: [],
  triggers: [],
  settings: DEFAULT_SETTINGS,
  validations: {},
  tasks: [],
  groups: [],
  runs: [],
  permissions: DEFAULT_PERMISSIONS,
  permissionCategories: [],
  permissionHistory: [],
  busy: null,
  loaded: false,

  refresh: async () => {
    if (!window.backstage?.agents) return
    const [
      agents,
      capabilities,
      triggers,
      settings,
      groups,
      runs,
      permissions,
      permissionCategories
    ] = await Promise.all([
      window.backstage.agents.list(),
      window.backstage.agents.capabilities(),
      window.backstage.automation.listTriggers(),
      window.backstage.automation.settings(),
      window.backstage.groups.list(),
      window.backstage.automation.listRuns(),
      window.backstage.permissions.get(),
      window.backstage.permissions.categories()
    ])

    // Validate every agent up front, so a card can say *why* it cannot be
    // spawned rather than only that it cannot.
    const results = await Promise.all(
      agents.map((a) => window.backstage.agents.validate(a.id))
    )
    const validations: Record<string, AgentValidation> = {}
    for (const v of results) validations[v.agentId] = v

    set({
      agents,
      capabilities,
      triggers,
      settings,
      groups,
      runs,
      permissions,
      permissionCategories,
      validations,
      loaded: true
    })
  },

  refreshTasks: async () => {
    if (!window.backstage?.agents) return
    set({ tasks: await window.backstage.agents.tasks() })
  },

  /*
   * Groups on their own, for the event stream.
   *
   * A message landing in a group changes its unread count and its status, and
   * re-reading the whole team to learn that would revalidate every agent
   * against its provider on every completed task.
   */
  refreshGroups: async () => {
    if (!window.backstage?.groups) return
    set({ groups: await window.backstage.groups.list() })
  },

  refreshRuns: async () => {
    if (!window.backstage?.automation) return
    set({ runs: await window.backstage.automation.listRuns() })
  },

  refreshPermissions: async () => {
    if (!window.backstage?.permissions) return
    const [permissions, permissionCategories, permissionHistory] = await Promise.all([
      window.backstage.permissions.get(),
      window.backstage.permissions.categories(),
      window.backstage.permissions.history()
    ])
    set({ permissions, permissionCategories, permissionHistory })
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
    if (!result.ok) return { error: result.error ?? 'Could not connect those agents.' }
    /*
     * Connecting grants the ability to talk, and a permission change the user
     * did not explicitly ask for should be visible rather than discovered
     * later when an agent mentions it in passing.
     */
    if (result.granted?.length) {
      return { notice: `${result.granted.join(' and ')} can now talk to teammates.` }
    }
    return {}
  },

  disconnect: async (a, b) => {
    const result = await window.backstage.agents.disconnect(a, b)
    set({ agents: result.agents })
    return result.ok ? {} : { error: result.error ?? 'Could not remove that connection.' }
  },

  saveTrigger: async (trigger) => {
    set({ busy: `trigger:${trigger.id ?? 'new'}` })
    try {
      const triggers = await window.backstage.automation.saveTrigger(trigger)
      set({ triggers })
      /*
       * Which one was saved, so a builder can go straight to the automation it
       * just created. Matched by id when editing, and otherwise by the most
       * recently created — the main process mints the id, so the caller has no
       * other way to know it.
       */
      if (trigger.id) return triggers.find((t) => t.id === trigger.id) ?? null
      return (
        [...triggers].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
      )
    } finally {
      set({ busy: null })
    }
  },

  removeTrigger: async (triggerId) => {
    set({ busy: `trigger:${triggerId}` })
    try {
      const triggers = await window.backstage.automation.removeTrigger(triggerId)
      set({ triggers, runs: await window.backstage.automation.listRuns() })
    } finally {
      set({ busy: null })
    }
  },

  updateSettings: async (patch) => {
    set({ settings: await window.backstage.automation.updateSettings(patch) })
  },

  runAutomation: async (triggerId) => {
    set({ busy: `run:${triggerId}` })
    try {
      const result = await window.backstage.automation.runNow(triggerId)
      // The run record exists the moment it starts, so the history is correct
      // immediately rather than only once something finishes.
      const [runs, triggers] = await Promise.all([
        window.backstage.automation.listRuns(),
        window.backstage.automation.listTriggers()
      ])
      set({ runs, triggers })
      return result.ok ? null : (result.error ?? 'Could not start that automation.')
    } finally {
      set({ busy: null })
    }
  },

  renameGroup: async (threadId, name) => {
    set({ groups: await window.backstage.groups.rename(threadId, name) })
  },

  markGroupRead: async (threadId) => {
    set({ groups: await window.backstage.groups.markRead(threadId) })
  },

  setPermissions: async (patch) => {
    const permissions = await window.backstage.permissions.update(patch)
    set({ permissions, permissionHistory: await window.backstage.permissions.history() })
  },

  clearPermissionHistory: async () => {
    set({ permissionHistory: await window.backstage.permissions.clearHistory() })
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
