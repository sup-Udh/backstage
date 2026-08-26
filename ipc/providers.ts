import { BrowserWindow, ipcMain } from 'electron'
import type {
  ConnectionResult,
  ProviderDescriptor,
  ProviderModel,
  ProviderStatus
} from '../src/shared/providerApi'
import {
  deleteApiKey,
  hasApiKey,
  readConfig,
  saveApiKey,
  setSelectedModel
} from '../credentials/secureStore'
import {
  PROVIDERS,
  getProvider,
  getProviderDefinition
} from '../providers/registry'

/**
 * The provider IPC surface, generic over the registry.
 *
 * One set of handlers serves every provider; the id is a parameter. Adding a
 * provider needs no change here at all. As before, the API key is read inside
 * this process when needed and never appears in a reply, an error or a log.
 */

/** Per-provider: did the last authenticated call succeed, this app run. */
const lastCheckOk = new Map<string, boolean>()

/**
 * Tell every window the provider picture has changed.
 *
 * Connection state is not something the renderer can derive or poll for: a key
 * is verified asynchronously at startup, and until that finishes a perfectly
 * good key reads as disconnected. Pushing the result is what stops the app
 * opening in a state where it refuses to work for no reason the user can see.
 */
export function refreshProviderStatus(): void {
  broadcastStatus()
}

function broadcastStatus(): void {
  const payload = PROVIDERS.map((p) => statusFor(p.id))
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('providers:changed', payload)
  }
}
/** Per-provider model cache, so the picker does not re-query on every render. */
const cachedModels = new Map<string, ProviderModel[]>()

export function statusFor(providerId: string): ProviderStatus {
  const def = getProviderDefinition(providerId)
  const config = readConfig(providerId)
  const keyPresent = hasApiKey(providerId)
  return {
    id: providerId,
    name: def?.name ?? providerId,
    connected: keyPresent && lastCheckOk.get(providerId) === true,
    hasKey: keyPresent,
    keyHint: keyPresent ? config.keyHint : null,
    selectedModel: config.selectedModel,
    models: cachedModels.get(providerId) ?? []
  }
}

function descriptors(): ProviderDescriptor[] {
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    keyUrl: p.keyUrl
  }))
}

/** Cheapest model first, so connecting never picks the priciest by default. */
function defaultModel(models: ProviderModel[]): string | null {
  return models.length > 0 ? models[0].id : null
}

export function registerProviderHandlers(): void {
  ipcMain.handle('providers:list', (): ProviderDescriptor[] => descriptors())

  ipcMain.handle('providers:status', (): ProviderStatus[] =>
    PROVIDERS.map((p) => statusFor(p.id))
  )

  ipcMain.handle(
    'providers:connect',
    async (_e, providerId: unknown, apiKey: unknown): Promise<ConnectionResult> => {
      const id = String(providerId ?? '')
      const def = getProviderDefinition(id)
      if (!def) {
        return { success: false, errorKind: 'unknown', error: 'Unknown provider.' }
      }
      if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
        return {
          success: false,
          errorKind: 'auth',
          error: 'That does not look like an API key.',
          status: statusFor(id)
        }
      }

      // Verify before storing, so a bad key never becomes the saved state.
      const candidate = def.create(apiKey.trim())
      const result = await candidate.testConnection()

      if (!result.success) {
        return {
          success: false,
          error: result.failure?.message ?? `Could not connect to ${def.name}.`,
          errorKind: result.failure?.kind ?? 'unknown',
          status: statusFor(id)
        }
      }

      try {
        saveApiKey(id, apiKey)
      } catch (err) {
        return {
          success: false,
          errorKind: 'unknown',
          error:
            err instanceof Error && err.message.includes('secure storage')
              ? 'This machine has no secure credential storage available.'
              : 'Could not save the API key.',
          status: statusFor(id)
        }
      }

      const models = result.models ?? []
      cachedModels.set(id, models)
      lastCheckOk.set(id, true)

      const config = readConfig(id)
      const stillValid =
        config.selectedModel && models.some((m) => m.id === config.selectedModel)
      if (!stillValid) setSelectedModel(id, defaultModel(models))

      return { success: true, status: statusFor(id) }
    }
  )

  ipcMain.handle('providers:disconnect', (_e, providerId: unknown): ProviderStatus => {
    const id = String(providerId ?? '')
    deleteApiKey(id)
    setSelectedModel(id, null)
    cachedModels.delete(id)
    lastCheckOk.set(id, false)
    return statusFor(id)
  })

  ipcMain.handle(
    'providers:test',
    async (_e, providerId: unknown): Promise<ConnectionResult> => {
      const id = String(providerId ?? '')
      const client = getProvider(id)
      if (!client) {
        lastCheckOk.set(id, false)
        return {
          success: false,
          errorKind: 'not_connected',
          error: 'No API key is stored.',
          status: statusFor(id)
        }
      }

      const result = await client.testConnection()
      lastCheckOk.set(id, result.success)
      if (result.success && result.models) cachedModels.set(id, result.models)

      return {
        success: result.success,
        error: result.failure?.message,
        errorKind: result.failure?.kind,
        status: statusFor(id)
      }
    }
  )

  ipcMain.handle(
    'providers:selectModel',
    (_e, providerId: unknown, modelId: unknown): ProviderStatus => {
      const id = String(providerId ?? '')
      if (typeof modelId === 'string' && modelId) setSelectedModel(id, modelId)
      return statusFor(id)
    }
  )
}

/**
 * Re-verify stored keys and report the result.
 *
 * Called at start-up and again on every sign-in. The caches below are
 * per-application rather than per-account, so they are cleared first: a model
 * list or an "it worked" flag left over from the previous user would describe
 * a key this account does not have.
 */
export async function primeProviders(): Promise<void> {
  lastCheckOk.clear()
  cachedModels.clear()

  await Promise.all(
    PROVIDERS.map(async (p) => {
      if (!hasApiKey(p.id)) return
      const client = getProvider(p.id)
      if (!client) return
      const result = await client.testConnection()
      lastCheckOk.set(p.id, result.success)
      if (result.success && result.models) cachedModels.set(p.id, result.models)
    })
  )
  broadcastStatus()
}
