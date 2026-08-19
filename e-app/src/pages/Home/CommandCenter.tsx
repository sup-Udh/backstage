import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { teamRuntime } from '../../agents/team'
import { useBackstage } from '../../stores/backstageStore'
import { STATUS_GLYPH } from '../../characters/character.states'
import type { AgentStatus } from '../../agents/agent.types'
import { ActivityFeed } from './ActivityFeed'
import { PromptBox } from './PromptBox'

interface Props {
  theme: Theme
  engine: WorldEngine
}

const SUGGESTIONS = [
  'Analyse this project and find the biggest problem.',
  'Find the flakiest test and explain why.',
  'Review the authentication flow.',
  'Draft a plan for the migration.'
]

const ACTIVE: AgentStatus[] = ['working', 'thinking', 'talking', 'success']

/** The four buckets the header reports on. */
function bucket(status: AgentStatus): 'working' | 'thinking' | 'talking' | 'idle' {
  if (status === 'working' || status === 'success') return 'working'
  if (status === 'thinking') return 'thinking'
  if (status === 'talking') return 'talking'
  return 'idle'
}

/**
 * The right half: where the user talks to the team.
 *
 * It renders from the store and the engine's published views, never from the
 * world's per-frame state, so a busy office does not re-render the panel.
 */
export function CommandCenter({ theme, engine }: Props) {
  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)
  const messages = useBackstage((s) => s.messages)
  const activity = useBackstage((s) => s.activity)
  const task = useBackstage((s) => s.task)
  const pushUserMessage = useBackstage((s) => s.pushUserMessage)

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, task?.status])

  const counts = agents.reduce<Record<string, number>>((acc, a) => {
    const k = bucket(a.status)
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

  const busy = task?.status === 'running'

  const submit = (text: string) => {
    pushUserMessage(text)
    teamRuntime.submitTask(text)
  }

  const nameFor = (agentId?: string) =>
    theme.characters.find((c) => c.agentId === agentId)?.name ?? 'Agent'

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col border-l-[3px] border-ink bg-cream">
      {/* Header: who is on the team, and what they are doing. */}
      <header className="shrink-0 border-b-[3px] border-ink px-5 py-4">
        <h1 className="font-pixel text-lg font-bold uppercase tracking-[0.04em] text-ink">
          Your Team
        </h1>

        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em]">
          <li className="text-ink-3">
            <span className="text-ink">{agents.length}</span> agents
          </li>
          {(['working', 'thinking', 'talking', 'idle'] as const).map((k) => {
            const n = counts[k] ?? 0
            const on = n > 0
            return (
              <li key={k} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={on ? 'text-brand-deep' : 'text-ink-3'}
                >
                  {STATUS_GLYPH[k === 'idle' ? 'idle' : k]}
                </span>
                <span className={on ? 'text-ink' : 'text-ink-3'}>{n}</span>
                <span className="text-ink-3">{k}</span>
              </li>
            )
          })}
        </ul>
      </header>

      {/* Current case. */}
      {task && (
        <div
          className={`shrink-0 border-b-[3px] border-ink px-5 py-3 ${
            busy ? 'bg-brand-pale' : 'bg-paper'
          }`}
        >
          <p className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
            <span
              aria-hidden
              className={busy ? 'blink text-brand-deep' : 'text-brand-deep'}
            >
              {busy ? STATUS_GLYPH.working : STATUS_GLYPH.success}
            </span>
            {busy ? 'Task running' : 'Task complete'}
          </p>
          <p className="mt-1 font-ui text-sm font-semibold leading-snug text-ink">
            {task.title}
          </p>
        </div>
      )}

      {/* Transcript. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div>
            <h2 className="font-ui text-2xl font-extrabold uppercase leading-[1.05] tracking-[-0.03em] text-ink">
              Your team is ready.
            </h2>
            <p className="mt-2 font-ui text-sm leading-[1.6] text-ink-3">
              Give your team a task and watch them figure it out.
            </p>

            <p className="mt-6 font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              Try
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => submit(s)}
                    className="w-full border-2 border-rule bg-paper px-3 py-2 text-left font-ui text-[13px] leading-snug text-ink-3 transition-colors hover:border-ink hover:bg-brand-pale hover:text-ink"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {messages.map((m) =>
              m.kind === 'user' ? (
                <li key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] border-2 border-ink bg-brand px-3 py-2 font-ui text-[13px] leading-[1.5] text-ink">
                    {m.text}
                  </p>
                </li>
              ) : (
                <li key={m.id}>
                  <p className="font-pixel text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                    {nameFor(m.agentId)}
                  </p>
                  <p className="mt-1 font-ui text-[13px] leading-[1.6] text-ink-3">
                    {m.text}
                  </p>
                </li>
              )
            )}

            {task?.status === 'complete' && (
              <li className="border-[3px] border-ink bg-paper p-3 shadow-[3px_3px_0_0_var(--color-brand-shadow)]">
                <p className="font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-deep">
                  Investigation complete
                </p>
                <p className="mt-1.5 font-ui text-[13px] leading-[1.6] text-ink">
                  {task.result}
                </p>
              </li>
            )}
          </ol>
        )}
      </div>

      <ActivityFeed activity={activity} theme={theme} />

      <div className="shrink-0 border-t-[3px] border-ink p-4">
        <PromptBox
          onSubmit={submit}
          disabled={busy}
          placeholder={busy ? 'Your team is working…' : 'Ask your team…'}
        />
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
          {agents.filter((a) => ACTIVE.includes(a.status)).length} of{' '}
          {agents.length} active · simulated
        </p>
      </div>
    </section>
  )
}
