import type { FakeAgentSpec } from './fakeAgentRuntime'

/**
 * The agents themselves: ids and the model behind each one.
 *
 * There is nothing visual here and no mention of any world. A theme binds its
 * characters to these ids, so swapping worlds re-casts the same agents.
 *
 * The first `INITIAL_ACTIVE` are on the team when the app opens; the rest are
 * reserves who join as the workload grows — one more per task the user gives.
 */
export const roster: FakeAgentSpec[] = [
  { id: 'agent-1', model: 'Claude Opus' },
  { id: 'agent-2', model: 'Claude Sonnet' },
  { id: 'agent-3', model: 'GPT-5' },
  { id: 'agent-4', model: 'Claude Haiku' },
  { id: 'agent-5', model: 'Claude Sonnet' },
  { id: 'agent-6', model: 'GPT-5' },
  { id: 'agent-7', model: 'Gemini Pro' },
  { id: 'agent-8', model: 'Claude Opus' }
]

/** How many agents are already in the office on first load. */
export const INITIAL_ACTIVE = 4
