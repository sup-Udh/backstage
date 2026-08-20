import type {
  ProviderErrorKind,
  ProviderModel
} from '../../src/shared/providerApi'

/**
 * What every AI provider must offer.
 *
 * Nothing above this interface knows about a specific SDK, a specific request
 * shape, or a specific error format. Adding a provider means writing one class
 * that satisfies this — the agent runtime, the tools, the chat panel, the
 * world and the character system stay untouched.
 */

export interface ProviderFailure {
  kind: ProviderErrorKind
  /** Safe to show a user. Never contains a key or a raw payload. */
  message: string
}

export interface TestResult {
  success: boolean
  failure?: ProviderFailure
  /** Models the account can actually reach, when the test succeeded. */
  models?: ProviderModel[]
}

/** A tool as the model should see it. Provider-neutral. */
export interface ToolSpec {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ToolCall {
  /** Provider-issued id, echoed back with the result. */
  id: string
  name: string
  arguments: Record<string, unknown>
}

/**
 * One turn of the conversation, in a shape every provider can express.
 * `tool` turns carry the output of a call the model asked for.
 */
export type TurnRole = 'user' | 'assistant' | 'tool'

export interface Turn {
  role: TurnRole
  content?: string
  /** On an assistant turn: calls the model wants run. */
  toolCalls?: ToolCall[]
  /** On a tool turn: which call this answers. */
  toolCallId?: string
  toolName?: string
}

export interface GenerateTurnRequest {
  model: string
  system: string
  turns: Turn[]
  tools: ToolSpec[]
  /**
   * Called with each fragment of prose as it arrives.
   *
   * Optional on both sides: a caller that does not pass one gets the same
   * single result it always did, and a provider whose SDK cannot stream can
   * ignore it and still satisfy the interface. That keeps streaming a
   * capability rather than a requirement — a new provider is not blocked from
   * being added because it only supports whole responses.
   *
   * Only ever carries assistant prose. Tool calls are not streamed: a
   * half-parsed set of arguments is not something the runtime could act on,
   * and showing one to the user would be showing them a decision the model
   * has not finished making.
   */
  onDelta?: (chunk: string) => void
}

export interface GenerateTurnResult {
  /** Final prose, when the model is done. */
  text?: string
  /** Tools the model wants run before it can continue. */
  toolCalls?: ToolCall[]
}

export interface AIProvider {
  readonly id: string
  readonly name: string

  testConnection(): Promise<TestResult>
  listModels(): Promise<ProviderModel[]>

  /**
   * One round trip. The runtime owns the loop: it calls this, runs any tools
   * the model asked for, appends the results and calls again.
   */
  generateTurn(req: GenerateTurnRequest): Promise<GenerateTurnResult>
}
