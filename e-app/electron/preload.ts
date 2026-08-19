import { contextBridge, ipcRenderer } from 'electron'
import type {
  BackstageApi,
  ConnectionResult,
  GenerateParams,
  GenerationResult,
  ProviderStatus
} from '../src/shared/providerApi'

/**
 * The bridge.
 *
 * Only these five operations cross into the renderer, and none of them can
 * return a credential. No ipcRenderer, no raw electron object and no client
 * instance is exposed, so the renderer has no way to reach the key even if it
 * wanted to. Context isolation stays on.
 */
const api: BackstageApi = {
  platform: process.platform,

  openai: {
    connect: (apiKey: string): Promise<ConnectionResult> =>
      ipcRenderer.invoke('openai:connect', apiKey),

    disconnect: (): Promise<ProviderStatus> =>
      ipcRenderer.invoke('openai:disconnect'),

    getStatus: (): Promise<ProviderStatus> =>
      ipcRenderer.invoke('openai:getStatus'),

    testConnection: (): Promise<ConnectionResult> =>
      ipcRenderer.invoke('openai:testConnection'),

    selectModel: (modelId: string): Promise<ProviderStatus> =>
      ipcRenderer.invoke('openai:selectModel', modelId),

    generate: (params: GenerateParams): Promise<GenerationResult> =>
      ipcRenderer.invoke('openai:generate', params)
  }
}

contextBridge.exposeInMainWorld('backstage', api)
