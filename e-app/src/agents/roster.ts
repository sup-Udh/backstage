import type { FakeAgentSpec } from './fakeAgentRuntime'

/**
 * The agents themselves: ids and the model behind each one.
 *
 * Note there is nothing visual here, and no mention of the detective office.
 * A theme binds its characters to these ids; swapping themes re-casts the
 * same four agents without touching this file.
 */
export const roster: FakeAgentSpec[] = [
  { id: 'agent-1', model: 'Claude Opus' },
  { id: 'agent-2', model: 'Claude Sonnet' },
  { id: 'agent-3', model: 'GPT-5' },
  { id: 'agent-4', model: 'Claude Haiku' }
]
