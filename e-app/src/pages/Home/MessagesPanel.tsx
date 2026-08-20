import { useEffect, useMemo, useRef } from 'react'
import type { Theme } from '../../themes/types'
import {
  ALL_AGENTS,
  transcriptFor,
  useBackstage
} from '../../stores/backstageStore'
import { useTeam, spawnedAgents } from '../../stores/teamStore'
import { ActivityRail } from '../../workspace/ActivityRail'

interface Props {
  theme: Theme
  onSubmit: (text: string) => void
}

const SUGGESTIONS = [
  'Analyse this project and find the biggest problem.',
  'Review the authentication flow.',
  'Find the flakiest test and explain why.',
  'Draft a plan for the migration.'
]

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
export function MessagesPanel({ theme, onSubmit }: Props) {
  const target = useBackstage((s) => s.chatTarget)
  const agentMessages = useBackstage((s) => s.agentMessages)
  const agentStates = useBackstage((s) => s.agentStates)
  const providers = useBackstage((s) => s.providers)
  const agents = useTeam((s) => s.agents)
  const retry = useTeam((s) => s.retry)
  const tasks = useTeam((s) => s.tasks)

  const scrollRef = useRef<HTMLDivElement>(null)

  const present = spawnedAgents(agents)
  const isBroadcast = target === ALL_AGENTS

  const messages = useMemo(
    () =>
      transcriptFor(
        { agentMessages },
        target,
        present.map((a) => a.id)
      ),
    [agentMessages, target, present]
  )

  const anyRunning = present.some(
    (a) => agentStates[a.id]?.executionId !== null && agentStates[a.id] !== undefined
  )

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, target])

  /*
   * The configured name loses to the character's: this is the user's agent,
   * wearing whichever costume the active world provides.
   */
  const nameFor = (agentId?: string) => {
    const config = agents.find((a) => a.id === agentId)
    if (!config) return 'Agent'
    const cast = theme.characters
    return cast[((config.characterSlot % cast.length) + cast.length) % cast.length].name
  }

  const modelFor = (agentId?: string) => {
    const config = agents.find((a) => a.id === agentId)
    if (!config) return ''
    const provider = providers.find((p) => p.id === config.providerId)
    const model = config.modelId ?? provider?.selectedModel
    return [provider?.name, model].filter(Boolean).join(' · ')
  }

  /** The most recent failed task for an agent, so a retry has something to aim at. */
  const failedTaskFor = (agentId: string) =>
    tasks.find((t) => t.agentId === agentId && t.status === 'failed')

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* While anything is running, what the team is actually doing. */}
      {anyRunning && <ActivityRail limit={3} />}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div>
            <h2 className="font-ui text-xl font-extrabold uppercase leading-[1.1] tracking-[-0.02em] text-ink">
              {present.length === 0 ? 'The office is empty.' : 'Your team is ready.'}
            </h2>
            <p className="mt-1.5 font-ui text-[13px] leading-[1.6] text-ink-3">
              {present.length === 0
                ? 'Spawn an agent on the Agents page and they will appear in the world.'
                : 'Give an agent a task and watch them figure it out. You can talk to someone else while they work.'}
            </p>

            {present.length > 0 && (
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
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((message) => {
              if (message.kind === 'user') {
                return (
                  <li key={message.id} className="flex justify-end">
                    <p className="max-w-[88%] border-2 border-ink bg-brand px-2.5 py-1.5 font-ui text-[12px] leading-[1.5] text-ink">
                      {message.text}
                    </p>
                  </li>
                )
              }

              if (message.kind === 'system') {
                const failed = failedTaskFor(message.agentId)
                return (
                  <li key={message.id}>
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
                  <li key={message.id}>
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

              return (
                <li key={message.id}>
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                      {nameFor(message.agentId)}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
                      {modelFor(message.agentId)}
                    </span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap font-ui text-[12px] leading-[1.65] text-ink-3">
                    {message.text}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
