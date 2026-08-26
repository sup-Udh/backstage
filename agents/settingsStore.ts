import type { OrchestrationSettings } from './agent.types'
import { readJson, writeJson } from './persist'
import { mirror } from '../supabase/mirror'

/**
 * Orchestration settings.
 *
 * AUTO collaboration defaults to OFF and is never turned on for the user.
 * Automatic agent-to-agent work spends real money on every hop, so the only
 * defensible default is the one where nothing happens until it is asked for.
 * The other three values are the loop protections, kept here rather than
 * hard-coded so they can be tightened without a rebuild.
 */

const FILE = 'orchestration.json'

const DEFAULTS: OrchestrationSettings = {
  autoCollaboration: false,
  maxChainDepth: 3,
  defaultCooldownMs: 30_000,
  maxMessagesPerChain: 12
}

let cached: OrchestrationSettings | null = null

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(v)))
}

export function getSettings(): OrchestrationSettings {
  if (cached) return cached
  const raw = readJson<Partial<OrchestrationSettings>>(FILE, {})
  cached = {
    autoCollaboration: raw.autoCollaboration === true,
    maxChainDepth: clamp(raw.maxChainDepth, 1, 10, DEFAULTS.maxChainDepth),
    defaultCooldownMs: clamp(
      raw.defaultCooldownMs,
      0,
      3_600_000,
      DEFAULTS.defaultCooldownMs
    ),
    maxMessagesPerChain: clamp(
      raw.maxMessagesPerChain,
      1,
      100,
      DEFAULTS.maxMessagesPerChain
    )
  }
  return cached
}

export function updateSettings(
  patch: Partial<OrchestrationSettings>
): OrchestrationSettings {
  const current = getSettings()
  cached = {
    autoCollaboration:
      patch.autoCollaboration === undefined
        ? current.autoCollaboration
        : patch.autoCollaboration === true,
    maxChainDepth: clamp(
      patch.maxChainDepth ?? current.maxChainDepth,
      1,
      10,
      current.maxChainDepth
    ),
    defaultCooldownMs: clamp(
      patch.defaultCooldownMs ?? current.defaultCooldownMs,
      0,
      3_600_000,
      current.defaultCooldownMs
    ),
    maxMessagesPerChain: clamp(
      patch.maxMessagesPerChain ?? current.maxMessagesPerChain,
      1,
      100,
      current.maxMessagesPerChain
    )
  }
  writeJson(FILE, cached)
  /*
   * Account-level rather than project-level: these are the orchestration
   * limits, which govern how much a run may spend and how far it may chain.
   * They follow the person, not the piece of work.
   */
  mirror.settings({ ...cached })
  return cached
}
