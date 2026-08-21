import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentSession,
  ApprovalRequest,
  BackstageApi,
  FileChange,
  ProviderStatus,
  RunTaskParams,
  RuntimeEvent,
  SessionLine,
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

  /*
   * Projects. `chooseFolder` deliberately only returns a path — the workspace
   * is not opened until a project is, so abandoning setup leaves nothing
   * pointed anywhere.
   */
  projects: {
    bootstrap: () => ipcRenderer.invoke('projects:bootstrap'),
    list: () => ipcRenderer.invoke('projects:list'),
    active: () => ipcRenderer.invoke('projects:active'),
    chooseFolder: () => ipcRenderer.invoke('projects:chooseFolder'),
    create: (draft) => ipcRenderer.invoke('projects:create', draft),
    open: (projectId) => ipcRenderer.invoke('projects:open', projectId),
    update: (projectId, patch) =>
      ipcRenderer.invoke('projects:update', projectId, patch),
    remove: (projectId) => ipcRenderer.invoke('projects:remove', projectId),
    adoptLegacy: (input) => ipcRenderer.invoke('projects:adoptLegacy', input)
  },

  /* Investigations within the open project. */
  cases: {
    list: () => ipcRenderer.invoke('cases:list'),
    tasks: (caseId) => ipcRenderer.invoke('cases:tasks', caseId),
    rename: (caseId, name) => ipcRenderer.invoke('cases:rename', caseId, name),
    setStatus: (caseId, status) =>
      ipcRenderer.invoke('cases:setStatus', caseId, status),
    remove: (caseId) => ipcRenderer.invoke('cases:remove', caseId)
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

    connect: (a, b) => ipcRenderer.invoke('agents:connect', a, b),
    disconnect: (a, b) => ipcRenderer.invoke('agents:disconnect', a, b),

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

  threads: {
    for: (agentId) => ipcRenderer.invoke('threads:for', agentId),
    load: (threadId) => ipcRenderer.invoke('threads:load', threadId),
    clear: (threadId) => ipcRenderer.invoke('threads:clear', threadId),
    post: (agentId, prompt) => ipcRenderer.invoke('threads:post', agentId, prompt)
  },

  sessions: {
    list: () => ipcRenderer.invoke('agentSession:list'),
    lines: (sessionId) => ipcRenderer.invoke('agentSession:lines', sessionId),
    send: (sessionId, text) => ipcRenderer.invoke('agentSession:send', sessionId, text),
    interrupt: (sessionId) => ipcRenderer.invoke('agentSession:interrupt', sessionId),
    rename: (sessionId, name) =>
      ipcRenderer.invoke('agentSession:rename', sessionId, name),
    setCharacter: (sessionId, slot) =>
      ipcRenderer.invoke('agentSession:setCharacter', sessionId, slot),
    connect: (a, b) => ipcRenderer.invoke('agentSession:connect', a, b),
    disconnect: (a, b) => ipcRenderer.invoke('agentSession:disconnect', a, b),
    group: (sessionId) => ipcRenderer.invoke('agentSession:group', sessionId),
    postGroup: (sessionId, text) =>
      ipcRenderer.invoke('agentSession:postGroup', sessionId, text),
    onChanged: (handler) =>
      subscribe<AgentSession[]>('agentSession:changed', handler),
    onLine: (handler) => subscribe<SessionLine>('agentSession:line', handler)
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
