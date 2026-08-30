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
/**
 * Events that can add a line to a group conversation.
 *
 * A completion may be an answer to something posted in a thread; an
 * agent-to-agent message between members is the thread's own traffic. The
 * main process decides which of those actually belong — this only decides
 * when it is worth asking.
 */
const THREAD_CHANGING = new Set<RuntimeEvent['type']>([
  'agent.completed',
  'agent.delegated',
  'agent.message.sent',
  'agent.connected',
  'agent.disconnected'
])

/**
 * Events that add a line to the agent-to-agent record.
 *
 * The record is held in the main process — it is written whether or not anyone
 * is watching — so the renderer has to re-read it when something lands. It was
 * read exactly once, at mount, which meant the copy the world drew from was
 * frozen at whatever had happened before the window opened: the collaboration
 * links in the office could never light up during a hand-off, because the only
 * hand-offs the renderer knew about were ones from a previous session.
 */
const COLLABORATION_CHANGING = new Set<RuntimeEvent['type']>([
  'agent.delegated',
  'agent.message.sent',
  'agent.message.received'
])

/**
 * Events that change what a group chat looks like on Home.
 *
 * Every one of them moves a status, a last message or an unread count, and
 * the summaries are derived in the main process from live runtime state — so
 * the renderer cannot work any of it out for itself, it has to ask again.
 *
 * Deliberately not the whole event stream. `agent.message.delta` fires many
 * times a second while a model is writing, and re-deriving every group on each
 * fragment would walk the roster and read a transcript sixty times a second
 * for a summary that has not changed.
 */
const GROUP_CHANGING = new Set<RuntimeEvent['type']>([
  'agent.completed',
  'agent.failed',
  'agent.idle',
  'agent.activated',
  'agent.delegated',
  'agent.message.sent',
  'agent.connected',
  'agent.disconnected',
  'task.started',
  'task.completed',
  'task.failed',
  'task.cancelled'
])

/** Events that change the automation run list. */
const AUTOMATION_CHANGING = new Set<RuntimeEvent['type']>([
  'automation.started',
  'automation.completed',
  'automation.failed',
  'trigger.fired',
  'trigger.blocked'
])

export function useTeamSync(): void {
  const ingestEvent = useBackstage((s) => s.ingestEvent)
  const setAgentStates = useBackstage((s) => s.setAgentStates)
  const setCollaboration = useBackstage((s) => s.setCollaboration)
  const setProviders = useBackstage((s) => s.setProviders)
  const addApproval = useBackstage((s) => s.addApproval)
  const setApprovals = useBackstage((s) => s.setApprovals)

  const agents = useTeam((s) => s.agents)
  const refresh = useTeam((s) => s.refresh)

  /* The roster, the provider list and anything already outstanding. */
  useEffect(() => {
    if (!window.backstage?.agents) return
    void refresh()
    void useTeam.getState().refreshPermissions()
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

      if (COLLABORATION_CHANGING.has(event.type)) {
        void window.backstage.agents.collaboration().then(setCollaboration)
      }

      /*
       * Group summaries and automation runs, re-read rather than patched.
       *
       * Both are derived in the main process — a group's status comes from its
       * members' live registry state, and a run settles only when every task
       * it started has — so there is nothing the renderer could correctly
       * patch locally. Re-reading is also what keeps them right when something
       * changes that produced no event the renderer saw.
       */
      if (GROUP_CHANGING.has(event.type)) {
        void useTeam.getState().refreshGroups()
      }
      if (AUTOMATION_CHANGING.has(event.type)) {
        void useTeam.getState().refreshRuns()
        void useTeam.getState().refreshGroups()
      }
      /*
       * A permission decision taken without asking still belongs in the
       * history the user reads afterwards — that is the whole point of turning
       * Auto Allow on and walking away.
       */
      if (event.type === 'permission.decided') {
        void useTeam.getState().refreshPermissions()
      }

      // Spawning, despawning and connecting change the roster, not just a
      // status. The world draws links from it, so it has to be re-read.
      if (
        event.type === 'agent.spawned' ||
        event.type === 'agent.despawned' ||
        event.type === 'agent.connected' ||
        event.type === 'agent.disconnected' ||
        event.type === 'trigger.fired'
      ) {
        void useTeam.getState().refresh()
      }

      /*
       * A group conversation is stored in the main process, so unlike an
       * agent's own transcript it is not built from the event stream — it has
       * to be re-read when something lands in it. Only when one is actually
       * open: reloading a thread nobody is looking at is pure cost.
       */
      if (THREAD_CHANGING.has(event.type) && useBackstage.getState().threadTarget) {
        void useBackstage.getState().refreshThread()
      }
    })
  }, [ingestEvent, setCollaboration])

  /*
   * Connection state can change without anyone asking: the keys on disk are
   * verified in the background after launch. Without this the app spends its
   * first seconds insisting no provider is connected, and refuses to send.
   */
  useEffect(() => {
    if (!window.backstage?.providers) return
    return window.backstage.providers.onChanged((statuses) => {
      setProviders(statuses)
      // Whether an agent can run depends on this, so re-derive the roster too.
      void useTeam.getState().refresh()
    })
  }, [setProviders])

  /* Approvals: raised by a tool that is genuinely blocked waiting for one. */
  useEffect(() => {
    if (!window.backstage?.approvals) return
    return window.backstage.approvals.onRequest(addApproval)
  }, [addApproval])

  /*
   * Keep the dock in step with what main is actually still holding open.
   *
   * The list is re-read rather than edited locally, because the authority on
   * whether a tool call is still waiting is the process holding it. An
   * approval can also be resolved without the user clicking — a timeout, or an
   * execution being cancelled out from under it — and a locally-edited list
   * would keep showing a prompt that no longer decides anything.
   */
  useEffect(() => {
    if (!window.backstage?.agents) return
    return window.backstage.agents.onEvent((event: RuntimeEvent) => {
      if (
        event.type === 'agent.tool.started' ||
        event.type === 'agent.tool.completed' ||
        event.type === 'agent.tool.failed' ||
        event.type === 'agent.cancelled' ||
        event.type === 'agent.idle'
      ) {
        void window.backstage.approvals.pending().then(setApprovals)
      }
    })
  }, [setApprovals])
}
