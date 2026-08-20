import { BrowserWindow, ipcMain } from 'electron'
import type {
  AgentConfig,
  AgentRuntimeState,
  AgentTask,
  AgentValidation,
  AwarenessSnapshot,
  CapabilityInfo,
  ChatMessage,
  CollaborationMessage,
  OrchestrationSettings,
  RunTaskAck,
  RunTaskParams,
  Trigger
} from '../../src/shared/providerApi'
import { CAPABILITIES } from '../../src/shared/capabilities'
import {
  deleteAgent,
  getAgent,
  listAgents,
  setSpawned,
  upsertAgent
} from '../agents/agentStore'
import { agentRegistry, validateAgent } from '../agents/AgentRegistry'
import { orchestrator, wasRejected } from '../agents/AgentOrchestrator'
import { initTriggerEngine } from '../agents/TriggerEngine'
import { systemBus } from '../agents/EventBus'
import { conversationStore } from '../agents/conversationStore'
import { listCollaboration } from '../agents/collaborationStore'
import { listTasks } from '../agents/taskStore'
import { getSettings, updateSettings } from '../agents/settingsStore'
import {
  deleteTrigger,
  forgetAgent,
  listTriggers,
  upsertTrigger
} from '../agents/triggerStore'
import {
  pendingApprovals,
  resolveApproval,
  setApprovalPublisher
} from '../agents/approvals'
import { awarenessSnapshot, refreshGit } from '../workspace/awareness'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import { makeId } from '../agents/persist'

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
function recipients(target: string | undefined): AgentConfig[] {
  const spawned = listAgents().filter((a) => a.enabled && a.spawned)

  if (!target || target === 'all') return spawned

  const wanted = getAgent(target)
  return wanted ? [wanted] : []
}

export function registerAgentHandlers(): void {
  initTriggerEngine()
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

  /* ---------------------------------------------------------------- work -- */

  ipcMain.handle('agents:run', async (_e, params: RunTaskParams): Promise<RunTaskAck> => {
    const prompt = typeof params?.prompt === 'string' ? params.prompt.trim() : ''
    if (!prompt) return { accepted: false, error: 'Empty prompt.' }

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

    // Keep git fresh so the awareness block in the prompt is not stale.
    void refreshGit()

    /*
     * The user's line is written to each recipient's own memory before the
     * task starts. Broadcasting to three agents genuinely puts the question in
     * three separate conversations rather than one shared log.
     */
    const supplied = (params?.history ?? []).slice(-HISTORY_LIMIT)

    const accepted: string[] = []
    const agentIds: string[] = []
    const rejected: { agentId: string; error: string }[] = []

    const correlationId = makeId('chain')

    for (const agent of targets) {
      conversationStore.append(workspaceId(), agent.id, {
        id: makeId('msg'),
        kind: 'user',
        agentId: agent.id,
        text: prompt,
        at: Date.now()
      })

      const result = orchestrator.submit({
        agentId: agent.id,
        prompt,
        origin: 'user',
        correlationId,
        depth: 0,
        history:
          supplied.length > 0
            ? supplied.map((t) => ({ role: t.role, content: t.content }))
            : undefined
      })

      if (wasRejected(result)) {
        rejected.push({ agentId: agent.id, error: result.error })
      } else {
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

  ipcMain.handle('agents:stopAll', (): number => orchestrator.stopAll())

  ipcMain.handle('agents:retry', (_e, taskId: unknown): RunTaskAck => {
    const result = orchestrator.retry(String(taskId ?? ''))
    if (wasRejected(result)) return { accepted: false, error: result.error }
    return { accepted: true, taskIds: [result.id], agentIds: [result.agentId] }
  })

  ipcMain.handle('agents:tasks', (_e, agentId?: unknown): AgentTask[] =>
    listTasks(60, typeof agentId === 'string' && agentId ? agentId : undefined)
  )

  /* -------------------------------------------------------------- memory -- */

  ipcMain.handle(
    'agents:loadChat',
    (_e, ws: unknown, agentId: unknown): ChatMessage[] =>
      conversationStore.load(String(ws ?? ''), String(agentId ?? ''))
  )

  ipcMain.handle(
    'agents:appendChat',
    (_e, ws: unknown, agentId: unknown, message: unknown): void => {
      if (message && typeof message === 'object') {
        conversationStore.append(
          String(ws ?? ''),
          String(agentId ?? ''),
          message as ChatMessage
        )
      }
    }
  )

  ipcMain.handle('agents:clearChat', (_e, ws: unknown, agentId: unknown): void =>
    conversationStore.clear(String(ws ?? ''), String(agentId ?? ''))
  )

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

  /* ----------------------------------------------------------- approvals -- */

  ipcMain.handle('approvals:pending', () => pendingApprovals())

  ipcMain.handle('approvals:resolve', (_e, id: unknown, approved: unknown): boolean =>
    resolveApproval(String(id ?? ''), approved === true)
  )
}

/** Called on quit, so nothing is left mid-execution against a dead window. */
export function disposeAgentHandlers(): void {
  setApprovalPublisher(null)
  orchestrator.dispose()
}
