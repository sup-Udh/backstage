import type { CharacterDef } from '../../characters/character.types'
import { castNameForSlot } from '../../project/cast'
import type {
  AgentConfig,
  AgentRuntimeState,
  ThreadInfo
} from '../../shared/providerApi'
import { StatusChip } from '../../components/AgentStatus/StatusChip'
import { useBackstage } from '../../stores/backstageStore'
import { findWorker, type Worker } from '../../agents/workers'

interface Props {
  /** The project's cast. Nobody outside it can be named here. */
  cast: CharacterDef[]
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

/** An action line, cut to something that fits on a roster row. */
function shorten(action: string): string {
  return action.length > 28 ? `${action.slice(0, 27)}…` : action
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
  cast,
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

  const characterName = (agent: AgentConfig) =>
    castNameForSlot(cast, agent.characterSlot)

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
              className="shrink-0 border-2 border-ink bg-cream px-2 py-0.5 font-pixel text-[9px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-rust hover:text-on-slate"
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
          className="mt-1.5 border-2 border-ink bg-brand px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-on-brand shadow-[2px_2px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-y-px"
        >
          Open Agents
        </button>
      </div>
    )
  }

  if (isBroadcast) {
    /*
     * Everyone, each on their own.
     *
     * This briefly routed to a single team lead who was asked to split the
     * request up. Every gate on that path was verified working — the lead was
     * configured, held delegate_task, and had spawned teammates to give work
     * to — and the model still answered the whole thing itself, leaving three
     * agents idle and the user unable to tell. So the request reaches every
     * agent again, and the header says so rather than describing a workflow
     * that may or may not occur.
     *
     * The count is stated plainly because it is the expensive part: sending to
     * four agents is four model calls, and that is worth knowing before
     * pressing enter rather than after.
     */
    const isTeamRunning = recipients.some((a) => {
      const state = states[a.id]
      return (
        state &&
        ['queued', 'thinking', 'working', 'talking', 'waiting'].includes(state.status)
      )
    })

    return (
      <div className="shrink-0 border-b-2 border-rule bg-brand-pale px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-pixel text-[12px] font-bold uppercase tracking-[0.08em] text-ink">
            All agents
          </p>
          <div className="flex shrink-0 items-baseline gap-2">
            {isTeamRunning && (
              <button
                type="button"
                onClick={() => onStop('all')}
                className="border-2 border-ink bg-cream px-2 py-0.5 font-pixel text-[9px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-rust hover:text-on-slate"
              >
                Stop all
              </button>
            )}
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink">
              {recipients.length} agent{recipients.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <p className="mt-0.5 font-ui text-[11px] leading-snug text-ink-3">
          Each one answers on its own, in its own session — {recipients.length}{' '}
          separate {recipients.length === 1 ? 'reply' : 'replies'}, and{' '}
          {recipients.length === 1 ? 'one model call' : `${recipients.length} model calls`}.
          They can still hand work to each other where you have connected them.
        </p>

        {/*
          The roster, live. Reading the runtime rather than a guess: an agent
          with nothing to do says so, and one mid-execution says what it is
          doing. This is the same state the pixel world animates from.
        */}
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {recipients.map((a) => {
            const state = states[a.id]
            const busy =
              state !== undefined &&
              ['queued', 'thinking', 'working', 'talking', 'waiting'].includes(
                state.status
              )
            return (
              <li key={a.id} className="flex items-baseline gap-1">
                <span
                  aria-hidden
                  className={
                    busy
                      ? 'blink font-mono text-[9px] text-brand-deep'
                      : 'font-mono text-[9px] text-ink-3'
                  }
                >
                  {busy ? '●' : '○'}
                </span>
                <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink">
                  {characterName(a)}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
                  {state?.action ? shorten(state.action) : (state?.status ?? 'offline')}
                </span>
              </li>
            )
          })}
        </ul>
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
            className="shrink-0 border-2 border-ink bg-cream px-2 py-0.5 font-pixel text-[9px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-rust hover:text-on-slate"
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
