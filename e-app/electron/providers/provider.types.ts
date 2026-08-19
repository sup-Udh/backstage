import type {
  ProviderErrorKind,
  ProviderModel
} from '../../src/shared/providerApi'

/**
 * What every AI provider must offer.
 *
 * Nothing above this interface knows about the OpenAI SDK, the Responses API,
 * or OpenAI's error shapes. Adding Anthropic or Gemini later means writing a
 * second class here — the agent layer, the chat panel, the world and the
 * character system stay untouched.
 */

export interface ProviderFailure {
  kind: ProviderErrorKind
  /** Safe to show a user. Never contains the key or a raw payload. */
  message: string
}

export interface TestResult {
  success: boolean
  failure?: ProviderFailure
  /** Models the account can actually reach, when the test succeeded. */
  models?: ProviderModel[]
}

export interface GenerateRequest {
  model: string
  input: string
  system?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}

export interface GenerateSuccess {
  text: string
  responseId?: string
  model: string
}

export interface AIProvider {
  readonly id: string
  readonly name: string

  testConnection(): Promise<TestResult>
  listModels(): Promise<ProviderModel[]>
  generateResponse(req: GenerateRequest): Promise<GenerateSuccess>
}
