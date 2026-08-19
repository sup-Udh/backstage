import { useEffect, useRef } from 'react'
import type { Theme } from '../../themes/types'
import type { AgentConfig, ProviderStatus } from '../../shared/providerApi'
import type { AgentView } from '../../world/world.types'
import { useBackstage } from '../../stores/backstageStore'
import { ActivityRail } from '../../workspace/ActivityRail'

interface Props {
  theme: Theme
  agents: AgentView[]
  configs: AgentConfig[]
  statuses: ProviderStatus[]
  onSubmit: (text: string) => void
}

const SUGGESTIONS = [
  'Analyse this project and find the biggest problem.',
  'Find the flakiest test and explain why.',
  'Review the authentication flow.',
  'Draft a plan for the migration.'
]

/**
 * The transcript.
 *
 * One of the command centre's surfaces rather than the whole right-hand side:
 * talking to the team is a thing you do here, alongside reading their files
 * and watching their sessions, not the only thing the panel is for.
 *
 * The task's own state closes the transcript rather than sitting in a banner
 * above it, because chronologically that is where it belongs — the run started
 * after the prompt and finishes after the replies.
 */
export function MessagesPanel({ theme, agents, configs, statuses, onSubmit }: Props) {
  const messages = useBackstage((s) => s.agentMessages[s.chatTarget] || [])
  const task = useBackstage((s) => s.agentTasks[s.chatTarget] || null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, task?.status])

  /*
   * The configured name loses to the character's: this is the user's agent,
   * wearing whichever costume the active world provides.
   */
  const nameFor = (agentId?: string) => {
    const cfg = configs.find((a) => a.id === agentId)
    if (cfg) {
      const cast = theme.characters
      return cast[((cfg.characterSlot % cast.length) + cast.length) % cast.length].name
    }
    return agents.find((v) => v.characterId === agentId)?.name ?? 'Agent'
  }

  const modelFor = (agentId?: string) => {
    const cfg = configs.find((a) => a.id === agentId)
    if (!cfg) return ''
    const provider = statuses.find((p) => p.id === cfg.providerId)
    const model = cfg.modelId ?? provider?.selectedModel
    return [provider?.name, model].filter(Boolean).join(' · ')
  }

  const running = task?.status === 'running'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* While a task runs, what the team is actually doing, in context. */}
      {running && <ActivityRail limit={3} />}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div>
            <h2 className="font-ui text-xl font-extrabold uppercase leading-[1.1] tracking-[-0.02em] text-ink">
              Your team is ready.
            </h2>
            <p className="mt-1.5 font-ui text-[13px] leading-[1.6] text-ink-3">
              Give your team a task and watch them figure it out.
            </p>

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
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((m) =>
              m.kind === 'system' ? (
                <li key={m.id}>
                  <p className="border-2 border-ink bg-brand-pale px-2.5 py-1.5 font-ui text-[12px] leading-[1.5] text-ink">
                    {m.text}
                  </p>
                </li>
              ) : m.kind === 'user' ? (
                <li key={m.id} className="flex justify-end">
                  <p className="max-w-[88%] border-2 border-ink bg-brand px-2.5 py-1.5 font-ui text-[12px] leading-[1.5] text-ink">
                    {m.text}
                  </p>
                </li>
              ) : (
                <li key={m.id}>
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                      {nameFor(m.agentId)}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
                      {modelFor(m.agentId)}
                    </span>
                  </p>
                  <p className="mt-0.5 font-ui text-[12px] leading-[1.65] text-ink-3">
                    {m.text}
                  </p>
                </li>
              )
            )}

            {task?.status === 'complete' && (
              <li className="border-2 border-ink bg-paper p-2.5 shadow-[3px_3px_0_0_var(--color-brand-shadow)]">
                <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-deep">
                  Task complete
                </p>
                <p className="mt-1 font-ui text-[12px] leading-[1.6] text-ink">
                  {task.result}
                </p>
              </li>
            )}

            {task?.status === 'failed' && (
              <li className="border-2 border-ink bg-cream-2 p-2.5">
                <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                  Task failed
                </p>
                <p className="mt-1 font-ui text-[12px] leading-[1.6] text-ink">
                  {task.title}
                </p>
              </li>
            )}
          </ol>
        )}
      </div>
    </div>
  )
}
