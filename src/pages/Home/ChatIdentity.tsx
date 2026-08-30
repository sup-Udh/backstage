import { useState } from 'react'
import type { CharacterDef } from '../../characters/character.types'
import { castNameForSlot } from '../../project/cast'
import type {
  AgentConfig,
  AgentRuntimeState,
  ThreadInfo
} from '../../shared/providerApi'
import { StatusChip } from '../../components/AgentStatus/StatusChip'
import { ActivityBadge } from '../../components/Activity/ActivityBadge'
import { useBackstage } from '../../stores/backstageStore'
import { useProject } from '../../stores/projectStore'
import { useTeam } from '../../stores/teamStore'
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
  /*
   * Who coordinates, read from the project rather than worked out from a name
   * or a job title. It is what decides whether ALL AGENTS is one request to
   * one agent or the same question asked of everybody, so the header cannot
   * describe the mode honestly without it.
   */
  const leadId = useProject((s) => s.project?.godAgentId ?? null)

  const characterName = (agent: AgentConfig) =>
    castNameForSlot(cast, agent.characterSlot)

  /*
   * A group conversation, named as one. The point of the banner here is that
   * the user can never mistake the shared thread for a private session — they
   * hold different messages and are sent to differently, so they must not
   * look alike.
   */
  if (thread) {
    return <ThreadIdentity thread={thread} onLeaveThread={onLeaveThread} />
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
          {/*
            The activity when the session has reported one, the status
            otherwise. A Claude session that has just printed `Bash(npm test)`
            says RUNNING COMMAND here and RUNNING COMMAND over its character's
            head, from the same field — §5 of the Claude brief, which is that
            the terminal and the world must not be two accounts of one session.
          */}
          {sessionWorker.activity ? (
            <ActivityBadge activity={sessionWorker.activity} />
          ) : (
            <StatusChip status={sessionWorker.status} />
          )}
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
     * One request to the team, or the same question asked of everybody.
     *
     * Which of the two it is depends entirely on whether the project has a
     * lead that can work, and the difference is what the user is about to
     * spend — so it is stated here rather than discovered afterwards from the
     * shape of the replies.
     */
    const lead = recipients.find((a) => a.id === leadId)

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
          {lead ? (
            <>
              Goes to {characterName(lead)}, who splits it up, hands the parts
              out, and writes the one answer you read. Everyone else reports
              back to {characterName(lead)} rather than to you.
            </>
          ) : (
            <>
              No team lead is spawned, so each one answers on its own, in its
              own session — {recipients.length} separate{' '}
              {recipients.length === 1 ? 'reply' : 'replies'}, and{' '}
              {recipients.length === 1
                ? 'one model call'
                : `${recipients.length} model calls`}
              . Set a lead on the Account page to have one agent coordinate.
            </>
          )}
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
                  {/*
                    Each teammate's own activity. A whole-team request is the
                    one place several agents are working at once, and "3
                    agents · working" says nothing about which of them is
                    reading and which is running the tests.
                  */}
                  {state?.activity
                    ? shorten(
                        [state.activity.label, state.activity.detail]
                          .filter(Boolean)
                          .join(' ')
                      )
                    : state?.action
                      ? shorten(state.action)
                      : (state?.status ?? 'offline')}
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
        {/*
          §26: "JANE · OPENAI · GPT-5.x / READING FILE / package.json" rather
          than "Thinking…". The badge and the detail line below it come from
          the same activity the pixel character is drawn from, so the header
          and the office cannot say different things about the same agent.
        */}
        {state?.activity ? (
          <ActivityBadge activity={state.activity} detail={false} />
        ) : (
          <StatusChip status={state?.status ?? 'offline'} />
        )}
        {(state?.queued ?? 0) > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
            +{state?.queued} queued
          </span>
        )}
      </div>

      {(state?.activity?.detailFull ?? state?.action) && (
        <p className="mt-0.5 truncate font-ui text-[11px] leading-snug text-ink-3">
          {state?.activity?.detailFull ?? state?.action}
        </p>
      )}
    </div>
  )
}

