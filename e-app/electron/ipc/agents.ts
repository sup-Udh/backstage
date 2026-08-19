import { BrowserWindow, ipcMain } from 'electron'
import type {
  AgentConfig,
  RunTaskAck,
  RunTaskParams,
  ToolFamilyInfo
} from '../../src/shared/providerApi'
import type { Turn } from '../providers/provider.types'
import { AgentRuntime } from '../agents/AgentRuntime'
import {
  deleteAgent,
  getAgent,
  listAgents,
  upsertAgent
} from '../agents/agentStore'
import { getProvider } from '../providers/registry'
import { TOOL_FAMILIES } from '../tools/registry'

/**
 * Agent CRUD and task execution.
 *
 * Runtime events are pushed to every window as they happen rather than
 * returned at the end, so the world and the activity feed can react while an
 * agent is still working.
 */

let runtime: AgentRuntime | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** Trim history so a long session cannot quietly grow every request. */
const HISTORY_LIMIT = 12

/** Whose provider is actually usable right now. */
function isRunnable(agent: AgentConfig): boolean {
  return agent.enabled && getProvider(agent.providerId) !== null
}

/**
 * Decide who works on a task.
 *
 * A named agent runs alone. `all` runs the enabled team in sequence, each
 * seeing what the previous one reported — a simple orchestrator rather than a
 * swarm, which is all this stage needs.
 */
function assign(target: string | undefined): AgentConfig[] {
  const all = listAgents()

  if (target && target !== 'all') {
    const wanted = getAgent(target)
    return wanted && isRunnable(wanted) ? [wanted] : []
  }

  const team = all.filter(isRunnable)
  // Cap the fan-out: every extra agent is another full tool loop and bill.
  return target === 'all' ? team.slice(0, 3) : team.slice(0, 1)
}

import { systemBus } from '../agents/EventBus'
import { initTriggerEngine } from '../agents/TriggerEngine'

export function registerAgentHandlers(): void {
  runtime = new AgentRuntime((event) => systemBus.emitEvent(event))
  initTriggerEngine(runtime)

  systemBus.onEvent((event) => {
    broadcast('agent:event', event)
  })

  ipcMain.handle('agents:list', (): AgentConfig[] => listAgents())

  ipcMain.handle('agents:save', (_e, agent: unknown): AgentConfig[] => {
    if (agent && typeof agent === 'object') {
      upsertAgent(agent as Partial<AgentConfig>)
    }
    return listAgents()
  })

  ipcMain.handle('agents:remove', (_e, agentId: unknown): AgentConfig[] => {
    deleteAgent(String(agentId ?? ''))
    return listAgents()
  })

  ipcMain.handle(
    'agents:toolFamilies',
    (): ToolFamilyInfo[] => TOOL_FAMILIES.map((f) => ({ ...f }))
  )

  ipcMain.handle('agents:loadChat', (_e, workspaceId: string, agentId: string) => {
    return require('../agents/conversationStore').conversationStore.load(workspaceId, agentId)
  })

  ipcMain.handle('agents:appendChat', (_e, workspaceId: string, agentId: string, message: any) => {
    require('../agents/conversationStore').conversationStore.append(workspaceId, agentId, message)
  })

  ipcMain.handle('agents:clearChat', (_e, workspaceId: string, agentId: string) => {
    require('../agents/conversationStore').conversationStore.clear(workspaceId, agentId)
  })

  ipcMain.handle('agents:run', async (_e, params: RunTaskParams): Promise<RunTaskAck> => {
    if (!runtime) return { accepted: false, error: 'Runtime not ready.' }

    const prompt = typeof params?.prompt === 'string' ? params.prompt.trim() : ''
    if (!prompt) return { accepted: false, error: 'Empty prompt.' }

    const assigned = assign(params?.target)
    if (assigned.length === 0) {
      return {
        accepted: false,
        error: 'That agent has no connected provider. Check Account.'
      }
    }

    const history: Turn[] = (params?.history ?? [])
      .slice(-HISTORY_LIMIT)
      .map((t) => ({ role: t.role, content: t.content }))

    const taskId = `task_${Date.now().toString(36)}`
    // Deliberately not awaited: the caller gets an ack, the UI follows events.
    void runtime.runTask(taskId, prompt, assigned, history)
    return { accepted: true, taskId }
  })
}
