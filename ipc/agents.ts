import { BrowserWindow, ipcMain } from 'electron'
import type {
  ActivityEvent,
  AgentActivity,
  AgentConfig,
  AgentRuntimeState,
  AgentTask,
  AgentValidation,
  AutomationRun,
  AwarenessSnapshot,
  CapabilityInfo,
  ChatMessage,
  CollaborationMessage,
  GroupChatSummary,
  OrchestrationSettings,
  PermissionCategoryInfo,
  PermissionRecord,
  ProjectPermissions,
  RunTaskAck,
  RunTaskParams,
  Trigger
} from '../src/shared/providerApi'
import { CAPABILITIES } from '../src/shared/capabilities'
import {
  connectAgents,
  deleteAgent,
  disconnectAgents,
  getAgent,
  listAgents,
  setSpawned,
  upsertAgent
} from '../agents/agentStore'
import {
  clearThread,
  initThreads,
  loadThread,
  postToThread,
  threadFor
} from '../agents/threads'
import {
  getGroupChat,
  listGroupChats,
  markGroupRead,
  renameGroupChat
} from '../agents/groupChats'
import { agentRegistry, validateAgent } from '../agents/AgentRegistry'
import { orchestrator, wasRejected } from '../agents/AgentOrchestrator'
import { godAgent } from '../agents/GodAgent'
import { initTriggerEngine } from '../agents/TriggerEngine'
import { systemBus } from '../agents/EventBus'
import { conversationStore } from '../agents/conversationStore'
import { listCollaboration } from '../agents/collaborationStore'
import { listTasks } from '../agents/taskStore'
import { getSettings, updateSettings } from '../agents/settingsStore'
import {
  deleteTrigger,
  forgetAgent,
  getTrigger,
  listTriggers,
  upsertTrigger
} from '../agents/triggerStore'
import { initScheduler, disposeScheduler } from '../agents/Scheduler'
import {
  disposeAutomationRunner,
  initAutomationRunner,
  runAutomation
} from '../agents/automationRunner'
import { getRun, listRuns } from '../agents/automationRuns'
import { parseAutomation } from '../agents/nlAutomation'
import { PERMISSION_CATEGORIES } from '../agents/permissionRules'
import {
  clearPermissionHistory,
  getPermissions,
  listPermissionHistory,
  sessionGranted,
  updatePermissions
} from '../agents/permissionStore'
import {
  pendingApprovals,
  resolveApproval,
  setApprovalPublisher,
  type ApprovalAnswer
} from '../agents/approvals'
import { awarenessSnapshot, refreshGit } from '../workspace/awareness'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import { makeId } from '../agents/persist'
import {
  activityTimeline,
  clearActivity,
  forgetAgent as forgetAgentActivity,
  listActivities
} from '../agents/activityStore'

/**
 * The agent surface.
 *
 * Runtime events are pushed to every window as they happen rather than
 * returned at the end, so the world and the roster can react while an agent is
 * still working. Requests only ever acknowledge; nothing here waits on a
 * model.
 */

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** Trim history so a long session cannot quietly grow every request. */
const HISTORY_LIMIT = 12

function workspaceId(): string {
  return getWorkspaceRoot() ?? 'no-workspace'
}

/**
 * Decide who a request goes to.
 *
 * A named agent runs alone. `all` goes to every spawned, enabled agent —
 * each as its own independent task, because three agents answering is three
 * pieces of work, not one.
 */
function recipients(target: string | string[] | undefined): AgentConfig[] {
  const spawned = listAgents().filter((a) => a.enabled && a.spawned)

  if (!target || target === 'all') return spawned

  if (Array.isArray(target)) {
    return target.map((id) => getAgent(id)).filter((a): a is AgentConfig => a !== undefined)
  }

  const wanted = getAgent(target)
  return wanted ? [wanted] : []
}

