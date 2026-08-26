import OpenAI from 'openai'
import type { ProviderModel } from '../../src/shared/providerApi'
import type {
  AIProvider,
  GenerateTurnRequest,
  GenerateTurnResult,
  ProviderFailure,
  TestResult,
  ToolCall
} from '../provider.types'
import { describeModels } from './models'

/**
 * The only place in Backstage that knows OpenAI exists.
 *
 * It owns the SDK, the Responses API call shape, and OpenAI's error formats,
 * and hands the rest of the app normalised results. Everything above it talks
 * in terms of `AIProvider`.
 */
export class OpenAIProvider implements AIProvider {
  readonly id = 'openai'
  readonly name = 'OpenAI'

  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      // The main process is a Node context; this is never bundled into the
      // renderer, so no browser escape hatch is needed or wanted.
      maxRetries: 1,
      timeout: 60_000
    })
  }

  /**
   * Map an SDK error onto something safe and actionable.
   *
   * Deliberately does not pass the provider's own message through: those can
   * echo request content back, and the user cannot act on most of them. The
   * detail goes to the main-process log instead.
   */
  static normalise(err: unknown): ProviderFailure {
    const status = (err as { status?: number })?.status
    const code = (err as { code?: string })?.code

    if (status === 401 || status === 403) {
      return { kind: 'auth', message: 'That API key was rejected.' }
    }
    if (status === 429) {
      return {
        kind: 'rate_limit',
        message: 'Rate limited by OpenAI. Wait a moment and try again.'
      }
    }
    if (status === 402 || code === 'insufficient_quota') {
      return {
        kind: 'quota',
        message: 'Your OpenAI account is out of quota or needs billing set up.'
      }
    }
    if (status === 404) {
      return {
        kind: 'bad_request',
        message: 'That model is not available on your account.'
      }
    }
    if (status && status >= 500) {
      return { kind: 'network', message: 'OpenAI is having trouble. Try again shortly.' }
    }
    if (
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      (err as { name?: string })?.name === 'APIConnectionError'
    ) {
      return { kind: 'network', message: 'Could not reach OpenAI. Check your connection.' }
    }
    if (status && status >= 400) {
      return { kind: 'bad_request', message: 'OpenAI rejected that request.' }
    }
    return { kind: 'unknown', message: 'Something went wrong while contacting OpenAI.' }
  }

  /**
   * A minimal authenticated call. Listing models costs nothing and proves both
   * that the key works and what the account can reach — which is more useful
   * than burning tokens on a throwaway completion.
   */
  async testConnection(): Promise<TestResult> {
    try {
      const models = await this.listModels()
      return { success: true, models }
    } catch (err) {
      logProviderError('testConnection', err)
      return { success: false, failure: OpenAIProvider.normalise(err) }
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    const page = await this.client.models.list()
    const ids: string[] = []
    for await (const model of page) ids.push(model.id)
    return describeModels(ids)
  }

  /**
   * One round trip against the Responses API.
   *
   * Tool calls come back as `function_call` items in `output`; results go back
   * as `function_call_output` items keyed by the same `call_id`. That mapping
   * is the only OpenAI-shaped thing in the whole tool loop.
   */
  async generateTurn(req: GenerateTurnRequest): Promise<GenerateTurnResult> {
    const input: OpenAI.Responses.ResponseInput = []

    for (const turn of req.turns) {
      if (turn.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: turn.toolCallId ?? '',
          output: turn.content ?? ''
        })
        continue
      }

      if (turn.role === 'assistant' && turn.toolCalls?.length) {
        // Replay the calls the model made, so it can see its own history.
        for (const call of turn.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: call.id,
            name: call.name,
            arguments: JSON.stringify(call.arguments)
          })
        }
        if (turn.content) input.push({ role: 'assistant', content: turn.content })
        continue
      }

      if (turn.content) {
        input.push({ role: turn.role, content: turn.content })
      }
    }

    const params = {
      model: req.model,
      instructions: req.system,
      input,
      tools: req.tools.map((t) => ({
        type: 'function' as const,
        name: t.name,
        description: t.description,
        parameters: { ...t.parameters, additionalProperties: false },
        strict: false
      }))
    }

    /*
     * Streaming is used only when somebody is listening.
     *
     * The SDK's stream helper accumulates the same final response object as a
     * non-streaming call, so everything below this point is identical either
     * way — the difference is that the text has already reached the user by
     * the time it resolves. `finalResponse()` still throws on a failed
     * request, so error handling is unchanged too.
     */
    let response: OpenAI.Responses.Response
    if (req.onDelta) {
      const stream = this.client.responses.stream(params)
      stream.on('response.output_text.delta', (event) => {
        if (event.delta) req.onDelta!(event.delta)
      })
      response = await stream.finalResponse()
    } else {
      response = await this.client.responses.create(params)
    }

    const toolCalls: ToolCall[] = []
    for (const item of response.output ?? []) {
      if (item.type !== 'function_call') continue
      toolCalls.push({
        id: item.call_id,
        name: item.name,
        arguments: safeParse(item.arguments)
      })
    }

    const text = (response.output_text ?? '').trim()
    if (toolCalls.length > 0) return { text: text || undefined, toolCalls }
    return { text }
  }
}

/**
 * Diagnostics stay in the main process. Only the status, the code and the
 * error name are recorded — never the request body, the response, or anything
 * that could carry the key.
 */
export function logProviderError(where: string, err: unknown): void {
  const status = (err as { status?: number })?.status ?? '-'
  const code = (err as { code?: string })?.code ?? '-'
  const name = (err as { name?: string })?.name ?? 'Error'
  console.error(`[openai] ${where} failed: ${name} status=${status} code=${code}`)
}

/** Model-authored JSON. Malformed arguments become an empty object so the
 *  tool can reject them with a useful message rather than crashing the loop. */
function safeParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
