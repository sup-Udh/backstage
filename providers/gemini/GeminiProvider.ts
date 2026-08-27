import { GoogleGenAI, type Content, type Part } from '@google/genai'
import type { ProviderModel } from '../../src/shared/providerApi'
import type {
  AIProvider,
  GenerateTurnRequest,
  GenerateTurnResult,
  ProviderFailure,
  RequestIdentity,
  TestResult,
  ToolCall,
  Turn
} from '../provider.types'

/**
 * The only place in Backstage that knows Gemini exists.
 *
 * Same contract as the OpenAI provider: it owns the SDK, the request shape and
 * Google's error formats, and returns the neutral turn/tool-call structures the
 * agent runtime works in. The runtime cannot tell the two apart.
 *
 * ---------------------------------------------------------------------------
 * What a Gemini model turn actually contains, and why it is kept whole
 * ---------------------------------------------------------------------------
 *
 * A single response is a list of `Part`s, and the interesting ones are not all
 * text. A 2.5/3.x response to a tool-using prompt typically looks like:
 *
 *     part 0   functionCall { name, id, args }   + thoughtSignature
 *     part 1   text ""                            (empty; a stream artefact)
 *
 * Three separate things in there have to survive into the *next* request or
 * the model loses the thread of what it already did:
 *
 *   functionCall.id      Gemini issues an id per call ("call_1069137") and the
 *                        API contract is that the client echoes it back on the
 *                        matching functionResponse. Without it a turn
 *                        containing two calls to the same tool cannot be
 *                        matched to its two results by anything but name.
 *   thoughtSignature     an opaque continuation token for the model's own
 *                        reasoning. Dropping it makes the model re-derive its
 *                        plan from scratch, which is what a repeated
 *                        `workspace_overview` looks like from outside.
 *   the ordering         functionResponses must line up with the calls they
 *                        answer.
 *
 * So the raw parts are preserved on the turn as `providerData.geminiParts` and
 * replayed. They are *sanitised* on the way through — empty parts dropped,
 * adjacent plain-text fragments coalesced — because a stream delivers prose in
 * pieces and replaying forty one-word parts is not the same document to the
 * model as replaying one.
 */

/** Rebuilt per response; never shared between executions. */
export interface ParsedResponse {
  text: string
  toolCalls: ToolCall[]
  /** The model turn, cleaned and safe to replay verbatim. */
  parts: Part[]
}

/**
 * How many times a 429 is waited out before the turn is failed.
 *
 * The Gemini free tier is five requests per minute per model, and one agent
 * answering one question about a project spends three to seven of them — so a
 * second agent starting up, or simply a thorough first one, hits the limit as
 * a matter of course rather than as an anomaly. Google returns the exact wait
 * in the error; honouring it turns a hard failure into a pause.
 *
 * This is deliberately a *retry*, not a queue. Nothing here serialises agents:
 * two executions that both wait out a 429 resume independently, which is the
 * behaviour wanted — a global Gemini lock would fix the symptom by removing
 * the concurrency the feature exists to provide.
 */
const MAX_RATE_LIMIT_RETRIES = 3
/** Never sleep longer than this on one retry, whatever the server asks for. */
const MAX_RETRY_WAIT_MS = 65_000

