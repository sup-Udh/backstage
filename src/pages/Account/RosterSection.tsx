import { useBackstage } from '../../stores/backstageStore'
import { useProject, useProjectCast } from '../../stores/projectStore'
import { useTeam } from '../../stores/teamStore'

/**
 * The agents in the open project, at a glance.
 *
 * A summary, not a second editor. Everything here is already editable on the
 * Agents page — which has the character picker, the capability checkboxes, the
 * instruction editor and the relationship graph — and building a rival editor
 * in settings would mean two surfaces that can disagree about the same agent.
 * So this reports, and hands over.
 *
 * It shows the *open project's* roster, which is the only roster this side of
 * the IPC boundary can see: `listAgents` in the main process is scoped to the
 * open project, which is scoped to the signed-in account. There is no code
 * path by which another user's agent could appear in this list, because there
 * is no code path by which it could be fetched.
 */
export function RosterSection() {
  const agents = useTeam((s) => s.agents)
  const project = useProject((s) => s.project)
  const cast = useProjectCast()
  const providers = useBackstage((s) => s.providers)
  const setPage = useBackstage((s) => s.setPage)

  const providerName = (id: string) =>
    providers.find((p) => p.id === id)?.name ?? id

  /** The model this agent will actually use: its own, or the provider default. */
  const modelFor = (providerId: string, modelId: string | null) =>
    modelId ?? providers.find((p) => p.id === providerId)?.selectedModel ?? null

  return (
    <section>
      <h2 className="mb-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Agents
      </h2>
      <p className="mb-4 max-w-[620px] font-ui text-[13px] leading-snug text-ink-3">
        {project
          ? `The team in ${project.name}. Editing lives on the Agents page.`
          : 'Open a project to see its team.'}
      </p>

      {agents.length === 0 ? (
        <p className="border-2 border-rule bg-paper px-3 py-3 font-ui text-[13px] text-ink-3">
          {project
            ? 'This project has no agents yet.'
            : 'No project is open.'}
        </p>
      ) : (
        <div className="border-[3px] border-ink bg-paper">
          {/*
            A table rather than cards. Six agents as six cards is a page of
            scrolling to compare two provider columns — requirement 25 asks for
            information-dense, and this is the shape that earns that.

            It scrolls inside its own container so a narrow Electron window
            never makes the page itself scroll sideways.
          */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b-[3px] border-ink bg-cream">
                  {['Agent', 'Role', 'Provider', 'Model', 'Status'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2 font-pixel text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {agents.map((agent) => {
                  const character = cast[agent.characterSlot]
                  const model = modelFor(agent.providerId, agent.modelId)
                  const isLead = project?.godAgentId === agent.id

                  return (
                    <tr key={agent.id} className="border-b-2 border-rule last:border-b-0">
                      <td className="px-3 py-2 align-top">
                        <span className="block font-ui text-[13px] font-bold text-ink">
                          {agent.displayName || agent.name}
                        </span>
                        {/* Which face wears this agent in the world. */}
                        {character && (
                          <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                            {character.name}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 align-top font-ui text-[12px] text-ink-3">
                        {agent.role}
                        {isLead && (
                          <span className="ml-1.5 border border-ink bg-brand px-1 py-px font-pixel text-[9px] font-bold uppercase tracking-[0.06em] text-ink">
                            Lead
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 align-top font-ui text-[12px] text-ink">
                        {providerName(agent.providerId)}
                      </td>

                      <td className="px-3 py-2 align-top font-mono text-[11px] text-ink-3">
                        {model ?? <span className="text-rust">none selected</span>}
                      </td>

                      <td className="px-3 py-2 align-top">
                        <span
                          className={[
                            'inline-flex items-center gap-1 border-2 px-1.5 py-0.5',
                            'font-pixel text-[9px] font-bold uppercase tracking-[0.06em]',
                            agent.spawned
                              ? 'border-ink bg-brand text-ink'
                              : 'border-rule bg-cream text-ink-3'
                          ].join(' ')}
                        >
                          {agent.spawned ? 'In the office' : 'Not spawned'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t-[3px] border-ink bg-cream px-3 py-2">
            <button
              type="button"
              onClick={() => setPage('agents')}
              className="font-ui text-[12px] font-semibold text-ink underline decoration-brand-deep decoration-2 underline-offset-2 hover:text-brand-shadow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
            >
              Edit the team on the Agents page →
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
