import type { Theme } from '../../themes/types'
import type { AgentConfig, AgentRuntimeState } from '../../shared/providerApi'
import { StatusChip } from '../../components/AgentStatus/StatusChip'

interface Props {
  theme: Theme
  /** Everyone this message would reach. One agent, or the whole office. */
  recipients: AgentConfig[]
  isBroadcast: boolean
  states: Record<string, AgentRuntimeState>
  providerName: (agent: AgentConfig) => string
  modelName: (agent: AgentConfig) => string
  onStop: (agentId: string) => void
}

/**
 * Who you are talking to, always on screen.
 *
 * Switching between agents is the thing this product is for, and the failure
 * mode is losing track of which one is listening — so the name, the role and
 * the engine behind it are stated rather than implied by a dropdown two rows
 * up. In broadcast mode it names the recipients instead, because sending to
 * three agents by accident is expensive.
 */
export function ChatIdentity({
  theme,
  recipients,
  isBroadcast,
  states,
  providerName,
  modelName,
  onStop
}: Props) {
  const characterName = (agent: AgentConfig) => {
    const cast = theme.characters
    return cast[((agent.characterSlot % cast.length) + cast.length) % cast.length].name
  }

  if (recipients.length === 0) {
    return (
      <div className="shrink-0 border-b-2 border-rule bg-cream-2 px-3 py-2">
        <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
          Nobody is in the office
        </p>
        <p className="mt-0.5 font-ui text-[11px] leading-snug text-ink-3">
          Spawn an agent on the Agents page to start working.
        </p>
      </div>
    )
  }

  if (isBroadcast) {
    return (
      <div className="shrink-0 border-b-2 border-rule bg-brand-pale px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-pixel text-[12px] font-bold uppercase tracking-[0.08em] text-ink">
            All agents
          </p>
          <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink">
            {recipients.length} recipient{recipients.length === 1 ? '' : 's'}
          </p>
        </div>
        <p className="mt-0.5 font-ui text-[11px] leading-snug text-ink-3">
          {recipients.map(characterName).join(', ')} — each answers separately.
        </p>
      </div>
    )
  }

  const agent = recipients[0]
  const state = states[agent.id]
  const running = state?.executionId !== null && state?.executionId !== undefined

  return (
    <div className="shrink-0 border-b-2 border-rule bg-cream-2 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-pixel text-[12px] font-bold uppercase tracking-[0.08em] text-ink">
          {characterName(agent)}
          <span className="ml-2 font-normal text-ink-3">{agent.role}</span>
        </p>
        {running && (
          <button
            type="button"
            onClick={() => onStop(agent.id)}
            className="shrink-0 border-2 border-ink bg-cream px-2 py-0.5 font-pixel text-[9px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-rust hover:text-cream"
          >
            Stop
          </button>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
          {providerName(agent)}
          <span className="mx-1 text-rule">·</span>
          <span className="text-ink">{modelName(agent)}</span>
        </p>
        <StatusChip status={state?.status ?? 'offline'} />
        {(state?.queued ?? 0) > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
            +{state?.queued} queued
          </span>
        )}
      </div>

      {state?.action && (
        <p className="mt-0.5 truncate font-ui text-[11px] leading-snug text-ink-3">
          {state.action}
        </p>
      )}
    </div>
  )
}
