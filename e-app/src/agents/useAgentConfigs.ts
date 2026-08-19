import { useCallback, useEffect, useState } from 'react'
import { teamRuntime } from './team'
import type { AgentConfig, ToolFamilyInfo } from '../shared/providerApi'

/**
 * The renderer's view of the configured team.
 *
 * Configuration is owned and persisted by the main process; this mirrors it
 * and registers each agent with the world runtime so a character exists for
 * it the moment it is given work. Registering does not make anyone visible —
 * that still requires being assigned to a task.
 */
export function useAgentConfigs() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [families, setFamilies] = useState<ToolFamilyInfo[]>([])
  const [busy, setBusy] = useState(false)

  const sync = useCallback((list: AgentConfig[]) => {
    setAgents(list)
    for (const a of list) {
      teamRuntime.register({
        id: a.id,
        name: a.name,
        role: a.role,
        slot: a.characterSlot,
        model: a.modelId ?? a.providerId
      })
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!window.backstage?.agents) return
    const [list, fams] = await Promise.all([
      window.backstage.agents.list(),
      window.backstage.agents.toolFamilies()
    ])
    sync(list)
    setFamilies(fams)
  }, [sync])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(
    async (agent: Partial<AgentConfig>) => {
      setBusy(true)
      try {
        sync(await window.backstage.agents.save(agent))
      } finally {
        setBusy(false)
      }
    },
    [sync]
  )

  const remove = useCallback(
    async (agentId: string) => {
      setBusy(true)
      try {
        sync(await window.backstage.agents.remove(agentId))
      } finally {
        setBusy(false)
      }
    },
    [sync]
  )

  return { agents, families, busy, refresh, save, remove }
}