/** Monotonic, so a synthetic id is never reused across concurrent executions. */
let synthetic = 0

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
      /*
       * Say which limit, because the two need opposite responses from the
       * user. A per-minute limit clears by waiting; a per-day one does not,
       * and telling somebody to "wait a moment" when their daily allowance is
       * gone sends them round the same loop until midnight.
       */
      const perDay = /per\s*day|PerDay|RequestsPerDay/i.test(raw)
      return {
        kind: 'rate_limit',
        message: perDay
          ? "You have used up this model's free daily quota on your Gemini account. It resets tomorrow, or you can enable billing or pick another model."
          : 'Rate limited by Gemini — the free tier allows only a few requests a minute. Wait a moment and try again.'
      }
    }
    if (status === 404 || /not found|NOT_FOUND|no longer available/i.test(raw)) {
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
   * Everything in here is derived from the request argument. There is no
   * instance state and no module state beyond a counter, so two executions
   * calling this at the same time cannot see each other's conversation.
   */
  async generateTurn(req: GenerateTurnRequest): Promise<GenerateTurnResult> {
    const who = tag(req.identity)
    const { contents, geminiIssuedIds } = buildContents(req.turns)

    const params: Record<string, unknown> = {
      model: req.model,
      contents,
      config: {
        systemInstruction: req.system,
        ...(req.tools.length > 0
          ? {
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
          : {})
      }
    }

    console.log(
      `${who} request model=${req.model} contents=${contents.length} tools=${req.tools.length}` +
        ` (echoable call ids: ${geminiIssuedIds.size})`
    )

    const parsed = await this.withRateLimitRetry(who, () =>
      req.onDelta ? this.streamOnce(params, req.onDelta) : this.callOnce(params)
    )

    for (const call of parsed.toolCalls) {
      console.log(`${who} functionCall ${call.name} id=${call.id}`)
    }
    if (parsed.text.trim()) {
      console.log(`${who} final text (${parsed.text.trim().length} chars)`)
    }

    return {
      text: parsed.text.trim() || undefined,
      toolCalls: parsed.toolCalls.length > 0 ? parsed.toolCalls : undefined,
      providerData: { geminiParts: parsed.parts }
    }
  }

  /**
   * Wait out a rate limit rather than failing the whole task on it.
   *
   * Only 429 is retried, and only for as long as Google says to wait. Every
   * other failure is thrown straight through: retrying a bad request or a
   * rejected key just spends more time arriving at the same answer.
   */
  private async withRateLimitRetry(
    who: string,
    attempt: () => Promise<ParsedResponse>
  ): Promise<ParsedResponse> {
    for (let tries = 0; ; tries++) {
      try {
        return await attempt()
      } catch (err) {
        const wait = retryDelayMs(err)
        if (wait === null || tries >= MAX_RATE_LIMIT_RETRIES) throw err
        console.log(
          `${who} rate limited — waiting ${Math.round(wait / 1000)}s ` +
            `(retry ${tries + 1} of ${MAX_RATE_LIMIT_RETRIES})`
        )
        await sleep(wait)
      }
    }
  }

  private async callOnce(params: Record<string, unknown>): Promise<ParsedResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await this.client.models.generateContent(params as any)
    return parseParts(response.candidates?.[0]?.content?.parts ?? [])
  }

  /**
   * Streaming, with the same parse applied to the assembled parts.
   *
   * Only genuine prose reaches `onDelta`. A thinking summary arrives as a text
   * part flagged `thought`, and forwarding those would put the model's private
   * reasoning into the chat panel — which the system prompt explicitly tells
   * the agent not to reveal.
   */
  private async streamOnce(
    params: Record<string, unknown>,
    onDelta: (chunk: string) => void
  ): Promise<ParsedResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await this.client.models.generateContentStream(params as any)
    const collected: Part[] = []

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? []
      collected.push(...parts)
      for (const p of parts) {
        if (p.text && !p.thought) onDelta(p.text)
      }
    }
    return parseParts(collected)
  }
}

/* --------------------------------------------------------------- parsing -- */

/**
 * Turn a raw part list into prose, tool calls, and a replayable model turn.
 *
 * The three are produced together on purpose: the ids handed to the runtime as
 * `ToolCall.id` are the same ids left on the `functionCall` parts kept for
 * replay, so the tool result can be matched back to its call on the next
 * request.
 */
export function parseParts(raw: Part[]): ParsedResponse {
  let text = ''
  const toolCalls: ToolCall[] = []
  const parts: Part[] = []

  for (const part of raw) {
    if (part.functionCall) {
      /*
       * Keep Gemini's own id when there is one. The synthetic fallback exists
       * only so the runtime always has something to key a result on; it is
       * never echoed back, because inventing an id the model never issued is
       * how a functionResponse ends up unmatched.
       */
      const id = part.functionCall.id ?? `local_${++synthetic}_${Date.now().toString(36)}`
      toolCalls.push({
        id,
        name: part.functionCall.name ?? '',
        arguments: (part.functionCall.args ?? {}) as Record<string, unknown>
      })
      parts.push(part)
      continue
    }

    // A thinking summary is not the answer. Preserved for replay (it carries
    // the signature the next turn needs) but kept out of the visible text.
    if (part.thought) {
      parts.push(part)
      continue
    }

    if (typeof part.text === 'string') {
      if (part.text === '') {
        // A stream artefact. Replaying it adds an empty part to the model turn
        // and tells the model nothing.
        if (part.thoughtSignature) parts.push(part)
        continue
      }
      text += part.text

      // Coalesce with the previous part when both are plain text, so streamed
      // prose is replayed as one document rather than as its fragments.
      const last = parts[parts.length - 1]
      if (
        last &&
        typeof last.text === 'string' &&
        !last.functionCall &&
        !last.thought &&
        !last.thoughtSignature &&
        !part.thoughtSignature
      ) {
        last.text += part.text
      } else {
        parts.push({ ...part })
      }
      continue
    }

    // Anything else the SDK models — inline data, executable code, code
    // results — is passed through untouched rather than silently dropped.
    if (Object.keys(part).length > 0) parts.push(part)
  }

  return { text, toolCalls, parts }
}

/* -------------------------------------------------------- request build -- */

/**
 * Our neutral turns, as Gemini `contents`.
 *
 * Also reports which tool-call ids Gemini actually issued, so the caller can
 * see at a glance whether responses will be matched by id or only by name.
 */
