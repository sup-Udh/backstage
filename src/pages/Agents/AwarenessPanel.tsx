import { useCallback, useEffect, useState } from 'react'
import type { AwarenessSnapshot } from '../../shared/providerApi'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import { StatusChip } from '../../components/AgentStatus/StatusChip'

/**
 * What the agents can see about each other.
 *
 * This is the shared-awareness layer made visible. Agents are told what the
 * team is doing through structured state — who is here, what is running, what
 * git says, who has messaged whom — and never by being handed another agent's
 * private conversation. Showing exactly that here is what makes the
 * orchestration debuggable: if an agent behaved as though it did not know
 * something, this is where to check whether it could have.
 */
export function AwarenessPanel() {
  const [snapshot, setSnapshot] = useState<AwarenessSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const agents = useTeam((s) => s.agents)
  const collaboration = useBackstage((s) => s.collaboration)

  const load = useCallback(async () => {
    if (!window.backstage?.agents) return
    setLoading(true)
    try {
      setSnapshot(await window.backstage.agents.awareness())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const nameFor = (id: string) =>
    agents.find((a) => a.id === id)?.name ?? id

  const running = snapshot?.tasks.filter((t) => t.status === 'running') ?? []
  const present = snapshot?.agents.filter((a) => a.spawned) ?? []
  const messages = collaboration.slice(-6)

  return (
    <div className="border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]">
      <header className="flex items-center justify-between gap-3 border-b-[3px] border-ink px-4 py-2">
        <h3 className="font-pixel text-sm font-bold uppercase tracking-[0.06em] text-ink">
          Awareness
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="border-2 border-rule px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink disabled:opacity-45"
        >
          {loading ? 'Reading…' : 'Refresh'}
        </button>
      </header>

      <dl className="grid gap-x-4 gap-y-2.5 px-4 py-3 sm:grid-cols-2">
        <div>
          <dt className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            Workspace
          </dt>
          <dd
            className="mt-0.5 truncate font-mono text-[11px] text-ink"
            title={snapshot?.workspace.root ?? undefined}
          >
            {snapshot?.workspace.name ?? 'none open'}
          </dd>
        </div>

        <div>
          <dt className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            Git
          </dt>
          <dd className="mt-0.5 font-mono text-[11px] text-ink">
            {snapshot?.git.branch
              ? `${snapshot.git.branch} · ${snapshot.git.dirty} changed`
              : 'not a repository'}
          </dd>
        </div>

        <div>
          <dt className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            In the office
          </dt>
          <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {present.length === 0 ? (
              <span className="font-ui text-[12px] text-ink-3">nobody yet</span>
            ) : (
              present.map((state) => (
                <span key={state.agentId} className="flex items-center gap-1.5">
                  <span className="font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                    {nameFor(state.agentId)}
                  </span>
                  <StatusChip status={state.status} />
                </span>
              ))
            )}
          </dd>
        </div>

        <div>
          <dt className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            Running now
          </dt>
          <dd className="mt-1">
            {running.length === 0 ? (
              <span className="font-ui text-[12px] text-ink-3">nothing</span>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {running.map((task) => (
                  <li key={task.id} className="truncate font-ui text-[12px] text-ink-3">
                    <span className="font-semibold text-ink">
                      {nameFor(task.agentId)}
                    </span>{' '}
                    {task.title}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>

      {/* Agent-to-agent traffic: shared activity, never private memory. */}
      <div className="border-t-2 border-rule px-4 py-3">
        <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          Collaboration
        </p>
        {messages.length === 0 ? (
          <p className="mt-1 font-ui text-[12px] text-ink-3">
            No agent has contacted another yet.
          </p>
        ) : (
          <ol className="mt-1.5 flex flex-col gap-1.5">
            {messages.map((message) => (
              <li key={message.id}>
                <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-brand-deep">
                  {message.senderName} → {message.receiverName}
                  <span className="ml-2 text-ink-3">
                    {new Date(message.at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-2 font-ui text-[12px] leading-snug text-ink-3">
                  {message.message}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
