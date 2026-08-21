import { useEffect, useMemo, useRef, useState } from 'react'
import type { CharacterDef } from '../../characters/character.types'
import { castNameForSlot } from '../../project/cast'
import {
  ALL_AGENTS,
  transcriptFor,
  useBackstage
} from '../../stores/backstageStore'
import { useTeam, spawnedAgents } from '../../stores/teamStore'
import type { ChatMessage, SessionLine } from '../../shared/providerApi'
import { activityLine, blocksFrom, type ToolBlock as Block } from '../../agents/toolActivity'
import { findWorker, type Worker } from '../../agents/workers'
import { ToolBlock } from './ToolBlock'
import { SessionBlock } from './SessionBlock'
import { TeamRunView } from './TeamRunView'
import { Markdown } from '../../components/Markdown/Markdown'
import { latestTeamRun } from '../../agents/teamRun'
import { useProject } from '../../stores/projectStore'

interface Props {
  /** The project's cast, for naming an agent with no live worker entry. */
  cast: CharacterDef[]
  workers: Worker[]
  onSubmit: (text: string) => void
}

const SUGGESTIONS = [
  'Analyse this project and find the biggest problem.',
  'Review the authentication flow.',
  'Find the flakiest test and explain why.',
  'Draft a plan for the migration.'
]

/**
 * One entry in the rendered conversation.
 *
 * The transcript on disk holds what was *said*; the tool ledger holds what was
 * *done*. Both are real, both belong in the conversation, and neither is
 * stored inside the other — so they are merged here, at render time, by the
 * only thing they genuinely share: when they happened.
 */
type Entry =
  | { kind: 'message'; at: number; key: string; message: ChatMessage }
  | { kind: 'tools'; at: number; key: string; agentId: string; block: Block }
  /** A run of consecutive lines from one CLI session's real output. */
  | {
      kind: 'session'
      at: number
      key: string
      lines: SessionLine[]
      /** Which session printed them, for a group where two are interleaved. */
      who: string
    }

/**
 * The transcript.
 *
 * Every line belongs to an agent. In one-to-one mode this is that agent's own
 * private memory, loaded from disk and unchanged by anything another agent
 * did. In ALL AGENTS mode it is every recipient's lines merged in time order,
 * each attributed — three agents disagreeing is the interesting result, and
 * flattening them into one voice would be inventing a consensus none of them
 * reached.
 */
