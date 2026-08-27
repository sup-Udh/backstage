import { useProject } from '../../stores/projectStore'
import { getTheme } from '../../themes'
import { useTeam } from '../../stores/teamStore'
import { ProjectPanel } from './ProjectPanel'
import { ThemePanel } from '../Themes/ThemePanel'

/**
 * This project's settings, and the list of every project you own.
 *
 * Two things on one page because they answer the same question from opposite
 * ends: "what am I working in" and "what else is there". The editable half is
 * only ever the open project — a project is a folder a team has write access
 * to, and editing one that is not open would mean changing the configuration
 * of a workspace nothing is currently pointed at.
 *
 * Every project listed belongs to the signed-in account. That is not enforced
 * here: `projects.list` in the main process filters on the owner before the
 * renderer sees anything, so this component could not display somebody else's
 * project even if it tried.
 */
export function ProjectsSection() {
  const project = useProject((s) => s.project)
  const projects = useProject((s) => s.projects)
  const agents = useTeam((s) => s.agents)

  // Most recently touched first, matching the picker's own ordering.
  const ordered = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <section className="flex flex-col gap-10">
      {/* -------------------------------------------- the open project -- */}
      <div>
        <h2 className="mb-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          This project
        </h2>
        <p className="mb-4 max-w-[620px] font-ui text-[13px] leading-snug text-ink-3">
          Its name, its folder, its world and who leads the team. Changing any
          of it affects this project only.
        </p>

        <ProjectPanel />

        <div className="mt-8">
          <ThemePanel />
        </div>
      </div>

      {/* ------------------------------------------------ all projects -- */}
      <div>
        <h2 className="mb-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          All your projects
        </h2>
        <p className="mb-4 max-w-[620px] font-ui text-[13px] leading-snug text-ink-3">
          Everything on this machine that belongs to your account. Switching
          between them happens from the projects screen.
        </p>

        {ordered.length === 0 ? (
          <p className="border-2 border-rule bg-paper px-3 py-3 font-ui text-[13px] text-ink-3">
            You have no projects yet.
          </p>
        ) : (
          <div className="overflow-x-auto border-[3px] border-ink bg-paper">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="border-b-[3px] border-ink bg-cream">
                  {['Project', 'Folder', 'World', 'Agents', 'Last activity'].map(
                    (h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-3 py-2 font-pixel text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {ordered.map((p) => {
                  const open = p.id === project?.id
                  return (
                    <tr key={p.id} className="border-b-2 border-rule last:border-b-0">
                      <td className="px-3 py-2 align-top">
                        <span className="block font-ui text-[13px] font-bold text-ink">
                          {p.name}
                        </span>
                        {open && (
                          <span className="mt-0.5 inline-block border border-ink bg-brand px-1 py-px font-pixel text-[9px] font-bold uppercase tracking-[0.06em] text-on-brand">
                            Open
                          </span>
                        )}
                      </td>

                      <td className="max-w-[240px] px-3 py-2 align-top">
                        <span className="block truncate font-mono text-[11px] text-ink-3">
                          {p.workspacePath}
                        </span>
                      </td>

                      <td className="px-3 py-2 align-top font-ui text-[12px] text-ink-3">
                        {getTheme(p.themeId).name}
                      </td>

                      <td className="px-3 py-2 align-top font-mono text-[11px] text-ink-3">
                        {/*
                          Only the open project's roster is loaded — the main
                          process scopes `agents.list` to it — so the count is
                          shown for that one and left blank rather than guessed
                          for the others. A wrong number here would be worse
                          than no number.
                        */}
                        {open ? agents.length : '—'}
                      </td>

                      <td className="px-3 py-2 align-top font-mono text-[11px] text-ink-3">
                        {relative(p.updatedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

/** A short, human "when", matching the project picker's wording. */
function relative(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : new Date(at).toLocaleDateString()
}