export function buildContents(turns: Turn[]): {
  contents: Content[]
  geminiIssuedIds: Set<string>
} {
  const contents: Content[] = []

  /*
   * Every id Gemini has issued in this conversation so far.
   *
   * Collected as the turns are walked rather than tracked on the side, because
   * the tool turn that needs it comes after the model turn that carries it.
   * An id that is not in here is one this adapter invented, and must not be
   * echoed.
   */
  const geminiIssuedIds = new Set<string>()

  for (const turn of turns) {
    const role = turn.role === 'assistant' ? 'model' : 'user'
    const parts = partsFor(turn, geminiIssuedIds)
    if (parts.length === 0) continue

    const last = contents[contents.length - 1]
    if (last && last.role === role) {
      /*
       * Merged into a *copy*. The previous version pushed the turn's stored
       * `geminiParts` array into `contents` by reference and then appended to
       * it here, which mutated the conversation history in place — every
       * subsequent request replayed a model turn that had grown extra parts it
       * never contained.
       */
      last.parts = [...(last.parts ?? []), ...parts]
    } else {
      contents.push({ role, parts })
    }
  }

  return { contents, geminiIssuedIds }
}

function partsFor(turn: Turn, geminiIssuedIds: Set<string>): Part[] {
  if (turn.role === 'tool') {
    const response: Record<string, unknown> = turn.isError
      ? { error: turn.content ?? 'The tool failed.' }
      : { output: turn.content ?? '' }

    /*
     * The result goes in under `output` (or `error`) as a string, always.
     *
     * It used to try `JSON.parse` on the tool's output and, if that worked,
     * use the parsed value as the whole response object. That quietly did
     * three wrong things: reading a JSON file replaced the response envelope
     * with the file's own top-level keys, so the model got a bare object with
     * no indication of what it was; a file containing a JSON *array* produced
     * a payload that is not a valid response object at all; and a failed tool
     * whose message happened to parse lost its error framing. The API's own
     * contract is that `output` and `error` are the keys with meaning, so
     * those are the keys used.
     */
    return [
      {
        functionResponse: {
          ...(turn.toolCallId && geminiIssuedIds.has(turn.toolCallId)
            ? { id: turn.toolCallId }
            : {}),
          name: turn.toolName ?? 'tool',
          response
        }
      }
    ]
  }

  if (turn.role === 'assistant') {
    const stored = turn.providerData?.geminiParts as Part[] | undefined
    if (stored && stored.length > 0) {
      for (const part of stored) {
        if (part.functionCall?.id) geminiIssuedIds.add(part.functionCall.id)
      }
      // A copy: `contents` must never alias the stored history.
      return stored.map((p) => ({ ...p }))
    }

    /*
     * No provider data — a turn restored from the saved transcript, or one
     * produced by a different provider. Rebuilt from the neutral fields, which
     * is lossy by definition: there is no thought signature to recover, and
     * the ids are ours rather than Gemini's, so they are not echoed later.
     */
    const parts: Part[] = []
    if (turn.content) parts.push({ text: turn.content })
    for (const call of turn.toolCalls ?? []) {
      parts.push({ functionCall: { name: call.name, args: call.arguments } })
    }
    return parts
  }

  return turn.content ? [{ text: turn.content }] : []
}

/* ---------------------------------------------------------------- errors -- */

/**
 * How long to wait before retrying, or null if this is not a rate limit.
 *
 * Google puts the authoritative figure in the error body — as a `retryDelay`
 * of the form "36.09s" — so it is read from there rather than guessed at with
 * a backoff curve that would either give up too early or sleep far too long.
 * A daily quota is never retried: there is no wait that clears it.
 */
function retryDelayMs(err: unknown): number | null {
  const status = (err as { status?: number })?.status ?? (err as { code?: number })?.code
  const raw = String((err as Error)?.message ?? '')
  const isRateLimit = status === 429 || /RESOURCE_EXHAUSTED|Too Many Requests/i.test(raw)
  if (!isRateLimit) return null
  if (/per\s*day|PerDay|RequestsPerDay/i.test(raw)) return null

  const match = raw.match(/retryDelay["\s:]+([0-9.]+)s/i) ?? raw.match(/retry in ([0-9.]+)s/i)
  const seconds = match ? Number(match[1]) : 30
  if (!Number.isFinite(seconds)) return null
  // A second of headroom: resuming on the exact boundary tends to 429 again.
  return Math.min((seconds + 1) * 1000, MAX_RETRY_WAIT_MS)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** `[gemini][agent:Dwight][exec:abc123]`, or just `[gemini]` outside a run. */
function tag(identity?: RequestIdentity): string {
  if (!identity) return '[gemini]'
  return `[gemini][agent:${identity.agentName}][exec:${identity.executionId}]`
}

export function logGeminiError(where: string, err: unknown): void {
  const status = (err as { status?: number })?.status ?? '-'
  const name = (err as { name?: string })?.name ?? 'Error'
  console.error(`[gemini] ${where} failed: ${name} status=${status}`)
}
