import { useEffect } from 'react'
import { teamRuntime } from './team'
import { useBackstage } from '../stores/backstageStore'
import { useTeam } from '../stores/teamStore'
import type { AgentConfig, RuntimeEvent } from '../shared/providerApi'

/**
 * The bridge from the main-process runtime into the renderer.
 *
 * Mounted exactly once, at the top of the app. Main owns the providers, the
 * tool loops and the truth about what every agent is doing; this side owns
 * bodies in a room and text on a screen. Every event goes to both:
 *
 *   - the team runtime, which moves characters
 *   - the store, which appends to transcripts and activity feeds
 *
 * Because both react to the same stream, a task run by OpenAI and one run by
 * Gemini produce identical behaviour in the world.
 *
 * Having one subscription rather than one per panel matters: the world must
 * keep reporting an agent that is still working while the user is on the
 * Agents page, and a component that unmounts must not take the team's event
 * feed with it.
 */
export function useTeamSync(): void {
  const ingestEvent = useBackstage((s) => s.ingestEvent)
  const setAgentStates = useBackstage((s) => s.setAgentStates)
  const setCollaboration = useBackstage((s) => s.setCollaboration)
  const setProviders = useBackstage((s) => s.setProviders)
  const addApproval = useBackstage((s) => s.addApproval)
  const removeApproval = useBackstage((s) => s.removeApproval)
  const setApprovals = useBackstage((s) => s.setApprovals)

  const agents = useTeam((s) => s.agents)
  const refresh = useTeam((s) => s.refresh)

  /* The roster, the provider list and anything already outstanding. */
  useEffect(() => {
    if (!window.backstage?.agents) return
    void refresh()
    void window.backstage.providers.status().then(setProviders)
    void window.backstage.agents.states().then(setAgentStates)
    void window.backstage.agents.collaboration().then(setCollaboration)
    void window.backstage.approvals.pending().then(setApprovals)
  }, [refresh, setProviders, setAgentStates, setCollaboration, setApprovals])

  /*
   * Give every configured agent a body, and take it away again when the agent
   * is deleted. Presence follows `spawned`, so this never puts anyone in the
   * office the user did not ask for.
   */
  const providers = useBackstage((s) => s.providers)
  useEffect(() => {
    teamRuntime.syncConfigs(agents, (config: AgentConfig) => {
      const provider = providers.find((p) => p.id === config.providerId)
      return {
        model: config.modelId ?? provider?.selectedModel ?? 'no model',
        provider: provider?.name ?? config.providerId
      }
    })
  }, [agents, providers])

  /* The event stream. */
  useEffect(() => {
    if (!window.backstage?.agents) return

    return window.backstage.agents.onEvent((event: RuntimeEvent) => {
      teamRuntime.applyEvent(event)
      ingestEvent(event)

      /*
       * A state event carries the whole new state, so the world is updated
       * from it directly rather than being asked to infer a status from an
       * event type. Inference is where the office and the panel drift apart.
       */
      if (event.type === 'agent.state' && event.state) {
        teamRuntime.applyStates([event.state])
      }

      // Spawning and despawning change the roster, not just a status.
      if (
        event.type === 'agent.spawned' ||
        event.type === 'agent.despawned' ||
        event.type === 'trigger.fired'
      ) {
        void useTeam.getState().refresh()
      }
    })
  }, [ingestEvent])

  /* Approvals: raised by a tool that is genuinely blocked waiting for one. */
  useEffect(() => {
    if (!window.backstage?.approvals) return
    return window.backstage.approvals.onRequest(addApproval)
  }, [addApproval])

  /*
   * An answered approval is removed here rather than optimistically at the
   * click, so what is on screen is always what the main process is still
   * holding open.
   */
  useEffect(() => {
    if (!window.backstage?.agents) return
    return window.backstage.agents.onEvent((event: RuntimeEvent) => {
      if (event.type === 'agent.tool.started' || event.type === 'agent.tool.completed') {
        void window.backstage.approvals.pending().then(setApprovals)
      }
      if (event.type === 'agent.cancelled') removeApproval(event.executionId ?? '')
    })
  }, [setApprovals, removeApproval])
}