/**
 * The header of a group conversation.
 *
 * Its own component because it needs state the rest of this file does not — a
 * rename in progress — and because a group has an identity the members' names
 * alone do not carry: a name the user gave it, whether an automation owns it,
 * and how many of its members are working right now.
 *
 * The banner colour and the standing explanation stay: the one thing a user
 * must never do is mistake the shared thread for a private session, because
 * the two hold different messages and are sent to differently.
 */
function ThreadIdentity({
  thread,
  onLeaveThread
}: {
  thread: ThreadInfo
  onLeaveThread: () => void
}) {
  const groups = useTeam((s) => s.groups)
  const renameGroup = useTeam((s) => s.renameGroup)
  const states = useBackstage((s) => s.agentStates)
  const group = groups.find((g) => g.id === thread.id) ?? null

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const title = group?.name ?? thread.names.join(' × ')
  const live = group && (group.working > 0 || group.thinking > 0)

  const commit = () => {
    setEditing(false)
    // An empty name is how the user asks for the generated one back, so it is
    // sent rather than treated as a cancelled edit.
    if (draft.trim() !== title) void renameGroup(thread.id, draft.trim())
  }

  return (
    <div className="shrink-0 border-b-2 border-brand-deep bg-brand-pale px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder={thread.names.join(' × ')}
            className="min-w-0 flex-1 border-2 border-ink bg-cream px-1.5 py-0.5 font-pixel text-[12px] font-bold uppercase tracking-[0.06em] text-ink outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(group?.customName ? title : '')
              setEditing(true)
            }}
            title="Rename this group"
            className="min-w-0 truncate text-left font-pixel text-[12px] font-bold uppercase tracking-[0.08em] text-ink hover:underline"
          >
            {title}
          </button>
        )}

        <button
          type="button"
          onClick={onLeaveThread}
          className="shrink-0 border-2 border-ink bg-cream px-2 py-0.5 font-pixel text-[9px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand"
        >
          Leave group
        </button>
      </div>

      {/* Who is in it, and what they are doing, from the live runtime. */}
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
        {live && (
          <span aria-hidden className="blink mr-1 text-brand-deep">
            ●
          </span>
        )}
        {thread.names.join(' · ')}
        {group && (
          <>
            <span className="mx-1.5 text-rule">·</span>
            {group.working > 0 && <span className="text-ink">{group.working} working </span>}
            {group.thinking > 0 && (
              <span className="text-ink">{group.thinking} thinking </span>
            )}
            {!live && <span>{group.status}</span>}
          </>
        )}
        {group?.automationName && (
          <>
            <span className="mx-1.5 text-rule">·</span>
            <span>automation: {group.automationName}</span>
          </>
        )}
      </p>

      {/*
        Who is doing what, per member.

        §41: the group chat, the pixel world and the activity panel have to be
        three views of one state, never three derivations of it. These read the
        same runtime states the office is drawn from, so "WALTER DELEGATING →
        JESSE / JESSE READING package.json / MIKE WAITING FOR JESSE" is the
        same sentence in both places or it is in neither.

        Only members with something to report. A group of three where one is
        working should show one line, not three.
      */}
      {thread.members.some((id) => states[id]?.activity) && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {thread.members.map((id, i) => {
            const activity = states[id]?.activity
            if (!activity) return null
            return (
              <li key={id} className="flex min-w-0 items-baseline gap-1.5">
                <span className="shrink-0 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink">
                  {thread.names[i] ?? id}
                </span>
                <ActivityBadge activity={activity} className="min-w-0" />
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-0.5 font-ui text-[11px] leading-snug text-ink-3">
        Collaboration thread. Separate from each agent&rsquo;s own conversation
        — nothing said here is part of those.
      </p>
    </div>
  )
}
