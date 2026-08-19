import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { teamRuntime } from '../../agents/team'
import { useBackstage } from '../../stores/backstageStore'
import { STATUS_GLYPH } from '../../characters/character.states'
import type { AgentStatus } from '../../agents/agent.types'
import { ActivityFeed } from './ActivityFeed'
import { PromptBox } from './PromptBox'
import { useProviders } from '../../providers/useProviders'
import { useAgentConfigs } from '../../agents/useAgentConfigs'
import { useRuntimeEvents } from '../../agents/useRuntimeEvents'
import type { GenerationTurn } from '../../shared/providerApi'

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
  const pushSystemMessage = useBackstage((s) => s.pushSystemMessage)
  const mode = useBackstage((s) => s.mode)
  const setPage = useBackstage((s) => s.setPage)
  const { statuses, workspace, anyConnected } = useProviders()
  const { agents: configs } = useAgentConfigs()
  const target = useBackstage((s) => s.chatTarget)
  const setTarget = useBackstage((s) => s.setChatTarget)

  // Runtime events drive both the world and this panel.
  useRuntimeEvents()

  const connected = anyConnected
  const live = mode === 'real'
  const activeProvider = statuses.find((p) => p.connected)

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

  const modelFor = (agentId?: string) => {
    const cfg = configs.find((a) => a.id === agentId)
    if (!cfg) return ''
    const provider = statuses.find((p) => p.id === cfg.providerId)
    const model = cfg.modelId ?? provider?.selectedModel
    return [provider?.name, model].filter(Boolean).join(' · ')
  }

  const busy = task?.status === 'running'
  const failed = task?.status === 'failed'

  const submit = (text: string) => {
    pushUserMessage(text)

    if (!live) {
      teamRuntime.submitTask(text)
      return
    }

    if (!connected) {
      // Never make a network call we know will fail.
      pushSystemMessage(
        'No AI provider is connected. Connect one in Account to start working.'
      )
      return
    }

    /*
     * Prior turns for continuity. The transcript is the source of truth here;
     * the main process trims it again before it goes out, so a long session
     * cannot quietly grow the request.
     */
    const history: GenerationTurn[] = messages
      .filter((m) => m.kind === 'user' || m.kind === 'agent')
      .slice(-12)
      .map((m) => ({
        role: m.kind === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text
      }))

    /*
     * Fire and forget: the task runs in the main process and reports back as
     * events, which is what lets the world animate while it works rather than
     * freezing until a promise resolves.
     */
    void window.backstage.agents.run({ prompt: text, history, target }).then((ack) => {
      if (!ack.accepted) {
        pushSystemMessage(ack.error ?? 'Could not start that task.')
      }
    })
  }

  /*
   * The configured name wins over the character's own: this is the user's
   * agent, wearing whichever costume the active world provides.
   */
  const nameFor = (agentId?: string) => {
    const cfg = configs.find((a) => a.id === agentId)
    if (cfg) {
      const cast = theme.characters
      return cast[((cfg.characterSlot % cast.length) + cast.length) % cast.length].name
    }
    return agents.find((v) => v.characterId === agentId)?.name ?? 'Agent'
  }

  const targetName = target === 'all' ? 'The team' : nameFor(target)

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
        {/* Who the user is talking to. The runtime routes to that agent's
            provider, model, instructions and tools. */}
        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor="chat-target"
            className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3"
          >
            Talk to
          </label>
          <select
            id="chat-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="min-w-0 flex-1 border-2 border-ink bg-paper px-2 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink outline-none focus:border-brand-deep"
          >
            {/*
              Named for the active world's cast. The agent underneath is the
              same configuration; only who plays it changes with the theme.
            */}
            {configs
              .filter((a) => a.enabled)
              .map((a) => {
                const cast = theme.characters
                const character =
                  cast[((a.characterSlot % cast.length) + cast.length) % cast.length]
                return (
                  <option key={a.id} value={a.id}>
                    {character.name} — {a.role}
                  </option>
                )
              })}
            <option value="all">All agents</option>
          </select>
        </div>
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
              {busy
                ? STATUS_GLYPH.working
                : failed
                  ? STATUS_GLYPH.error
                  : STATUS_GLYPH.success}
            </span>
            {busy ? 'Task running' : failed ? 'Task failed' : 'Task complete'}
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
              m.kind === 'system' ? (
                <li key={m.id}>
                  <p className="border-2 border-ink bg-brand-pale px-3 py-2 font-ui text-[13px] leading-[1.5] text-ink">
                    {m.text}
                  </p>
                </li>
              ) : m.kind === 'user' ? (
                <li key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] border-2 border-ink bg-brand px-3 py-2 font-ui text-[13px] leading-[1.5] text-ink">
                    {m.text}
                  </p>
                </li>
              ) : (
                <li key={m.id}>
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-pixel text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                      {nameFor(m.agentId)}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                      {modelFor(m.agentId)}
                    </span>
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
        {live && (!connected || !workspace?.root) && (
          <div className="mb-3 border-[3px] border-ink bg-brand-pale px-3 py-2.5">
            <p className="font-pixel text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
              {!connected ? 'No provider connected' : 'No project open'}
            </p>
            <p className="mt-1 font-ui text-xs leading-snug text-ink-3">
              {!connected
                ? 'Connect a provider in Account to start working.'
                : 'Agents can inspect your code once you open a project folder.'}
            </p>
            <button
              type="button"
              onClick={() => setPage('account')}
              className="mt-2 border-2 border-ink bg-brand px-2.5 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-y-px"
            >
              {!connected ? 'Open Account' : 'Open a folder'}
            </button>
          </div>
        )}

        <PromptBox
          onSubmit={submit}
          disabled={busy}
          placeholder={
            busy
              ? `${targetName} is working…`
              : target === 'all'
                ? 'Ask your team…'
                : `Ask ${targetName}…`
          }
        />
        <p className="mt-2 flex flex-wrap items-center gap-x-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
          <span>
            {agents.filter((a) => ACTIVE.includes(a.status)).length} of{' '}
            {agents.length} active
          </span>
          <span aria-hidden>·</span>
          <span className={live && connected ? 'text-brand-deep' : undefined}>
            {live
              ? connected
                ? activeProvider?.selectedModel ?? activeProvider?.name ?? 'connected'
                : 'not connected'
              : 'simulated'}
          </span>
          {live && (
            <>
              <span aria-hidden>·</span>
              <span title={workspace?.root ?? undefined}>
                {workspace?.root ? workspace.name : 'no workspace'}
              </span>
            </>
          )}
        </p>
      </div>
    </section>
  )
}
