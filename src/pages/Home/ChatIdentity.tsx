import type { Theme } from '../../themes/types'
import type {
  AgentConfig,
  AgentRuntimeState,
  ThreadInfo
} from '../../shared/providerApi'
import { StatusChip } from '../../components/AgentStatus/StatusChip'
import { useBackstage } from '../../stores/backstageStore'
import { findWorker, type Worker } from '../../agents/workers'

interface Props {
  theme: Theme
  workers: Worker[]
  /** Everyone this message would reach. One agent, or the whole office. */
  recipients: AgentConfig[]
  isBroadcast: boolean
  states: Record<string, AgentRuntimeState>
  /** Set when the group conversation is on screen rather than a private one. */
  thread: ThreadInfo | null
  providerName: (agent: AgentConfig) => string
  modelName: (agent: AgentConfig) => string
  onStop: (agentId: string) => void
  onLeaveThread: () => void
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
  workers,
  recipients,
  isBroadcast,
  states,
  thread,
  providerName,
  modelName,
  onStop,
  onLeaveThread
}: Props) {
  const target = useBackstage((s) => s.chatTarget)

  const characterName = (agent: AgentConfig) => {
    const cast = theme.characters
    return cast[((agent.characterSlot % cast.length) + cast.length) % cast.length].name
  }

  /*
   * A group conversation, named as one. The point of the banner here is that
   * the user can never mistake the shared thread for a private session — they
   * hold different messages and are sent to differently, so they must not
   * look alike.
   */
  if (thread) {
    return (
      <div className="shrink-0 border-b-2 border-brand-deep bg-brand-pale px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-pixel text-[12px] font-bold uppercase tracking-[0.08em] text-ink">
            {thread.names.join(' ↔ ')}
          </p>
          <button
            type="button"
            onClick={onLeaveThread}
            className="shrink-0 border-2 border-ink bg-cream px-2 py-0.5 font-pixel text-[9px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand"
          >
            Leave group
          </button>
        </div>
        <p className="mt-0.5 font-ui text-[11px] leading-snug text-ink-3">
          Collaboration thread. Separate from each agent&rsquo;s own conversation
          — nothing said here is part of those.
        </p>
      </div>
    )
  }

  /*
   * A CLI session. Named after the process rather than the character, and
   * marked as a real session so the user knows their message is going to a
   * program they started rather than into Backstage's own runtime.
   */
  const sessionWorker = findWorker(workers, target)
  if (sessionWorker?.kind === 'cli') {
    return (
      <div className="shrink-0 border-b-2 border-rule bg-cream-2 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-pixel text-[12px] font-bold uppercase tracking-[0.08em] text-ink">
            {sessionWorker.name}
            <span className="ml-2 font-normal text-ink-3">{sessionWorker.role}</span>
          </p>
          {sessionWorker.canStop && (
            <button
              type="button"
              onClick={() => onStop(sessionWorker.id)}
              title="Interrupt the current turn. The session stays open."
              className="shrink-0 border-2 border-ink bg-cream px-2 py-0.5 font-pixel text-[9px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-rust hover:text-cream"
            >
              Stop
            </button>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
            Live session
            <span className="mx-1 text-rule">·</span>
            <span className="text-ink">{sessionWorker.model}</span>
          </p>
          <StatusChip status={sessionWorker.status} />
        </div>

        {sessionWorker.action && (
          <p className="mt-0.5 truncate font-ui text-[11px] leading-snug text-ink-3">
            {sessionWorker.action}
          </p>
        )}
      </div>
    )
  }

  if (recipients.length === 0) {
    return (
      <div className="shrink-0 border-b-2 border-rule bg-brand-pale px-3 py-2">
        <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
          Nobody is in the office
        </p>
        <p className="mt-0.5 font-ui text-[11px] leading-snug text-ink-3">
          Agents exist until you spawn them; spawning is what brings one into
          the workspace so it can take work.
        </p>
        {/* The way out, rather than a description of the way out. */}
        <button
          type="button"
          onClick={() => useBackstage.getState().setPage('agents')}
          className="mt-1.5 border-2 border-ink bg-brand px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-y-px"
        >
          Open Agents
        </button>
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
