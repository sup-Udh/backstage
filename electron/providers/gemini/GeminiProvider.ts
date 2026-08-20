import { GoogleGenAI, type Content, type Part } from '@google/genai'
import type { ProviderModel } from '../../../src/shared/providerApi'
import type {
  AIProvider,
  GenerateTurnRequest,
  GenerateTurnResult,
  ProviderFailure,
  TestResult,
  ToolCall
} from '../provider.types'

/**
 * The only place in Backstage that knows Gemini exists.
 *
 * Same contract as the OpenAI provider: it owns the SDK, the request shape and
 * Google's error formats, and returns the neutral turn/tool-call structures the
 * agent runtime works in. The runtime cannot tell the two apart.
 */
export class GeminiProvider implements AIProvider {
  readonly id = 'gemini'
  readonly name = 'Gemini'

  private client: GoogleGenAI

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey })
  }

  static normalise(err: unknown): ProviderFailure {
    const status =
      (err as { status?: number })?.status ??
      (err as { code?: number })?.code ??
      undefined
    const raw = String((err as Error)?.message ?? '')

    if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(raw)) {
      return { kind: 'auth', message: 'That API key was rejected.' }
    }
    if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(raw)) {
      return {
        kind: 'rate_limit',
        message: 'Rate limited by Gemini. Wait a moment and try again.'
      }
    }
    if (status === 404 || /not found|NOT_FOUND/i.test(raw)) {
      return {
        kind: 'bad_request',
        message: 'That model is not available on your account.'
      }
    }
    if (typeof status === 'number' && status >= 500) {
      return { kind: 'network', message: 'Gemini is having trouble. Try again shortly.' }
    }
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(raw)) {
      return { kind: 'network', message: 'Could not reach Gemini. Check your connection.' }
    }
    if (typeof status === 'number' && status >= 400) {
      return { kind: 'bad_request', message: 'Gemini rejected that request.' }
    }
    return { kind: 'unknown', message: 'Something went wrong while contacting Gemini.' }
  }

  async testConnection(): Promise<TestResult> {
    try {
      const models = await this.listModels()
      return { success: true, models }
    } catch (err) {
      logGeminiError('testConnection', err)
      return { success: false, failure: GeminiProvider.normalise(err) }
    }
  }

  /**
   * Ask the account what it can reach, rather than hard-coding ids that go
   * stale. Only models that can actually generate content are offered.
   */
  async listModels(): Promise<ProviderModel[]> {
    const page = await this.client.models.list()
    const out: ProviderModel[] = []

    for await (const model of page) {
      const id = (model.name ?? '').replace(/^models\//, '')
      if (!id) continue
      const actions = model.supportedActions ?? []
      if (actions.length > 0 && !actions.includes('generateContent')) continue
      if (/embedding|aqa|imagen|veo|tts|image|native-audio/i.test(id)) continue

      out.push({
        id,
        name: model.displayName ?? id,
        description: (model.description ?? '').slice(0, 120) || 'Available on your account.',
        verified: true
      })
    }

    // Cheap-and-fast first, so the default pick is not the most expensive one.
    const rank = (id: string) =>
      /flash-lite/i.test(id) ? 0 : /flash/i.test(id) ? 1 : /pro/i.test(id) ? 3 : 2
    return out.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
  }

  /**
   * One round trip.
   *
   * Gemini takes a `contents` array of role-tagged parts, with tool results
   * expressed as `functionResponse` parts on a `user` turn. Translating our
   * neutral turns into that is the only Gemini-shaped logic in the loop.
   */
  async generateTurn(req: GenerateTurnRequest): Promise<GenerateTurnResult> {
    const contents: Content[] = []

    for (const turn of req.turns) {
      if (turn.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: turn.toolName ?? 'tool',
                response: { result: turn.content ?? '' }
              }
            }
          ]
        })
        continue
      }

      if (turn.role === 'assistant') {
        const parts: Part[] = []
        if (turn.content) parts.push({ text: turn.content })
        for (const call of turn.toolCalls ?? []) {
          parts.push({ functionCall: { name: call.name, args: call.arguments } })
        }
        if (parts.length) contents.push({ role: 'model', parts })
        continue
      }

      if (turn.content) contents.push({ role: 'user', parts: [{ text: turn.content }] })
    }

    const response = await this.client.models.generateContent({
      model: req.model,
      contents,
      config: {
        systemInstruction: req.system,
        tools: [
          {
            functionDeclarations: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.parameters
            }))
          }
        ]
      }
    })

    const toolCalls: ToolCall[] = (response.functionCalls ?? []).map((c, i) => ({
      // Gemini does not issue call ids; the loop only needs them to be unique.
      id: c.id ?? `gemini_${Date.now()}_${i}`,
      name: c.name ?? '',
      arguments: (c.args ?? {}) as Record<string, unknown>
    }))

    const text = (response.text ?? '').trim()
    if (toolCalls.length > 0) return { text: text || undefined, toolCalls }
    return { text }
  }
}

export function logGeminiError(where: string, err: unknown): void {
  const status = (err as { status?: number })?.status ?? '-'
  const name = (err as { name?: string })?.name ?? 'Error'
  console.error(`[gemini] ${where} failed: ${name} status=${status}`)
}
