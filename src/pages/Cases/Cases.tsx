import { useEffect } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import { useProjectCast } from '../../stores/projectStore'
import { castNameForSlot } from '../../project/cast'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import type { AgentTask, TaskStatus } from '../../shared/providerApi'

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: 'Queued',
  running: 'Open',
  completed: 'Closed',
  failed: 'Failed',
  cancelled: 'Stopped'
}

const STATUS_GLYPH: Record<TaskStatus, string> = {
  queued: '◔',
  running: '✦',
  completed: '◆',
  failed: '✕',
  cancelled: '○'
}

/**
 * Every task the team has taken on.
 *
 * A case belongs to exactly one agent, because a task does. A request sent to
 * three agents is three cases sharing an origin — showing it as one would hide
 * that they were three separate investigations with three separate answers,
 * which is the thing worth reading.
 */
export function Cases() {
  const setPage = useBackstage((s) => s.setPage)
  const cast = useProjectCast()
  const agents = useTeam((s) => s.agents)
  const tasks = useTeam((s) => s.tasks)
  const refreshTasks = useTeam((s) => s.refreshTasks)
  const retry = useTeam((s) => s.retry)

  useEffect(() => {
    void refreshTasks()
  }, [refreshTasks])

  const nameFor = (agentId: string) => {
    const config = agents.find((a) => a.id === agentId)
    if (!config) return agentId
    return castNameForSlot(cast, config.characterSlot)
  }

  const originOf = (task: AgentTask) => {
    if (task.origin === 'user') return 'You'
    if (task.origin === 'trigger') return 'Automation'
    return task.originAgentId ? nameFor(task.originAgentId) : 'An agent'
  }

  return (
    <PagePlaceholder
      title="Cases"
      lead="Every task your team takes on becomes a case you can reopen. One case per agent, with who asked for it and what came back."
    >
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void refreshTasks()}
          className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
        >
          Refresh
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          <span className="text-ink">{tasks.length}</span> in this session
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="max-w-[520px] border-[3px] border-dashed border-rule bg-paper/60 p-6">
          <p className="font-ui text-sm text-ink-3">
            No cases yet. Create your first task from Home.
          </p>
          <button
            type="button"
            onClick={() => setPage('home')}
            className="mt-4 border-2 border-ink bg-brand px-3 py-1.5 font-pixel text-xs font-semibold uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px"
          >
            Go to Home
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
            >
              <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
                <span
                  aria-hidden
                  className={
                    task.status === 'failed'
                      ? 'text-rust'
                      : task.status === 'running'
                        ? 'blink text-brand-deep'
                        : 'text-brand-deep'
                  }
                >
                  {STATUS_GLYPH[task.status]}
                </span>
                <span className="text-ink">{nameFor(task.agentId)}</span>
                <span className="text-rule">·</span>
                <span>{STATUS_LABEL[task.status]}</span>
                <span className="text-rule">·</span>
                <span>from {originOf(task)}</span>
                {task.depth > 0 && (
                  <>
                    <span className="text-rule">·</span>
                    <span>depth {task.depth}</span>
                  </>
                )}
              </p>

              <h2 className="mt-1.5 font-ui text-lg font-semibold leading-snug text-ink">
                {task.title}
              </h2>

              {task.result && (
                <p className="mt-2 line-clamp-6 whitespace-pre-wrap font-ui text-[13px] leading-[1.6] text-ink-3">
                  {task.result}
                </p>
              )}

              {task.error && (
                <p className="mt-2 border-l-2 border-rust pl-2 font-ui text-[13px] leading-[1.6] text-ink-3">
                  {task.error}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  {new Date(task.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                  {task.endedAt && task.startedAt && (
                    <>
                      <span className="mx-1.5 text-rule">·</span>
                      {Math.max(1, Math.round((task.endedAt - task.startedAt) / 1000))}s
                    </>
                  )}
                </span>

                {(task.status === 'failed' || task.status === 'cancelled') && (
                  <button
                    type="button"
                    onClick={() => void retry(task.id).then(() => refreshTasks())}
                    className="ml-auto border-2 border-ink bg-cream px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
                  >
                    Retry
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PagePlaceholder>
  )
}
