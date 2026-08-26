import type { AIProvider, ProviderFailure } from './provider.types'
import { OpenAIProvider } from './openai/OpenAIProvider'
import { GeminiProvider } from './gemini/GeminiProvider'
import { getApiKey } from '../credentials/secureStore'
import { currentUserId } from '../supabase/authService'

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

/* --------------------------------------------------- credential policy -- */

/**
 * Why a provider could not be built.
 *
 * Distinguished rather than collapsed into null, because the three mean
 * completely different things to the user: sign in, connect a key, or check
 * the provider id. An agent that reports "not configured" when the real
 * problem is that the session expired sends somebody to the wrong screen.
 */
export type ResolutionFailure = 'no_account' | 'no_key' | 'unknown_provider'

export interface ProviderResolution {
  provider: AIProvider | null
  failure: ResolutionFailure | null
  /** Already phrased for the user. Never contains any part of a key. */
  message: string | null
}

/**
 * THE PROVIDER CREDENTIAL POLICY.
 *
 * One rule, and it is deliberately the whole policy:
 *
 *     A request is made with the credential the *signed-in user* stored for
 *     that provider. If they have not stored one, the request does not happen.
 *
 * That is it. In particular, none of the following are ever consulted:
 *
 *   process.env.OPENAI_API_KEY   and every sibling. Environment variables
 *   process.env.GEMINI_API_KEY   configure the *application* — the Supabase
 *   process.env.ANTHROPIC_...    URL, the callback port — never a user's
 *                                provider credentials. A developer running
 *                                from a shell that happens to export a key
 *                                must not have that key silently spent by
 *                                whoever signs into their build.
 *
 *   another account's key        keys are stored per Supabase user id; there
 *                                is no path from one account's directory to
 *                                another's, and `currentUserId()` is read at
 *                                the moment of use rather than cached.
 *
 *   a cached client              providers are constructed per call from the
 *                                key on disk. There is no long-lived client
 *                                holding a credential that could outlive the
 *                                session that authorised it.
 *
 * The absence of a fallback is the feature. Every fallback in a system like
 * this is a path by which one person's request goes out on another person's
 * credential, and the failure is invisible — the request succeeds, so nobody
 * investigates until the bill arrives.
 *
 * Documented in full in USER_PROVIDER_CONFIGURATION.md.
 */
export function resolveProvider(id: string): ProviderResolution {
  const def = BY_ID.get(id)
  if (!def) {
    return {
      provider: null,
      failure: 'unknown_provider',
      message: `There is no provider called "${id}".`
    }
  }

  if (!currentUserId()) {
    return {
      provider: null,
      failure: 'no_account',
      message: 'Sign in to Backstage before running an agent.'
    }
  }

  const key = getApiKey(id)
  if (!key) {
    return {
      provider: null,
      failure: 'no_key',
      message: `Connect your ${def.name} API key in Settings → AI Providers.`
    }
  }

  return { provider: def.create(key), failure: null, message: null }
}

/**
 * An instance built from the signed-in user's stored key, or null.
 *
 * The compact form of `resolveProvider`, kept because most callers only need
 * to know whether they have a provider. Anything that reports a failure to the
 * user should call `resolveProvider` instead and use its message, so the
 * person is told which of the three things to go and fix.
 */
export function getProvider(id: string): AIProvider | null {
  return resolveProvider(id).provider
}
