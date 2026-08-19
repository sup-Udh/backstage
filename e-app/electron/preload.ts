import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentRuntimeEvent,
  BackstageApi,
  RunTaskParams
} from '../src/shared/providerApi'

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
      ipcRenderer.invoke('providers:selectModel', providerId, modelId)
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
    toolFamilies: () => ipcRenderer.invoke('agents:toolFamilies'),
    run: (params: RunTaskParams) => ipcRenderer.invoke('agents:run', params),

    /*
     * Events are pushed while a task runs. The listener is wrapped so the
     * renderer only ever sees the payload, never the IpcRendererEvent — which
     * would hand it a `sender` it has no business holding.
     */
    onEvent: (handler: (event: AgentRuntimeEvent) => void) => {
      const listener = (_e: unknown, payload: AgentRuntimeEvent) => handler(payload)
      ipcRenderer.on('agent:event', listener)
      return () => {
        ipcRenderer.removeListener('agent:event', listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('backstage', api)
