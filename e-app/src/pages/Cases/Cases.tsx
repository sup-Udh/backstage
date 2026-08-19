import { useBackstage } from '../../stores/backstageStore'
import { PagePlaceholder } from '../shell/PagePlaceholder'

export function Cases() {
  const task = useBackstage((s) => s.task)
  const setPage = useBackstage((s) => s.setPage)

  return (
    <PagePlaceholder
      title="Cases"
      lead="Every task your team takes on becomes a case you can reopen."
    >
      {task ? (
        <article className="max-w-[520px] border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
            Case 001 · {task.status === 'running' ? 'Open' : 'Closed'}
          </p>
          <h2 className="mt-1.5 font-ui text-lg font-semibold leading-snug text-ink">
            {task.title}
          </h2>
          {task.result && (
            <p className="mt-2 font-ui text-[13px] leading-[1.6] text-ink-3">
              {task.result}
            </p>
          )}
        </article>
      ) : (
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
      )}
    </PagePlaceholder>
  )
}
