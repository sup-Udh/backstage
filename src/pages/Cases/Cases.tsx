import { useCallback, useEffect, useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import { useProject, useProjectCast } from '../../stores/projectStore'
import { castNameForSlot } from '../../project/cast'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import { CaseDetail } from './CaseDetail'
import type { Case } from '../../shared/providerApi'

/**
 * The project's investigations.
 *
 * A case is what was asked for; the tasks inside it are how the team went about
 * it. This page used to list one card per task, which meant a single question
 * broadcast to three agents read as three unrelated investigations — the exact
 * opposite of what it was trying to show.
 *
 * Only this project's cases appear. Cases are stored against a project id and
 * the main process filters on it, so there is no query that could return
 * another project's work.
 */
export function Cases() {
  const setPage = useBackstage((s) => s.setPage)
  const project = useProject((s) => s.project)
  const cast = useProjectCast()
  const agents = useTeam((s) => s.agents)

  const [cases, setCases] = useState<Case[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.backstage?.cases) return
    setCases(await window.backstage.cases.list())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, project?.id])

  const nameFor = (agentId: string) => {
    const config = agents.find((a) => a.id === agentId)
    if (!config) return agentId
    return castNameForSlot(cast, config.characterSlot)
  }

  const open = openId ? cases.find((c) => c.id === openId) : null

  if (open) {
    return (
      <CaseDetail
        detail={open}
        projectName={project?.name ?? ''}
        nameFor={nameFor}
        onBack={() => setOpenId(null)}
        onChanged={setCases}
      />
    )
  }

  return (
    <PagePlaceholder
      title="Cases"
      lead={
        project
          ? `Every investigation ${project.name} has run. Open one to see the tasks it produced, who worked on it and what came back.`
          : 'Every investigation this project has run.'
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void refresh()}
          className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
        >
          Refresh
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          <span className="text-ink">{cases.length}</span>{' '}
          {cases.length === 1 ? 'case' : 'cases'}
        </span>
      </div>

      {loaded && cases.length === 0 ? (
        <div className="max-w-[520px] border-[3px] border-dashed border-rule bg-paper/60 p-6">
          <p className="font-ui text-sm text-ink-3">
            No cases yet. A case opens the first time you give the team
            something to do.
          </p>
          <button
            type="button"
            onClick={() => setPage('home')}
            className="mt-4 border-2 border-ink bg-brand px-3 py-1.5 font-pixel text-xs font-semibold uppercase tracking-[0.06em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px"
          >
            Go to Home
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {cases.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className="w-full border-[3px] border-ink bg-paper p-4 text-left shadow-[4px_4px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_0_var(--color-brand-shadow)]"
              >
                {/*
                  The project is named on every card, quietly. It is the same
                  project on all of them — the point is that the user can never
                  be unsure which one they are looking at.
                */}
                <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
                  <span
                    aria-hidden
                    className={c.status === 'open' ? 'text-brand-deep' : 'text-ink-3'}
                  >
                    {c.status === 'open' ? '✦' : '◆'}
                  </span>
                  <span className="text-ink">{project?.name}</span>
                  <span className="text-rule">·</span>
                  <span>{c.status === 'open' ? 'Open' : 'Closed'}</span>
                </p>

                <h2 className="mt-1.5 font-ui text-lg font-semibold leading-snug text-ink">
                  {c.name}
                </h2>

                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  {c.taskIds.length} {c.taskIds.length === 1 ? 'task' : 'tasks'}
                  {c.involvedAgentIds.length > 0 && (
                    <>
                      <span className="mx-1.5 text-rule">·</span>
                      {c.involvedAgentIds.map(nameFor).join(', ')}
                    </>
                  )}
                  <span className="mx-1.5 text-rule">·</span>
                  {new Date(c.updatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PagePlaceholder>
  )
}
