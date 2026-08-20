import type { Op } from './ops'

/**
 * Provider marks, drawn as pixel art at sprite scale.
 *
 * These are deliberately simplified 7x7 impressions rather than faithful
 * trademark reproductions - at this size a literal logo is unreadable anyway,
 * and the point is only to signal "which model is driving this agent".
 *
 * The mapping lives here rather than in a theme because a provider is a
 * provider in every world: swapping the detective office for a space station
 * changes the character, not the model behind it.
 */

export const MARK_SIZE = 7

/** Anthropic's Claude: a radial burst. */
const claude: Op[] = [
  [0, 3, 7, 1, 'mark'],
  [3, 0, 1, 7, 'mark'],
  [1, 1, 1, 1, 'mark'],
  [2, 2, 1, 1, 'mark'],
  [4, 4, 1, 1, 'mark'],
  [5, 5, 1, 1, 'mark'],
  [5, 1, 1, 1, 'mark'],
  [4, 2, 1, 1, 'mark'],
  [2, 4, 1, 1, 'mark'],
  [1, 5, 1, 1, 'mark']
]

/** OpenAI: a hexagonal knot, reduced to a rosette outline. */
const openai: Op[] = [
  [2, 0, 3, 1, 'mark'],
  [1, 1, 1, 1, 'mark'],
  [5, 1, 1, 1, 'mark'],
  [0, 2, 1, 3, 'mark'],
  [6, 2, 1, 3, 'mark'],
  [1, 5, 1, 1, 'mark'],
  [5, 5, 1, 1, 'mark'],
  [2, 6, 3, 1, 'mark'],
  [3, 2, 1, 3, 'mark'],
  [2, 3, 3, 1, 'mark']
]

/** Google's Gemini: a four-point spark. */
const gemini: Op[] = [
  [3, 0, 1, 7, 'mark'],
  [0, 3, 7, 1, 'mark'],
  [2, 2, 3, 3, 'mark'],
  [2, 1, 1, 1, 'mark'],
  [4, 1, 1, 1, 'mark'],
  [2, 5, 1, 1, 'mark'],
  [4, 5, 1, 1, 'mark']
]

/** Anything unrecognised: a plain filled diamond. */
const generic: Op[] = [
  [3, 0, 1, 7, 'mark'],
  [2, 1, 3, 5, 'mark'],
  [1, 2, 5, 3, 'mark'],
  [0, 3, 7, 1, 'mark']
]

/**
 * Pick a mark from a model name. Matching is on the family prefix, so
 * "Claude Opus", "Claude Haiku" and a future "Claude 5" all resolve without
 * needing this table updated.
 */
export function markForModel(model: string): Op[] {
  const m = model.toLowerCase()
  if (m.startsWith('claude')) return claude
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('openai')) {
    return openai
  }
  if (m.startsWith('gemini')) return gemini
  return generic
}
