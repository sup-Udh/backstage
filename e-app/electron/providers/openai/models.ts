import type { ProviderModel } from '../../../src/shared/providerApi'

/**
 * The model catalogue.
 *
 * The authoritative list is whatever the account can actually reach, so it is
 * fetched from the API rather than hard-coded — a baked-in id that the account
 * cannot use produces a 404 on every request, and OpenAI ships models faster
 * than any constant in this repo would be updated.
 *
 * What lives here is only the presentation layer: how to describe a family,
 * how to rank it, and which to pick by default. Anything the API returns that
 * we have no note for still appears, just without a description.
 */

/** Families we can describe, best-known first. Prefix match on the model id. */
interface FamilyNote {
  /** Matched against the start of the model id. */
  prefix: string
  label: (id: string) => string
  description: string
  /** Lower sorts earlier. Cheap and fast families rank above large ones. */
  rank: number
  /** Eligible to be chosen automatically as the default. */
  defaultable: boolean
}

const FAMILIES: FamilyNote[] = [
  {
    prefix: 'gpt-5-mini',
    label: () => 'GPT-5 Mini',
    description: 'Fast and cost-conscious. A good default.',
    rank: 0,
    defaultable: true
  },
  {
    prefix: 'gpt-5-nano',
    label: () => 'GPT-5 Nano',
    description: 'Smallest and cheapest.',
    rank: 1,
    defaultable: true
  },
  {
    prefix: 'gpt-5',
    label: () => 'GPT-5',
    description: 'Most capable. Slower and more expensive.',
    rank: 2,
    defaultable: false
  },
  {
    prefix: 'gpt-4.1-mini',
    label: () => 'GPT-4.1 Mini',
    description: 'Fast, inexpensive, widely available.',
    rank: 3,
    defaultable: true
  },
  {
    prefix: 'gpt-4.1',
    label: () => 'GPT-4.1',
    description: 'Strong general model.',
    rank: 4,
    defaultable: false
  },
  {
    prefix: 'gpt-4o-mini',
    label: () => 'GPT-4o Mini',
    description: 'Fast and inexpensive.',
    rank: 5,
    defaultable: true
  },
  {
    prefix: 'gpt-4o',
    label: () => 'GPT-4o',
    description: 'General purpose.',
    rank: 6,
    defaultable: false
  }
]

/** Models that are not conversational, so they never belong in the picker. */
const EXCLUDED = /(embedding|whisper|tts|audio|realtime|image|dall-e|moderation|transcribe|search|codex|davinci|babbage)/i

function noteFor(id: string): FamilyNote | undefined {
  return FAMILIES.find((f) => id.startsWith(f.prefix))
}

/** Turn raw ids from the API into ranked, described entries for the UI. */
export function describeModels(ids: string[]): ProviderModel[] {
  const usable = ids.filter((id) => !EXCLUDED.test(id) && id.startsWith('gpt-'))

  return usable
    .map((id) => {
      const note = noteFor(id)
      return {
        id,
        name: note ? note.label(id) : id,
        description: note?.description ?? 'Available on your account.',
        verified: true,
        _rank: note?.rank ?? 90
      }
    })
    .sort((a, b) => (a._rank === b._rank ? a.id.localeCompare(b.id) : a._rank - b._rank))
    .map(({ _rank, ...m }) => {
      void _rank
      return m
    })
}

/**
 * Choose a sensible default. Deliberately biased towards the cheap end: a
 * development key should not be spending on the largest model just because a
 * user pressed Connect.
 */
export function pickDefaultModel(models: ProviderModel[]): string | null {
  if (models.length === 0) return null
  const cheap = models.find((m) => {
    const note = noteFor(m.id)
    return note?.defaultable === true
  })
  return (cheap ?? models[0]).id
}