export function MessagesPanel({ cast, workers, onSubmit }: Props) {
  const target = useBackstage((s) => s.chatTarget)
  const thread = useBackstage((s) => s.thread)
  const threadMessages = useBackstage((s) => s.threadMessages)
  const sessionLines = useBackstage((s) => s.sessionLines)
  const agentMessages = useBackstage((s) => s.agentMessages)
  const agentTools = useBackstage((s) => s.agentTools)
  const streaming = useBackstage((s) => s.streaming)
  const agentStates = useBackstage((s) => s.agentStates)
  const providers = useBackstage((s) => s.providers)
  const agents = useTeam((s) => s.agents)
  const retry = useTeam((s) => s.retry)
  const tasks = useTeam((s) => s.tasks)
  /*
   * Who coordinates, read from the project rather than worked out from a name
   * or a job title. This is the single setting the whole team workflow hangs
   * off, and it is the user's to change.
   */
  const leadId = useProject((s) => s.project?.godAgentId ?? null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const present = spawnedAgents(agents)
  const isBroadcast = target === ALL_AGENTS
  const shown = useMemo(
    () => (isBroadcast ? present.map((a) => a.id) : [target]),
    [isBroadcast, present, target]
  )

  const activeWorker = findWorker(workers, target)
  const session = activeWorker?.kind === 'cli' ? activeWorker : null

  /*
   * The configured name loses to the character's: this is the user's agent,
   * wearing whichever costume the active world provides. The worker list
   * already resolves that, and also knows about CLI sessions, which have no
   * roster entry to look up.
   */
  const nameFor = (agentId?: string) => {
    const worker = findWorker(workers, agentId ?? null)
    if (worker) return worker.name
    const config = agents.find((a) => a.id === agentId)
    if (!config) return 'Agent'
    return castNameForSlot(cast, config.characterSlot)
  }

  const roleFor = (agentId?: string) =>
    agents.find((a) => a.id === agentId)?.role ?? ''

  const modelFor = (agentId?: string) => {
    const config = agents.find((a) => a.id === agentId)
    if (!config) return ''
    const provider = providers.find((p) => p.id === config.providerId)
    const model = config.modelId ?? provider?.selectedModel
    return [provider?.name, model].filter(Boolean).join(' · ')
  }

  /*
   * Which transcript is on screen.
   *
   * Three genuinely different sources, chosen here rather than merged: a
   * group's shared thread, a CLI session's reconstructed output, or the
   * agents' own private memory. They are never combined — that separation is
   * the guarantee that a private conversation cannot leak into a group one.
   */
  const messages = useMemo(() => {
    if (thread) return threadMessages[thread.id] ?? []
    if (session) return []
    return transcriptFor({ agentMessages }, target, present.map((a) => a.id))
  }, [thread, threadMessages, session, agentMessages, target, present])

  /*
   * Messages and tool blocks, interleaved by time.
   *
   * A stable sort matters here: a tool call and the sentence that follows it
   * routinely land in the same millisecond, and an unstable order would let
   * an agent's conclusion jump above the work that produced it between one
   * render and the next.
   */
  const entries = useMemo<Entry[]>(() => {
    /*
     * A group of CLI sessions has no stored conversation — it is two real
     * processes, and what they "said" is what they printed. So the thread is
     * their transcripts merged in time order and attributed, which is an
     * honest account of the exchange rather than a synthesised dialogue.
     */
    const sessionGroup = thread?.id.startsWith('session-thread:') ? thread : null
    if (sessionGroup) {
      const merged = sessionGroup.members.flatMap((memberId, i) =>
        (sessionLines[memberId] ?? []).map((line) => ({
          line,
          who: sessionGroup.names[i] ?? memberId
        }))
      )
      merged.sort((a, b) => a.line.at - b.line.at)

      const list: Entry[] = []
      for (const { line, who } of merged) {
        const last = list[list.length - 1]
        if (
          line.kind === 'output' &&
          last?.kind === 'session' &&
          last.who === who &&
          last.lines[0].kind === 'output'
        ) {
          last.lines.push(line)
          continue
        }
        list.push({ kind: 'session', at: line.at, key: line.id, lines: [line], who })
      }
      return list
    }

    /*
     * A single CLI session's transcript is reconstructed output, not
     * messages, and has no tool ledger behind it — the process runs its own
     * tools and does not report them to Backstage. Consecutive output lines
     * are gathered into one block so a hundred lines of build output is one
     * thing to scroll past rather than a hundred.
     */
    if (session?.sessionId) {
      const lines = sessionLines[session.sessionId] ?? []
      const list: Entry[] = []
      for (const line of lines) {
        const last = list[list.length - 1]
        if (
          line.kind === 'output' &&
          last?.kind === 'session' &&
          last.lines[0].kind === 'output'
        ) {
          last.lines.push(line)
          continue
        }
        list.push({
          kind: 'session',
          at: line.at,
          key: line.id,
          lines: [line],
          who: session.name
        })
      }
      return list
    }

    const list: Entry[] = messages.map((m) => ({
      kind: 'message',
      at: m.at,
      key: m.id,
      message: m
    }))

    /*
     * Tool blocks belong to an agent's own conversation. A group thread shows
     * what the members said to each other, not every file each of them read
     * getting there — that detail belongs in their individual sessions.
     */
    if (!thread) {
      for (const agentId of shown) {
        for (const block of blocksFrom(agentTools[agentId] ?? [])) {
          list.push({
            kind: 'tools',
            at: block.at,
            key: `${agentId}:${block.id}`,
            agentId,
            block
          })
        }
      }
    }

    return list
      .map((entry, i) => ({ entry, i }))
      .sort((a, b) => a.entry.at - b.entry.at || a.i - b.i)
      .map(({ entry }) => entry)
  }, [messages, agentTools, shown, session, sessionLines, thread])

  /*
   * Stay pinned to the newest line, but only when the user is already there.
   * Yanking the view down while somebody is reading back through a long
   * investigation is worse than letting new output arrive off-screen.
   */
  const pinned = useRef(true)
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  // Follows the stream as well as new entries, so a long answer being typed
  // out keeps its last line in view rather than growing off the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [entries.length, streaming, target])

  // A new conversation always starts at the bottom.
  useEffect(() => {
    pinned.current = true
  }, [target])

  /** The most recent failed task for an agent, so a retry has something to aim at. */
  const failedTaskFor = (agentId: string) =>
    tasks.find((t) => t.agentId === agentId && t.status === 'failed')

  /** Whoever is mid-execution right now, and what they are actually doing. */
  const working = shown
    .map((id) => ({ id, state: agentStates[id] }))
    .filter((a) => a.state?.executionId)

  /*
   * The team's own account of a whole-team request.
   *
   * Reconstructed from the task ledger rather than from the messages, so it
   * describes what the runtime actually did — who was given what, what came
   * back, which answer was the final one — instead of the order things
   * happened to be said in. Null when the last thing that ran was not a team
   * request, in which case the merged transcript below is the whole story.
   */
  const teamRun = useMemo(
    () =>
      isBroadcast
        ? latestTeamRun({
            tasks,
            agents,
            states: agentStates,
            messages: agentMessages,
            leadId,
            nameOf: nameFor,
            modelOf: modelFor
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBroadcast, tasks, agents, agentStates, agentMessages, leadId, cast, workers]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {/*
          ALL AGENTS is not a broadcast: it goes to the project's team lead,
          who splits the work up and writes the final answer. So it does not
          get the same renderer as a one-to-one conversation — the same
          components, but arranged by what the team did rather than by when
          each line was said. The full merged transcript is still underneath.
        */}
        {teamRun && (
          <div className="mb-3">
            <TeamRunView run={teamRun} streaming={streaming} />
          </div>
        )}

        {entries.length === 0 ? (
          teamRun ? null : (
            <Empty
              present={present.length}
              onSubmit={onSubmit}
            />
          )
        ) : (
          <Transcript count={entries.length} folded={teamRun !== null}>
          <ol className="flex flex-col gap-3">
            {entries.map((entry) => {
              if (entry.kind === 'session') {
                return (
                  <li key={entry.key}>
                    <SessionBlock lines={entry.lines} name={entry.who} />
                  </li>
                )
              }

              if (entry.kind === 'tools') {
                return (
                  <li key={entry.key}>
                    {isBroadcast && (
                      <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
                        {nameFor(entry.agentId)}
                      </p>
                    )}
                    <ToolBlock block={entry.block} />
                  </li>
                )
              }

              const message = entry.message

              /* The user's own line: right-aligned, brand plate, no header. */
              if (message.kind === 'user') {
                return (
                  <li key={entry.key} className="flex justify-end">
                    <p className="max-w-[85%] border-2 border-ink bg-brand px-2.5 py-1.5 font-ui text-[12px] leading-[1.5] text-ink">
                      {message.text}
                    </p>
                  </li>
                )
              }

              if (message.kind === 'system') {
                const failed = failedTaskFor(message.agentId)
                return (
                  <li key={entry.key}>
                    <div className="border-2 border-rust bg-paper px-2.5 py-1.5">
                      <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-rust">
                        {isBroadcast ? `${nameFor(message.agentId)} — ` : ''}Failed
                      </p>
                      <p className="mt-0.5 font-ui text-[12px] leading-[1.5] text-ink">
                        {message.text}
                      </p>
                      {failed && (
                        <button
                          type="button"
                          onClick={() => void retry(failed.id)}
                          className="mt-1.5 border-2 border-ink bg-cream px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </li>
                )
              }

              /*
               * A message from another agent. Kept visually distinct from the
               * user's conversation, because it is: it is team activity this
               * agent was told about, not something the user said.
               */
              if (message.kind === 'collaboration') {
                return (
                  <li key={entry.key}>
                    <div className="border-l-2 border-brand-deep bg-brand-pale/40 py-1 pl-2.5">
                      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-brand-deep">
                        {message.fromName ?? 'A teammate'} →{' '}
                        {nameFor(message.agentId)}
                      </p>
                      <p className="mt-0.5 font-ui text-[12px] leading-[1.5] text-ink-3">
                        {message.text}
                      </p>
                    </div>
                  </li>
                )
              }

              /*
               * The agent's own answer. A two-line header identifies who is
               * speaking and what is behind them, then gets out of the way —
               * the response is the thing worth reading, so it carries the
               * larger type and the header is set small and quiet.
               */
              return (
                <li key={entry.key}>
                  <p className="flex flex-wrap items-baseline gap-x-1.5 leading-none">
                    <span className="font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                      {nameFor(message.agentId)}
                    </span>
                    {roleFor(message.agentId) && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
                        · {roleFor(message.agentId)}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
                    {modelFor(message.agentId)}
                  </p>
                  {/*
                    The answer as the document it is. It arrives as Markdown —
                    every model writes it whether asked to or not — and was
                    previously rendered as preformatted text, so headings,
                    lists and code blocks showed up as literal hashes, dashes
                    and backticks in one grey rectangle.
                  */}
                  <div className="mt-1.5">
                    <Markdown text={message.text} />
                  </div>
                </li>
              )
            })}
          </ol>
          </Transcript>
        )}

        {/*
          The live foot of the transcript: what each busy agent is saying as
          it says it, and what it is doing when it is not saying anything.

          The streamed text is rendered in exactly the same type as a finished
          answer, so the response does not visibly reflow when the real
          message replaces it — only the caret disappears.
        */}
        {working.length > 0 && !teamRun && (
          <ul className="mt-3 flex flex-col gap-3">
            {working.map(({ id, state }) => {
              const partial = streaming[id]
              return (
                <li key={id}>
                  {partial ? (
                    <>
                      <p className="flex flex-wrap items-baseline gap-x-1.5 leading-none">
                        <span className="font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                          {nameFor(id)}
                        </span>
                        {roleFor(id) && (
                          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
                            · {roleFor(id)}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
                        {modelFor(id)}
                      </p>
                      {/*
                        Rendered exactly as a finished answer is, so the
                        response does not visibly reflow when the real message
                        replaces it — only the caret disappears. Markdown
                        renders incrementally: a half-written fence is shown as
                        the code block it is turning into.
                      */}
                      <div className="mt-1.5">
                        <Markdown text={partial} />
                        <span
                          aria-hidden
                          className="blink ml-0.5 inline-block align-baseline text-brand-deep"
                        >
                          ▌
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="blink font-mono text-[10px] text-brand-deep"
                      >
                        ✦
                      </span>
                      <span className="font-ui text-[11.5px] italic leading-snug text-ink-3">
                        {activityLine(nameFor(id), state?.action ?? null)}
                      </span>
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * The raw merged transcript, folded away when there is a better account above.
 *
 * Nothing is ever removed from the conversation — every message and every tool
 * call is still here, in time order, attributed. But once the team view has
 * explained the run, this is the third thing in the reading order rather than
 * the only thing, so it starts closed. On a one-to-one conversation there is
 * nothing above it and it is simply the conversation, so it is not folded at
 * all and renders without a wrapper.
 */
function Transcript({
  count,
  folded,
  children
}: {
  count: number
  folded: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (!folded) return <>{children}</>

  return (
    <section className="border-2 border-rule bg-paper">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-1 text-left transition-colors hover:bg-brand-pale"
      >
        <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
          Full transcript
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-3">
          {count}
        </span>
        <span aria-hidden className="font-mono text-[10px] text-ink-3">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="border-t-2 border-rule px-2 py-2">{children}</div>}
    </section>
  )
}

/** The empty state, split out so the transcript body stays readable. */
function Empty({
  present,
  onSubmit
}: {
  present: number
  onSubmit: (text: string) => void
}) {
  return (
    <div>
      <h2 className="font-ui text-xl font-extrabold uppercase leading-[1.1] tracking-[-0.02em] text-ink">
        {present === 0 ? 'The office is empty.' : 'Your team is ready.'}
      </h2>
      <p className="mt-1.5 font-ui text-[13px] leading-[1.6] text-ink-3">
        {present === 0
          ? 'Spawn an agent and they walk into the world, ready for work.'
          : 'Give an agent a task and watch them figure it out. You can talk to someone else while they work.'}
      </p>

      {present === 0 && (
        <button
          type="button"
          onClick={() => useBackstage.getState().setPage('agents')}
          className="mt-3 border-[3px] border-ink bg-brand px-4 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-y-px hover:bg-brand-lite"
        >
          Open Agents
        </button>
      )}

      {present > 0 && (
        <>
          <p className="mt-4 font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            Try
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onSubmit(s)}
                  className="w-full border-2 border-rule bg-paper px-2.5 py-1.5 text-left font-ui text-[12px] leading-snug text-ink-3 transition-colors hover:border-ink hover:bg-brand-pale hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
