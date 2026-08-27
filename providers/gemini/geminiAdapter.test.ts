import { buildContents, parseParts } from './GeminiProvider'
import type { Part } from '@google/genai'
import type { Turn } from '../provider.types'

/**
 * The Gemini wire translation, checked without an API key.
 *
 * These two functions are the whole of it: `parseParts` turns a response into
 * prose, tool calls and a replayable model turn, and `buildContents` turns our
 * neutral turns back into Gemini `contents`. Every bug that made a Gemini
 * agent loop instead of answering lived in one of them, so each is pinned here
 * by the failure it caused.
 *
 * The shapes below are not invented. They were captured from live
 * `gemini-2.5-flash` and `gemini-3.5-flash` responses: a function call arrives
 * with a `thoughtSignature` beside it and is followed by an empty text part,
 * and 3.x issues a call `id` while 2.5 does not.
 */

let failures = 0

function ok(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`)
  }
}

/* ------------------------------------------------------------- parsing -- */

console.log('\nReading a Gemini response')
{
  // Exactly what a 3.x model returns for "inspect my workspace": a call with a
  // signature, then an empty text part the stream tacks on at the end.
  const raw: Part[] = [
    {
      functionCall: { name: 'workspace_overview', id: 'call_1069137', args: {} },
      thoughtSignature: 'SIGNATURE'
    },
    { text: '' }
  ]
  const parsed = parseParts(raw)

  ok('the tool call is found', parsed.toolCalls.length === 1)
  ok(
    "Gemini's own call id is kept, not replaced",
    parsed.toolCalls[0]?.id === 'call_1069137',
    parsed.toolCalls[0]?.id
  )
  ok('no prose is invented from an empty text part', parsed.text === '')
  ok('the empty part is not replayed', parsed.parts.length === 1)
  ok(
    'the thought signature survives',
    parsed.parts[0]?.thoughtSignature === 'SIGNATURE'
  )
}

{
  // 2.5 issues no id. One must still exist for the runtime to key a result on.
  const parsed = parseParts([{ functionCall: { name: 'filesystem_read', args: { path: 'a' } } }])
  ok('a call with no id still gets one', Boolean(parsed.toolCalls[0]?.id))
  ok(
    'and it is marked as ours rather than passed off as Gemini-issued',
    parsed.toolCalls[0]!.id.startsWith('local_'),
    parsed.toolCalls[0]?.id
  )
}

{
  // Streamed prose arrives in fragments; replaying forty parts is not the same
  // document to the model as replaying one.
  const parsed = parseParts([{ text: 'Hello ' }, { text: 'from ' }, { text: 'Gemini.' }])
  ok('streamed text is assembled', parsed.text === 'Hello from Gemini.')
  ok('and coalesced into one part for replay', parsed.parts.length === 1)
}

{
  // A response can carry both. Neither may be dropped.
  const parsed = parseParts([
    { text: 'Let me look.' },
    { functionCall: { name: 'workspace_overview', id: 'call_1', args: {} } }
  ])
  ok('text alongside a call is kept', parsed.text === 'Let me look.')
  ok('the call alongside text is kept', parsed.toolCalls.length === 1)
  ok('and both are replayed', parsed.parts.length === 2)
}

{
  // A thinking summary is not the answer, and the system prompt forbids
  // revealing it — but its signature is needed for the next turn.
  const parsed = parseParts([
    { text: 'I should check the manifest first.', thought: true, thoughtSignature: 'S' },
    { text: 'The project is a landing page.' }
  ])
  ok('thinking is kept out of the answer', parsed.text === 'The project is a landing page.')
  ok('but is preserved for the next request', parsed.parts.length === 2)
}

/* ------------------------------------------------------- request build -- */

console.log('\nBuilding the next request')
{
  const modelParts: Part[] = [
    { functionCall: { name: 'workspace_overview', id: 'call_1069137', args: {} } }
  ]
  const turns: Turn[] = [
    { role: 'user', content: 'inspect my project' },
    {
      role: 'assistant',
      toolCalls: [{ id: 'call_1069137', name: 'workspace_overview', arguments: {} }],
      providerData: { geminiParts: modelParts }
    },
    {
      role: 'tool',
      toolCallId: 'call_1069137',
      toolName: 'workspace_overview',
      content: 'Workspace root: C:/code/x'
    }
  ]

  const { contents } = buildContents(turns)

  ok('the exchange is three turns', contents.length === 3)
  ok('the model turn is tagged model', contents[1]?.role === 'model')
  ok('a tool result goes back as a user turn', contents[2]?.role === 'user')

  const response = contents[2]?.parts?.[0]?.functionResponse
  ok('the result is a functionResponse', Boolean(response))
  ok(
    "it echoes Gemini's call id",
    response?.id === 'call_1069137',
    String(response?.id)
  )
  ok(
    'a successful result goes under `output`',
    (response?.response as Record<string, unknown>)?.output === 'Workspace root: C:/code/x'
  )
}

{
  // A synthetic id was never issued by Gemini, so echoing it would attach a
  // response to a call the model does not believe it made.
  const { contents } = buildContents([
    {
      role: 'assistant',
      toolCalls: [{ id: 'local_7_abc', name: 'filesystem_read', arguments: {} }],
      providerData: { geminiParts: [{ functionCall: { name: 'filesystem_read', args: {} } }] }
    },
    { role: 'tool', toolCallId: 'local_7_abc', toolName: 'filesystem_read', content: 'hi' }
  ])
  const response = contents[1]?.parts?.[0]?.functionResponse
  ok('an id Gemini never issued is not echoed back', response?.id === undefined)
  ok('the result is still delivered', Boolean(response))
}

{
  // A file whose contents happen to be JSON must not replace the envelope.
  // Reading package.json used to hand the model a bare {name, version, …}
  // object with nothing saying what it was a response to.
  const { contents } = buildContents([
    {
      role: 'tool',
      toolCallId: 'x',
      toolName: 'filesystem_read',
      content: '{"name":"backstage","version":"0.1.0"}'
    }
  ])
  const payload = contents[0]?.parts?.[0]?.functionResponse?.response as Record<string, unknown>
  ok('JSON file contents stay inside `output`', typeof payload?.output === 'string')
  ok('and do not become the response envelope', payload?.name === undefined)
}

{
  // A JSON array parsed into `response` is not even a valid response object.
  const { contents } = buildContents([
    { role: 'tool', toolCallId: 'x', toolName: 'filesystem_read', content: '[1,2,3]' }
  ])
  const payload = contents[0]?.parts?.[0]?.functionResponse?.response
  ok('a JSON array result stays a string', typeof (payload as { output?: unknown })?.output === 'string')
  ok('and the payload is still an object', !Array.isArray(payload))
}

{
  // The model needs to know a tool failed, not receive the failure as a result.
  const { contents } = buildContents([
    {
      role: 'tool',
      toolCallId: 'x',
      toolName: 'filesystem_read',
      isError: true,
      content: 'Error: No such file: package.json'
    }
  ])
  const payload = contents[0]?.parts?.[0]?.functionResponse?.response as Record<string, unknown>
  ok('a failure goes under `error`', typeof payload?.error === 'string')
  ok('and not under `output`', payload?.output === undefined)
}

{
  // The stored history must not be mutated by building a request from it —
  // merging used to append into the very array the turn was holding, so every
  // later request replayed a model turn that had grown parts it never had.
  const stored: Part[] = [{ functionCall: { name: 'a', id: 'call_1', args: {} } }]
  const turns: Turn[] = [
    { role: 'assistant', providerData: { geminiParts: stored } },
    { role: 'assistant', providerData: { geminiParts: [{ text: 'more' }] } }
  ]
  const { contents } = buildContents(turns)
  ok('consecutive model turns are merged', contents.length === 1)
  ok('merging did not grow the stored array', stored.length === 1, `${stored.length}`)
  ok('the merged turn has both parts', (contents[0]?.parts ?? []).length === 2)
}

{
  // Several calls in one turn, which is the case an id-less protocol cannot
  // disambiguate and the one the runtime is required to support.
  const modelParts: Part[] = [
    { functionCall: { name: 'filesystem_read', id: 'call_a', args: { path: 'one' } } },
    { functionCall: { name: 'filesystem_read', id: 'call_b', args: { path: 'two' } } }
  ]
  const { contents } = buildContents([
    {
      role: 'assistant',
      toolCalls: [
        { id: 'call_a', name: 'filesystem_read', arguments: { path: 'one' } },
        { id: 'call_b', name: 'filesystem_read', arguments: { path: 'two' } }
      ],
      providerData: { geminiParts: modelParts }
    },
    { role: 'tool', toolCallId: 'call_a', toolName: 'filesystem_read', content: 'ONE' },
    { role: 'tool', toolCallId: 'call_b', toolName: 'filesystem_read', content: 'TWO' }
  ])

  const responses = (contents[1]?.parts ?? []).map((p) => p.functionResponse)
  ok('both results are in one user turn', responses.length === 2)
  ok(
    'each is matched to the call that asked for it',
    responses[0]?.id === 'call_a' && responses[1]?.id === 'call_b',
    responses.map((r) => r?.id).join(',')
  )
}

{
  // A turn restored from the saved transcript has no provider data at all.
  const { contents } = buildContents([
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi there' },
    { role: 'user', content: 'and again' }
  ])
  ok('a transcript with no provider data still builds', contents.length === 3)
  ok('the assistant line survives', contents[1]?.parts?.[0]?.text === 'hi there')
}

if (failures > 0) {
  console.log(`\n${failures} Gemini adapter check(s) failed.`)
  process.exit(1)
}
console.log('\nAll Gemini adapter checks passed.')
