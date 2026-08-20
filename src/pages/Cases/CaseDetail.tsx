import { useCallback, useEffect, useState } from 'react'
import { useTeam } from '../../stores/teamStore'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import type { AgentTask, Case, TaskStatus } from '../../shared/providerApi'

interface Props {
  detail: Case
  projectName: string
  nameFor: (agentId: string) => string
  onBack: () => void
  onChanged: (cases: Case[]) => void
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Done',
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
 * One investigation, opened.
 *
 * Everything on this page belongs to this case and nothing else: its tasks,
 * the agents who worked on it, and what each of them came back with. There is
 * no route from here to another case's work, and none to another project's —
 * the task list is fetched by case id and the main process scopes it.
 *
 * Tasks are shown as a tree. A delegation is a child of the task that handed it
 * out, so a request the team lead split three ways reads as one investigation
 * with three branches rather than four things that happened at once.
 */
export function CaseDetail({
  detail,
  projectName,
  nameFor,
  onBack,
  onChanged
}: Props) {
  const retry = useTeam((s) => s.retry)
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [name, setName] = useState(detail.name)

  const refresh = useCallback(async () => {
    if (!window.backstage?.cases) return
    setTasks(await window.backstage.cases.tasks(detail.id))
  }, [detail.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setName(detail.name)
  }, [detail.id, detail.name])

  const commitName = async () => {
    const next = name.trim()
    if (!next || next === detail.name) {
      setName(detail.name)
      return
    }
    onChanged(await window.backstage.cases.rename(detail.id, next))
  }

  /*
   * The tree, by parent id.
   *
   * A task whose parent is not in this case — which cannot normally happen, but
   * would if the parent had aged out of the bounded task log — is treated as a
   * root rather than dropped. Showing work with a missing ancestor is better
   * than silently omitting it from the record of what happened.
   */
  const present = new Set(tasks.map((t) => t.id))
  const roots = tasks.filter((t) => !t.parentTaskId || !present.has(t.parentTaskId))
  const childrenOf = (id: string) => tasks.filter((t) => t.parentTaskId === id)

  return (
    <PagePlaceholder
      title={detail.name}
      lead={`${projectName} · ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
        >
          ‹ All cases
        </button>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setName(detail.name)
          }}
          aria-label="Case name"
          className="min-w-[240px] flex-1 border-2 border-rule bg-paper px-3 py-1.5 font-ui text-sm text-ink outline-none focus:border-ink"
        />

        <button
          type="button"
          onClick={async () =>
            onChanged(
              await window.backstage.cases.setStatus(
                detail.id,
                detail.status === 'open' ? 'closed' : 'open'
              )
            )
          }
          className="border-2 border-ink bg-cream px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
        >
          {detail.status === 'open' ? 'Close case' : 'Reopen'}
        </button>

        <button
          type="button"
          onClick={() => void refresh()}
          className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
        >
          Refresh
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="max-w-[520px] border-[3px] border-dashed border-rule bg-paper/60 p-6">
          <p className="font-ui text-sm text-ink-3">
            This case has no tasks in the current session. Tasks are a record of
            work while the app is open; the case itself is kept.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {roots.map((task) => (
            <TaskNode
              key={task.id}
              task={task}
              depth={0}
              childrenOf={childrenOf}
              nameFor={nameFor}
              onRetry={async (id) => {
                await retry(id)
                await refresh()
              }}
            />
          ))}
        </ul>
      )}
    </PagePlaceholder>
  )
}

function TaskNode({
  task,
  depth,
  childrenOf,
  nameFor,
  onRetry
}: {
  task: AgentTask
  depth: number
  childrenOf: (id: string) => AgentTask[]
  nameFor: (agentId: string) => string
  onRetry: (taskId: string) => void
}) {
  const children = childrenOf(task.id)

  return (
    <li>
      <article
        className="border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
        /* Indent by delegation depth, so the hand-offs are visible as a tree. */
        style={{ marginLeft: depth * 20 }}
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
          <span>
            from{' '}
            {task.origin === 'user'
              ? 'you'
              : task.origin === 'trigger'
                ? 'an automation'
                : task.originAgentId
                  ? nameFor(task.originAgentId)
                  : 'an agent'}
          </span>
        </p>

        <h2 className="mt-1.5 font-ui text-base font-semibold leading-snug text-ink">
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
              onClick={() => onRetry(task.id)}
              className="ml-auto border-2 border-ink bg-cream px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
            >
              Retry
            </button>
          )}
        </div>
      </article>

      {children.length > 0 && (
        <ul className="mt-3 space-y-3">
          {children.map((child) => (
            <TaskNode
              key={child.id}
              task={child}
              depth={depth + 1}
              childrenOf={childrenOf}
              nameFor={nameFor}
              onRetry={onRetry}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
