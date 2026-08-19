import { ipcMain } from 'electron'
import type {
  ConnectionResult,
  GenerateParams,
  GenerationResult,
  ProviderModel,
  ProviderStatus
} from '../../src/shared/providerApi'
import {
  deleteApiKey,
  getApiKey,
  hasApiKey,
  readConfig,
  saveApiKey,
  setSelectedModel
} from '../credentials/secureStore'
import { OpenAIProvider, logProviderError, pickDefaultModel } from '../providers/openai'
import { systemPromptFor } from '../agents/prompts'

/**
 * The IPC surface for OpenAI.
 *
 * Every handler returns plain, safe data. The API key is read from the secure
 * store inside this process when a call needs it and is never part of a reply,
 * an error message, or a log line.
 */

/** Whether the last authenticated call succeeded, for this app run. */
let lastCheckOk = false
/** Cached model list, so the picker does not re-query on every render. */
let cachedModels: ProviderModel[] = []

/** How many prior turns to send. Enough for continuity, bounded for cost. */
const HISTORY_LIMIT = 12

function provider(): OpenAIProvider | null {
  const key = getApiKey()
  return key ? new OpenAIProvider(key) : null
}

function currentStatus(): ProviderStatus {
  const config = readConfig()
  const keyPresent = hasApiKey()
  return {
    connected: keyPresent && lastCheckOk,
    hasKey: keyPresent,
    keyHint: keyPresent ? config.keyHint : null,
    selectedModel: config.selectedModel,
    models: cachedModels
  }
}

export function registerOpenAIHandlers(): void {
  ipcMain.handle('openai:getStatus', (): ProviderStatus => currentStatus())

  ipcMain.handle(
    'openai:connect',
    async (_e, apiKey: unknown): Promise<ConnectionResult> => {
      if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
        return {
          success: false,
          errorKind: 'auth',
          error: 'That does not look like an API key.',
          status: currentStatus()
        }
      }

      // Verify before storing, so a bad key never becomes the saved state.
      const candidate = new OpenAIProvider(apiKey.trim())
      const result = await candidate.testConnection()

      if (!result.success) {
        return {
          success: false,
          error: result.failure?.message ?? 'Could not connect to OpenAI.',
          errorKind: result.failure?.kind ?? 'unknown',
          status: currentStatus()
        }
      }

      try {
        saveApiKey(apiKey)
      } catch (err) {
        logProviderError('saveApiKey', err)
        return {
          success: false,
          errorKind: 'unknown',
          error:
            err instanceof Error && err.message.includes('secure storage')
              ? 'This machine has no secure credential storage available.'
              : 'Could not save the API key.',
          status: currentStatus()
        }
      }

      cachedModels = result.models ?? []
      lastCheckOk = true

      // Pick a cheap default rather than silently choosing the largest model.
      const config = readConfig()
      const stillValid =
        config.selectedModel &&
        cachedModels.some((m) => m.id === config.selectedModel)
      if (!stillValid) setSelectedModel(pickDefaultModel(cachedModels))

      return { success: true, status: currentStatus() }
    }
  )

  ipcMain.handle('openai:disconnect', (): ProviderStatus => {
    deleteApiKey()
    setSelectedModel(null)
    cachedModels = []
    lastCheckOk = false
    return currentStatus()
  })

  ipcMain.handle('openai:testConnection', async (): Promise<ConnectionResult> => {
    const client = provider()
    if (!client) {
      lastCheckOk = false
      return {
        success: false,
        errorKind: 'not_connected',
        error: 'No API key is stored.',
        status: currentStatus()
      }
    }

    const result = await client.testConnection()
    lastCheckOk = result.success
    if (result.success) cachedModels = result.models ?? cachedModels

    return {
      success: result.success,
      error: result.failure?.message,
      errorKind: result.failure?.kind,
      status: currentStatus()
    }
  })

  ipcMain.handle(
    'openai:selectModel',
    (_e, modelId: unknown): ProviderStatus => {
      if (typeof modelId === 'string' && modelId) setSelectedModel(modelId)
      return currentStatus()
    }
  )

  ipcMain.handle(
    'openai:generate',
    async (_e, params: GenerateParams): Promise<GenerationResult> => {
      const client = provider()
      if (!client) {
        return {
          success: false,
          errorKind: 'not_connected',
          error: 'OpenAI is not connected.'
        }
      }

      const config = readConfig()
      const model = config.selectedModel ?? pickDefaultModel(cachedModels)
      if (!model) {
        return {
          success: false,
          errorKind: 'not_connected',
          error: 'No model selected.'
        }
      }

      const input = typeof params?.input === 'string' ? params.input.trim() : ''
      if (!input) {
        return { success: false, errorKind: 'bad_request', error: 'Empty prompt.' }
      }

      try {
        const result = await client.generateResponse({
          model,
          input,
          system: systemPromptFor(params?.agentRole),
          history: (params?.history ?? []).slice(-HISTORY_LIMIT)
        })
        lastCheckOk = true
        return {
          success: true,
          text: result.text,
          responseId: result.responseId,
          model: result.model
        }
      } catch (err) {
        logProviderError('generate', err)
        const failure = OpenAIProvider.normalise(err)
        if (failure.kind === 'auth') lastCheckOk = false
        return { success: false, error: failure.message, errorKind: failure.kind }
      }
    }
  )
}
