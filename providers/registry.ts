import type { AIProvider, ProviderFailure } from './provider.types'
import { OpenAIProvider } from './openai/OpenAIProvider'
import { GeminiProvider } from './gemini/GeminiProvider'
import { getApiKey } from '../credentials/secureStore'

/**
 * The provider registry.
 *
 * Everything above this asks the registry for a provider by id. There is no
 * `if (provider === 'openai')` anywhere else in the application: adding a
 * provider means writing the class, adding one entry here, and it appears in
 * the account UI and becomes selectable for agents automatically.
 */

export interface ProviderDefinition {
  id: string
  name: string
  /** Shown under the name on the account card. */
  blurb: string
  /** Where the user gets a key, shown as help text. */
  keyUrl: string
  create(apiKey: string): AIProvider
  normalise(err: unknown): ProviderFailure
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    blurb: 'GPT models',
    keyUrl: 'https://platform.openai.com/api-keys',
    create: (key) => new OpenAIProvider(key),
    normalise: (err) => OpenAIProvider.normalise(err)
  },
  {
    id: 'gemini',
    name: 'Gemini',
    blurb: 'Google Gemini models',
    keyUrl: 'https://aistudio.google.com/apikey',
    create: (key) => new GeminiProvider(key),
    normalise: (err) => GeminiProvider.normalise(err)
  }
]

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]))

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return BY_ID.get(id)
}

export function providerIds(): string[] {
  return PROVIDERS.map((p) => p.id)
}

/** An instance built from the stored key, or null if none is stored. */
export function getProvider(id: string): AIProvider | null {
  const def = BY_ID.get(id)
  if (!def) return null
  const key = getApiKey(id)
  return key ? def.create(key) : null
}
