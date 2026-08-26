import type { ProviderModel } from '../../src/shared/providerApi'

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

/**
 * How to describe and rank a model.
 *
 * Matching is on tier keywords rather than rigid id prefixes: a plain prefix
 * table gets `gpt-5.4-mini` wrong, because it starts with `gpt-5` and would be
 * labelled as the large model. Tier is read from the suffix, family from the
 * version, so new releases are described correctly without an update here.
 */
type Tier = 'nano' | 'mini' | 'lite' | 'pro' | 'standard'

const TIER_NOTE: Record<Tier, { suffix: string; description: string; rank: number; defaultable: boolean }> = {
  /*
   * Listed first, and deliberately not the automatic default.
   *
   * The nano tier is the cheapest thing an account can reach, and picking it
   * automatically made it the model every agent in every new project ran on.
   * That is the wrong default for this product specifically: an agent here is
   * expected to hold a long layered system prompt, choose between seventeen
   * tools, and — if it is the team lead — read a request, split it, call
   * delegate_task once per teammate and still do its own part. The nano tier
   * does not reliably do that, and the failure is not an error message. It is
   * an agent that answers the whole question itself and looks like delegation
   * being broken.
   *
   * It stays selectable, because for a cheap single-purpose agent it is a
   * perfectly good choice. It is just not the one to hand somebody who has not
   * chosen yet.
   */
  nano: {
    suffix: 'Nano',
    description: 'Smallest and cheapest. Struggles with tools and delegation.',
    rank: 0,
    defaultable: false
  },
  mini: {
    suffix: 'Mini',
    description: 'Fast and cost-conscious. A good default.',
    rank: 1,
    defaultable: true
  },
  lite: {
    suffix: 'Lite',
    description: 'Fast and inexpensive.',
    rank: 2,
    defaultable: true
  },
  standard: {
    suffix: '',
    description: 'Balanced capability and cost.',
    rank: 3,
    defaultable: false
  },
  pro: {
    suffix: 'Pro',
    description: 'Most capable. Slower and more expensive.',
    rank: 4,
    defaultable: false
  }
}

function tierOf(id: string): Tier {
  if (/(^|[-.])nano\b/.test(id)) return 'nano'
  if (/(^|[-.])mini\b/.test(id)) return 'mini'
  if (/(^|[-.])lite\b/.test(id)) return 'lite'
  if (/(^|[-.])pro\b/.test(id)) return 'pro'
  return 'standard'
}

/** "gpt-5.6-luna" -> "GPT-5.6 Luna"; "gpt-4o" -> "GPT-4o". */
function labelFor(id: string): string {
  const tier = tierOf(id)
  const words = id
    // Drop a trailing release date, which is noise in a picker.
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .split('-')
    .filter(Boolean)

  const parts = words.map((w) => {
    if (w === 'gpt') return 'GPT'
    if (/^\d/.test(w)) return w
    if (w === 'chat' || w === 'latest') return w
    return w.charAt(0).toUpperCase() + w.slice(1)
  })

  // "gpt" and the version read as one token: GPT-5.6.
  const head = parts.length >= 2 && parts[0] === 'GPT' ? `GPT-${parts[1]}` : parts[0]
  const rest = parts.slice(head === parts[0] ? 1 : 2)
  const name = [head, ...rest].join(' ').trim()
  void tier
  return name
}

/** Newer version families rank above older ones at the same tier. */
function versionOf(id: string): number {
  const m = /^gpt-(\d+)(?:\.(\d+))?/.exec(id)
  if (!m) return 0
  return Number(m[1]) * 100 + Number(m[2] ?? 0)
}

/** Models that are not conversational, so they never belong in the picker. */
const EXCLUDED = /(embedding|whisper|tts|audio|realtime|image|dall-e|moderation|transcribe|search|codex|davinci|babbage)/i

/** Turn raw ids from the API into ranked, described entries for the UI. */
export function describeModels(ids: string[]): ProviderModel[] {
  const usable = ids.filter((id) => !EXCLUDED.test(id) && id.startsWith('gpt-'))

  return usable
    .map((id) => {
      const note = TIER_NOTE[tierOf(id)]
      return {
        id,
        name: labelFor(id),
        description: note.description,
        verified: true,
        _rank: note.rank,
        _version: versionOf(id)
      }
    })
    // Cheapest tier first, and within a tier the newest family first, so the
    // automatic default is never the most expensive model available.
    .sort(
      (a, b) =>
        a._rank - b._rank ||
        b._version - a._version ||
        a.id.length - b.id.length ||
        a.id.localeCompare(b.id)
    )
    .map(({ _rank, _version, ...m }) => {
      void _rank
      void _version
      return m
    })
}

/**
 * Choose a sensible default.
 *
 * Still biased towards the cheap end — a development key should not be
 * spending on the largest model because somebody pressed Connect — but the
 * cheapest *usable* tier rather than the cheapest tier. `defaultable` is what
 * draws that line, and the nano tier is deliberately outside it: see the note
 * above.
 */
export function pickDefaultModel(models: ProviderModel[]): string | null {
  if (models.length === 0) return null
  const cheap = models.find((m) => TIER_NOTE[tierOf(m.id)].defaultable)
  return (cheap ?? models[0]).id
}
