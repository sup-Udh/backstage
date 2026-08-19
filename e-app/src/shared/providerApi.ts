/**
 * The contract between the renderer and the main process.
 *
 * Types only — this file is erased at compile time, so both the preload
 * bundle and the React bundle can import it without either pulling the
 * other's runtime in. Nothing here carries a credential: the renderer is
 * never told the API key, only whether one exists.
 */

export interface ProviderModel {
  id: string
  name: string
  description: string
  /** True when the id came back from the provider rather than our catalogue. */
  verified: boolean
}

export interface ProviderStatus {
  /** A key is stored and the last check succeeded. */
  connected: boolean
  /** A key is stored, whether or not it currently works. */
  hasKey: boolean
  /** Masked for display, e.g. "sk-…4f2a". Never the whole key. */
  keyHint: string | null
  selectedModel: string | null
  models: ProviderModel[]
}

/** Normalised failure kinds, so the UI can offer the right next step. */
export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'network'
  | 'not_connected'
  | 'bad_request'
  | 'unknown'

export interface ConnectionResult {
  success: boolean
  /** Safe, user-facing text. Never contains the key or a raw API payload. */
  error?: string
  errorKind?: ProviderErrorKind
  status?: ProviderStatus
}

export interface GenerationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface GenerateParams {
  input: string
  /** Prior turns for this session. The main process trims them. */
  history?: GenerationTurn[]
  /** Which agent is asking, so the right system prompt is used. */
  agentRole?: string
}

export interface GenerationResult {
  success: boolean
  text?: string
  responseId?: string
  model?: string
  error?: string
  errorKind?: ProviderErrorKind
}

export interface OpenAIApi {
  connect(apiKey: string): Promise<ConnectionResult>
  disconnect(): Promise<ProviderStatus>
  getStatus(): Promise<ProviderStatus>
  testConnection(): Promise<ConnectionResult>
  selectModel(modelId: string): Promise<ProviderStatus>
  generate(params: GenerateParams): Promise<GenerationResult>
}

export interface BackstageApi {
  platform: string
  openai: OpenAIApi
}

declare global {
  interface Window {
    backstage: BackstageApi
  }
}
