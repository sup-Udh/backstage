import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentSession,
  ApprovalRequest,
  BackstageApi,
  FileChange,
  ProviderStatus,
  RunTaskParams,
  RuntimeEvent,
  TerminalSession
} from '../src/shared/providerApi'

/**
 * Subscribe to a push channel, handing the renderer only the payload — never
 * the IpcRendererEvent, which would give it a `sender` it has no business
 * holding. Returns an unsubscribe function.
 */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

/**
 * The bridge.
 *
 * Only these operations cross into the renderer, and none of them can return a
 * credential. No ipcRenderer, no raw electron object and no client instance is
 * exposed, so the renderer has no route to a key even if it wanted one.
 * Context isolation stays on.
 */
const api: BackstageApi = {
  platform: process.platform,

  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    status: () => ipcRenderer.invoke('providers:status'),
    connect: (providerId, apiKey) =>
      ipcRenderer.invoke('providers:connect', providerId, apiKey),
    disconnect: (providerId) => ipcRenderer.invoke('providers:disconnect', providerId),
    test: (providerId) => ipcRenderer.invoke('providers:test', providerId),
    selectModel: (providerId, modelId) =>
      ipcRenderer.invoke('providers:selectModel', providerId, modelId),
    onChanged: (handler) => subscribe<ProviderStatus[]>('providers:changed', handler)
  },

  workspace: {
    get: () => ipcRenderer.invoke('workspace:get'),
    choose: () => ipcRenderer.invoke('workspace:choose'),
    clear: () => ipcRenderer.invoke('workspace:clear')
  },

  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    save: (agent) => ipcRenderer.invoke('agents:save', agent),
    remove: (agentId) => ipcRenderer.invoke('agents:remove', agentId),
    capabilities: () => ipcRenderer.invoke('agents:capabilities'),
    validate: (agentId) => ipcRenderer.invoke('agents:validate', agentId),

    spawn: (agentId) => ipcRenderer.invoke('agents:spawn', agentId),
    despawn: (agentId) => ipcRenderer.invoke('agents:despawn', agentId),
    states: () => ipcRenderer.invoke('agents:states'),

    run: (params: RunTaskParams) => ipcRenderer.invoke('agents:run', params),
    cancel: (agentId) => ipcRenderer.invoke('agents:cancel', agentId),
    stopAll: () => ipcRenderer.invoke('agents:stopAll'),
    retry: (taskId) => ipcRenderer.invoke('agents:retry', taskId),
    tasks: (agentId) => ipcRenderer.invoke('agents:tasks', agentId),

    loadChat: (workspaceId, agentId) =>
      ipcRenderer.invoke('agents:loadChat', workspaceId, agentId),
    appendChat: (workspaceId, agentId, message) =>
      ipcRenderer.invoke('agents:appendChat', workspaceId, agentId, message),
    clearChat: (workspaceId, agentId) =>
      ipcRenderer.invoke('agents:clearChat', workspaceId, agentId),

    collaboration: (agentId) => ipcRenderer.invoke('agents:collaboration', agentId),
    awareness: () => ipcRenderer.invoke('agents:awareness'),

    /*
     * Events are pushed while tasks run. The listener is wrapped so the
     * renderer only ever sees the payload, never the IpcRendererEvent — which
     * would hand it a `sender` it has no business holding.
     */
    onEvent: (handler: (event: RuntimeEvent) => void) =>
      subscribe<RuntimeEvent>('agent:event', handler)
  },

  automation: {
    settings: () => ipcRenderer.invoke('automation:settings'),
    updateSettings: (patch) => ipcRenderer.invoke('automation:updateSettings', patch),
    listTriggers: () => ipcRenderer.invoke('automation:listTriggers'),
    saveTrigger: (trigger) => ipcRenderer.invoke('automation:saveTrigger', trigger),
    removeTrigger: (triggerId) =>
      ipcRenderer.invoke('automation:removeTrigger', triggerId)
  },

  /*
   * Approvals. The renderer can answer a request and list what is outstanding,
   * but it cannot invent one — a prompt only ever originates from a tool call
   * the main process is actually holding open.
   */
  approvals: {
    pending: () => ipcRenderer.invoke('approvals:pending'),
    resolve: (id, approved) => ipcRenderer.invoke('approvals:resolve', id, approved),
    onRequest: (handler) => subscribe<ApprovalRequest>('agent:approval', handler)
  },

  /*
   * The terminal surface. The renderer can ask for a session and write to one
   * by id, but has no way to name a program to run — process creation stays
   * entirely in the main process.
   */
  terminal: {
    list: () => ipcRenderer.invoke('terminal:list'),
    create: (options) => ipcRenderer.invoke('terminal:create', options ?? {}),
    write: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
    kill: (id) => ipcRenderer.invoke('terminal:kill', id),
    close: (id) => ipcRenderer.invoke('terminal:close', id),
    buffer: (id) => ipcRenderer.invoke('terminal:buffer', id),
    onOutput: (handler) =>
      subscribe<{ id: string; data: string }>('terminal:output', handler),
    onExit: (handler) =>
      subscribe<{ id: string; exitCode: number }>('terminal:exit', handler),
    onSessions: (handler) =>
      subscribe<TerminalSession[]>('terminal:sessions', handler)
  },

  sessions: {
    list: () => ipcRenderer.invoke('agentSession:list'),
    onChanged: (handler) =>
      subscribe<AgentSession[]>('agentSession:changed', handler)
  },

  files: {
    list: (path: string) => ipcRenderer.invoke('files:list', path),
    read: (path: string) => ipcRenderer.invoke('files:read', path),
    search: (query: string, filenames?: boolean) =>
      ipcRenderer.invoke('files:search', query, filenames),
    onChanges: (handler) =>
      subscribe<{ changes: FileChange[]; total: number }>(
        'workspace:fileChanges',
        handler
      )
  },

  git: {
    status: () => ipcRenderer.invoke('git:status'),
    diff: (path?: string) => ipcRenderer.invoke('git:diff', path),
    log: () => ipcRenderer.invoke('git:log'),
    branch: () => ipcRenderer.invoke('git:branch')
  },

  commands: {
    list: () => ipcRenderer.invoke('commands:list')
  }
}

contextBridge.exposeInMainWorld('backstage', api)