export function registerAgentHandlers(): void {
  initTriggerEngine()
  initAutomationRunner()
  initScheduler()
  initThreads()
  agentRegistry.refreshAll()

  // One subscription for the whole renderer. Every surface listens to this.
  systemBus.on((event) => broadcast('agent:event', event))

  setApprovalPublisher((request) => broadcast('agent:approval', request))

  /* ---------------------------------------------------------------- CRUD -- */

  ipcMain.handle('agents:list', (): AgentConfig[] => listAgents())

  ipcMain.handle('agents:save', (_e, agent: unknown): AgentConfig[] => {
    if (agent && typeof agent === 'object') {
      const saved = upsertAgent(agent as Partial<AgentConfig>)
      agentRegistry.refresh(saved.id)
    }
    // A relationship change alters what every other agent may do, so the
    // whole roster is re-derived rather than only the edited agent.
    agentRegistry.refreshAll()
    return listAgents()
  })

  ipcMain.handle('agents:remove', (_e, agentId: unknown): AgentConfig[] => {
    const id = String(agentId ?? '')
    // Stop it before it stops existing, or its execution would keep running
    // with no configuration behind it.
    orchestrator.cancel(id)
    deleteAgent(id)
    forgetAgent(id)
    // A deleted agent must not leave a badge, or a line in the timeline
    // pointing at somebody the roster can no longer name.
    forgetAgentActivity(id)
    agentRegistry.refreshAll()
    return listAgents()
  })

  ipcMain.handle('agents:capabilities', (): CapabilityInfo[] =>
    CAPABILITIES.map((c) => ({ ...c }))
  )

  ipcMain.handle(
    'agents:validate',
    (_e, agentId: unknown): AgentValidation => validateAgent(String(agentId ?? ''))
  )

  /* ------------------------------------------------------------ presence -- */

  ipcMain.handle('agents:spawn', (_e, agentId: unknown) => {
    const id = String(agentId ?? '')
    const validation = validateAgent(id)
    // A broken agent must never appear in the world showing READY.
    if (validation.ok) {
      const agent = setSpawned(id, true)
      agentRegistry.refresh(id)
      if (agent) {
        systemBus.emit({
          type: 'agent.spawned',
          agentId: agent.id,
          agentName: agent.name,
          activity: 'joined the workspace.'
        })
      }
    }
    return { agents: listAgents(), validation }
  })

  ipcMain.handle('agents:despawn', (_e, agentId: unknown): AgentConfig[] => {
    const id = String(agentId ?? '')
    orchestrator.cancel(id)
    // Leaving the office ends whatever was on screen above their head.
    clearActivity(id)
    const agent = setSpawned(id, false)
    agentRegistry.refresh(id)
    if (agent) {
      systemBus.emit({
        type: 'agent.despawned',
        agentId: agent.id,
        agentName: agent.name,
        activity: 'left the workspace.'
      })
    }
    return listAgents()
  })

  ipcMain.handle('agents:states', (): AgentRuntimeState[] => agentRegistry.list())

  /* ------------------------------------------------------------ activity -- */

  /*
   * What everyone is doing, and what they have just done.
   *
   * Both are project-scoped in the store rather than here, so there is no path
   * by which a renderer asking politely gets another project's activity.
   */
  ipcMain.handle('agents:activities', (): AgentActivity[] => listActivities())

  ipcMain.handle(
    'agents:activityTimeline',
    (_e, agentId?: unknown): ActivityEvent[] =>
      activityTimeline(60, typeof agentId === 'string' && agentId ? agentId : undefined)
  )

  /* ---------------------------------------------------------------- work -- */

  ipcMain.handle('agents:run', async (_e, params: RunTaskParams): Promise<RunTaskAck> => {
    const prompt = typeof params?.prompt === 'string' ? params.prompt.trim() : ''
    if (!prompt) return { accepted: false, error: 'Empty prompt.' }

    // Keep git fresh so the awareness block in the prompt is not stale.
    void refreshGit()

    const supplied = (params?.history ?? []).slice(-HISTORY_LIMIT)
    const asTurns = supplied.map((t) => ({ role: t.role, content: t.content }))

    /*
     * Talking to the whole team goes to the team lead.
     *
     * This was a broadcast for a while — every spawned agent answering the
     * same question independently — because a lead that was asked to delegate
     * sometimes just answered everything itself, and one agent silently doing
     * all the work looked identical to delegation being broken.
     *
     * The broadcast solved the wrong half of that. Four agents each reading
     * the same README and each writing their own essay is not a team either:
     * it is the same work four times, billed four times, and the user is left
     * to reconcile four answers to one question.
     *
     * So it routes to the lead again, and the reliability problem is
     * addressed where it actually lives — in the prompt (`godAgentRules` is
     * back in the lead's system message, with the roster it refers to) and in
     * the account of the run the user sees (`TeamRunView`, which shows who was
     * given what and what came back, so a lead that quietly answered alone is
     * visible rather than indistinguishable).
     *
     * `GodAgent` handles the rest: it holds the request open until everything
     * the lead handed out has come back, then asks the lead for one final
     * answer. Workers report into their own sessions as before; nothing there
     * changed, it is just no longer the thing the user reads.
     *
     * The fallback is the old behaviour, and it matters: a project with no
     * lead, or whose lead was deleted or never spawned, must still answer
     * "talk to everyone" somehow rather than refuse over a setting the user
     * may not know exists.
     */
    const wantsTeam = !params?.target || params.target === 'all'
    if (wantsTeam && godAgent.lead()) {
      const run = godAgent.run(prompt, 'user', asTurns.length > 0 ? asTurns : undefined)
      if ('error' in run) return { accepted: false, error: run.error }

      conversationStore.append(workspaceId(), run.leadId, {
        id: makeId('msg'),
        kind: 'user',
        agentId: run.leadId,
        text: prompt,
        at: Date.now(),
        taskId: run.taskId
      })

      return { accepted: true, taskIds: [run.taskId], agentIds: [run.leadId] }
    }

    const targets = recipients(params?.target)
    if (targets.length === 0) {
      return {
        accepted: false,
        error:
          params?.target && params.target !== 'all'
            ? 'That agent is not spawned. Spawn it from the Agents page.'
            : 'No agents are spawned. Spawn one from the Agents page.'
      }
    }

    /*
     * The user's line is written to each recipient's own memory before the
     * task starts. Broadcasting to three agents genuinely puts the question in
     * three separate conversations rather than one shared log.
     */
    const accepted: string[] = []
    const agentIds: string[] = []
    const rejected: { agentId: string; error: string }[] = []

    const correlationId = makeId('chain')

    for (const agent of targets) {
      /*
       * Submit first, then remember.
       *
       * Submitting captures the agent's history as it stands, and the executor
       * appends the prompt itself as the current turn. Writing the line to
       * memory first would put it in both places, and the model would see the
       * request twice.
       */
      const result = orchestrator.submit({
        agentId: agent.id,
        prompt,
        origin: 'user',
        correlationId,
        depth: 0,
        history: asTurns.length > 0 ? asTurns : undefined
      })

      if (wasRejected(result)) {
        rejected.push({ agentId: agent.id, error: result.error })
      } else {
        conversationStore.append(workspaceId(), agent.id, {
          id: makeId('msg'),
          kind: 'user',
          agentId: agent.id,
          text: prompt,
          at: Date.now(),
          taskId: result.id
        })
        accepted.push(result.id)
        agentIds.push(agent.id)
      }
    }

    if (accepted.length === 0) {
      return {
        accepted: false,
        error: rejected[0]?.error ?? 'Could not start that task.',
        rejected
      }
    }

    return { accepted: true, taskIds: accepted, agentIds, rejected }
  })

  ipcMain.handle('agents:cancel', (_e, agentId: unknown): boolean =>
    orchestrator.cancel(String(agentId ?? ''))
  )

  /*
   * The emergency stop. Cancelling every execution also stops anything the
   * team lead was waiting on, so there is nothing separate to unwind: the
   * synthesis only ever fires for a request whose lead task completed.
   */
  ipcMain.handle('agents:stopAll', async (): Promise<number> => orchestrator.stopAll())

  ipcMain.handle('agents:retry', (_e, taskId: unknown): RunTaskAck => {
    const result = orchestrator.retry(String(taskId ?? ''))
    if (wasRejected(result)) return { accepted: false, error: result.error }
    return { accepted: true, taskIds: [result.id], agentIds: [result.agentId] }
  })

  ipcMain.handle('agents:tasks', (_e, agentId?: unknown): AgentTask[] =>
    listTasks(60, typeof agentId === 'string' && agentId ? agentId : undefined)
  )

  /* -------------------------------------------------------------- memory -- */

  /*
   * A transcript is private memory, so these three handlers do not take the
   * renderer's word for whose it is.
   *
   * The workspace argument is accepted for signature compatibility and then
   * ignored: the real one is read from `workspaceId()`, which is the open
   * project's folder. And the agent must resolve through `getAgent`, which is
   * scoped to the open project — which is in turn scoped to the signed-in
   * account. So an id belonging to another project, or to another user, reads
   * as an agent that does not exist and yields an empty conversation.
   *
   * Before this, both arguments were passed straight through to a store that
   * keys files by exactly those two strings. That was harmless while every
   * transcript on the machine belonged to the same person; with accounts it
   * would be a private conversation readable by anyone who could guess a
   * folder path and an agent id, which are neither secret nor hard to guess.
   */
  function chatTarget(agentId: unknown): string | null {
    const id = String(agentId ?? '')
    return id && getAgent(id) ? id : null
  }

  ipcMain.handle(
    'agents:loadChat',
    (_e, _ws: unknown, agentId: unknown): ChatMessage[] => {
      const id = chatTarget(agentId)
      return id ? conversationStore.load(workspaceId(), id) : []
    }
  )

  ipcMain.handle(
    'agents:appendChat',
    (_e, _ws: unknown, agentId: unknown, message: unknown): void => {
      const id = chatTarget(agentId)
      if (!id || !message || typeof message !== 'object') return
      conversationStore.append(workspaceId(), id, message as ChatMessage)
    }
  )

  ipcMain.handle('agents:clearChat', (_e, _ws: unknown, agentId: unknown): void => {
    const id = chatTarget(agentId)
    if (id) conversationStore.clear(workspaceId(), id)
  })

  /* --------------------------------------------------- relationships -- */

  /*
   * Connecting is a roster-wide change: it alters what two agents may do to
   * each other, so the whole registry is re-derived and every surface is told
   * rather than only the two ends being patched locally.
   */
  ipcMain.handle('agents:connect', (_e, a: unknown, b: unknown) => {
    const result = connectAgents(String(a ?? ''), String(b ?? ''))
    if (result.ok) {
      agentRegistry.refreshAll()
      const from = getAgent(String(a ?? ''))
      const to = getAgent(String(b ?? ''))
      systemBus.emit({
        type: 'agent.connected',
        agentId: from?.id,
        agentName: from?.name,
        targetAgentId: to?.id,
        targetAgentName: to?.name,
        activity: `is now connected to ${to?.name ?? 'another agent'}.`
      })
    }
    return { ...result, agents: listAgents() }
  })

  ipcMain.handle('agents:disconnect', (_e, a: unknown, b: unknown) => {
    const from = getAgent(String(a ?? ''))
    const to = getAgent(String(b ?? ''))
    const result = disconnectAgents(String(a ?? ''), String(b ?? ''))
    if (result.ok) {
      agentRegistry.refreshAll()
      systemBus.emit({
        type: 'agent.disconnected',
        agentId: from?.id,
        agentName: from?.name,
        targetAgentId: to?.id,
        targetAgentName: to?.name,
        activity: `is no longer connected to ${to?.name ?? 'another agent'}.`
      })
    }
    return { ...result, agents: listAgents() }
  })

  /* ------------------------------------------------- collaboration threads -- */

  ipcMain.handle('threads:for', (_e, agentId: unknown) =>
    threadFor(String(agentId ?? ''))
  )

  ipcMain.handle('threads:load', (_e, threadId: unknown): ChatMessage[] =>
    loadThread(String(threadId ?? ''))
  )

  ipcMain.handle('threads:clear', (_e, threadId: unknown): void =>
    clearThread(String(threadId ?? ''))
  )

  ipcMain.handle(
    'threads:post',
    (_e, agentId: unknown, prompt: unknown, recipient?: unknown) =>
      postToThread(
        String(agentId ?? ''),
        String(prompt ?? ''),
        typeof recipient === 'string' && recipient ? recipient : 'all'
      )
  )

  /* ------------------------------------------------------- group chats -- */

  /*
   * Groups are derived from connections rather than stored, so there is
   * deliberately no create handler here. Connecting two agents is what makes a
   * group chat exist; the only things that can be *set* are the name and
   * whether it has been read.
   */
  ipcMain.handle('groups:list', (): GroupChatSummary[] => listGroupChats())

  ipcMain.handle('groups:get', (_e, threadId: unknown): GroupChatSummary | null =>
    getGroupChat(String(threadId ?? ''))
  )

  ipcMain.handle('groups:rename', (_e, threadId: unknown, name: unknown) => {
    renameGroupChat(String(threadId ?? ''), String(name ?? ''))
    return listGroupChats()
  })

  ipcMain.handle('groups:markRead', (_e, threadId: unknown): GroupChatSummary[] => {
    markGroupRead(String(threadId ?? ''))
    return listGroupChats()
  })

  /* ------------------------------------------------------- shared state -- */

  ipcMain.handle(
    'agents:collaboration',
    (_e, agentId?: unknown): CollaborationMessage[] =>
      listCollaboration(60, typeof agentId === 'string' && agentId ? agentId : undefined)
  )

  ipcMain.handle('agents:awareness', async (): Promise<AwarenessSnapshot> => {
    await refreshGit()
    return awarenessSnapshot()
  })

  /* ---------------------------------------------------------- automation -- */

  ipcMain.handle('automation:settings', (): OrchestrationSettings => getSettings())

  ipcMain.handle(
    'automation:updateSettings',
    (_e, patch: unknown): OrchestrationSettings =>
      updateSettings((patch ?? {}) as Partial<OrchestrationSettings>)
  )

  ipcMain.handle('automation:listTriggers', (): Trigger[] => listTriggers())

  ipcMain.handle('automation:saveTrigger', (_e, trigger: unknown): Trigger[] => {
    if (trigger && typeof trigger === 'object') {
      upsertTrigger(trigger as Partial<Trigger>)
    }
    return listTriggers()
  })

  ipcMain.handle('automation:removeTrigger', (_e, id: unknown): Trigger[] => {
    deleteTrigger(String(id ?? ''))
    return listTriggers()
  })

  /*
   * Run now.
   *
   * The same path a schedule or an event takes — `runAutomation` — so there is
   * no version of an automation that behaves differently because a person
   * started it. The trigger is resolved through `getTrigger`, which is scoped
   * to the open project, so a run cannot be started against an automation
   * belonging to another one however the id arrived.
   */
  ipcMain.handle('automation:runNow', (_e, id: unknown) => {
    const trigger = getTrigger(String(id ?? ''))
    if (!trigger) return { ok: false, error: 'That automation no longer exists.' }
    if (!trigger.enabled) return { ok: false, error: 'That automation is paused.' }
    return runAutomation(trigger, { origin: 'manual' })
  })

  ipcMain.handle(
    'automation:listRuns',
    (_e, triggerId?: unknown): AutomationRun[] =>
      listRuns(30, typeof triggerId === 'string' && triggerId ? triggerId : undefined)
  )

  ipcMain.handle(
    'automation:run',
    (_e, runId: unknown): AutomationRun | null => getRun(String(runId ?? '')) ?? null
  )

  /*
   * Natural language, parsed in the main process against the open project's
   * roster. Here rather than in the renderer not for speed: this is the only
   * side that can be trusted about which agents exist, and a parser handed a
   * roster by its caller could be handed one that is not the open project's.
   */
  ipcMain.handle('automation:parse', (_e, text: unknown) =>
    parseAutomation(
      String(text ?? ''),
      listAgents().map((a) => ({ id: a.id, name: a.name, role: a.role }))
    )
  )

  /* --------------------------------------------------------- permissions -- */

  ipcMain.handle(
    'permissions:categories',
    (): PermissionCategoryInfo[] => PERMISSION_CATEGORIES.map((c) => ({ ...c }))
  )

  ipcMain.handle('permissions:get', (): ProjectPermissions => getPermissions())

  ipcMain.handle('permissions:update', (_e, patch: unknown): ProjectPermissions => {
    if (!patch || typeof patch !== 'object') return getPermissions()
    return updatePermissions(patch as Parameters<typeof updatePermissions>[0])
  })

  ipcMain.handle('permissions:history', (): PermissionRecord[] =>
    listPermissionHistory(60)
  )

  ipcMain.handle('permissions:clearHistory', (): PermissionRecord[] => {
    clearPermissionHistory()
    return listPermissionHistory(60)
  })

  ipcMain.handle('permissions:sessionGrants', () => sessionGranted())

  /* ----------------------------------------------------------- approvals -- */

  ipcMain.handle('approvals:pending', () => pendingApprovals())

  /*
   * Three answers, not two. "Allow for this session" is a real third option —
   * it grants the *category* until the app closes or the project changes — and
   * collapsing it into a boolean is how it would quietly become a permanent
   * rule the user never wrote.
   *
   * Anything unrecognised denies. That is the direction this has to fail in.
   */
  ipcMain.handle('approvals:resolve', (_e, id: unknown, answer: unknown): boolean => {
    const choice: ApprovalAnswer =
      answer === true || answer === 'allow'
        ? 'allow'
        : answer === 'session'
          ? 'session'
          : 'deny'
    return resolveApproval(String(id ?? ''), choice)
  })
}

/** Called on quit, so nothing is left mid-execution against a dead window. */
export function disposeAgentHandlers(): void {
  setApprovalPublisher(null)
  disposeScheduler()
  disposeAutomationRunner()
  orchestrator.dispose()
}
