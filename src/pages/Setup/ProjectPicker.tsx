import { useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useProject } from '../../stores/projectStore'
import { useTeam } from '../../stores/teamStore'
import { getTheme } from '../../themes'
import { ThemePreview } from '../../world/ThemePreview'
import { PixelMark } from '../../components/Header/PixelMark'
import type { Project } from '../../shared/projects'

/**
 * Which piece of work is this?
 *
 * The app used to answer that question itself: initialisation reopened
 * whichever project was last active and walked straight into it. That is the
 * one decision it should never make quietly. A project is a folder that agents
 * are given read, write and run access to, so opening the wrong one is not a
 * wrong screen — it is a team editing the wrong repository.
 *
 * So it asks, every time, even when there is one project and the answer is
 * obvious. The cost is one click; the alternative is an app that picks a
 * repository on the user's behalf and does not mention which.
 *
 * It is also the only route to a second project. Before this screen there was
 * no way to start one without deleting the first, because setup was reachable
 * only when no project existed at all.
 */
export function ProjectPicker() {
  const showSetup = useBackstage((s) => s.showSetup)
  const openProject = useBackstage((s) => s.openProject)
  const exitToLanding = useBackstage((s) => s.exitToLanding)

  const projects = useProject((s) => s.projects)
  const open = useProject((s) => s.open)
  const refreshTeam = useTeam((s) => s.refresh)

  /** The project being opened, so its own card can say so. */
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const enter = async (project: Project) => {
    setOpening(project.id)
    setError(null)
    try {
      const opened = await open(project.id)
      if (!opened) {
        setError(`${project.name} could not be opened. Its folder may have moved.`)
        return
      }
      // The roster is project-scoped, so it has to be reloaded before the world
      // tries to render it — otherwise the office opens with the last
      // project's team still in it for a frame.
      await refreshTeam()
      openProject()
    } catch (err) {
      setError(err instanceof Error ? err.message : `${project.name} could not be opened.`)
    } finally {
      setOpening(null)
    }
  }

  // Most recently touched first: the project someone is in the middle of is
  // almost always the one they came back for.
  const ordered = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      <header className="flex h-16 shrink-0 items-center justify-between border-b-[3px] border-ink px-5">
        <div className="flex items-center gap-3">
          <PixelMark />
          <span className="font-pixel text-xl font-bold uppercase tracking-[-0.01em] text-ink">
            Backstage
          </span>
          <span className="ml-2 border-2 border-ink bg-brand px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.08em] text-ink">
            Your projects
          </span>
        </div>

        <button
          type="button"
          onClick={exitToLanding}
          className="border-2 border-rule px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
        >
          Back
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1000px]">
          <h1 className="font-ui text-3xl font-extrabold uppercase leading-[1.05] tracking-[-0.03em] text-ink">
            Which project?
          </h1>
          <p className="mt-3 max-w-[640px] font-ui text-[15px] leading-[1.6] text-ink-3">
            Each one is a folder, a world and a team of its own. Your agents can
            only reach the folder of the project you open — nothing outside it is
            readable, writable or runnable.
          </p>

          {error && (
            <p className="mt-6 border-2 border-rust bg-paper px-3 py-2 font-ui text-[13px] text-ink">
              {error}
            </p>
          )}

          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((project) => {
              const theme = getTheme(project.themeId)
              const busy = opening === project.id
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => void enter(project)}
                  disabled={opening !== null}
                  className="group border-[3px] border-rule bg-paper/70 text-left shadow-[4px_4px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-x-px enabled:hover:-translate-y-px enabled:hover:border-ink enabled:hover:bg-paper disabled:opacity-60"
                >
                  <div className="overflow-hidden border-b-[3px] border-inherit">
                    <ThemePreview theme={theme} scale={2} className="w-full" />
                  </div>
                  <div className="px-4 py-3">
                    <p className="font-pixel text-base font-bold uppercase tracking-[0.04em] text-ink">
                      {project.name}
                    </p>
                    {/*
                      The path in full, and wrapped rather than trimmed. It is
                      the one fact that decides whether this is the right
                      project, and an ellipsis in the middle of a path hides
                      exactly the part that distinguishes two checkouts of the
                      same repository.
                    */}
                    <p className="mt-1.5 break-all font-mono text-[11px] leading-snug text-ink-3">
                      {project.workspacePath}
                    </p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                      {theme.name}
                      <span className="mx-1.5 text-rule">·</span>
                      {/*
                        Characters, not agents. The roster is who was cast from
                        the theme; how many of them currently have an agent
                        behind them is scoped to the open project, so this
                        screen cannot know it for the others — and a count that
                        is right for one card and wrong for the rest is worse
                        than the honest number.
                      */}
                      {project.characterRoster.length} characters
                      <span className="mx-1.5 text-rule">·</span>
                      {when(project.updatedAt)}
                    </p>
                    <p className="mt-3 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-deep">
                      {busy ? 'Opening…' : 'Open →'}
                    </p>
                  </div>
                </button>
              )
            })}

            {/*
              Deliberately the same size and shape as a project card rather
              than a link in a corner. Starting a second project is a normal
              thing to do here, not an escape hatch from the list.
            */}
            <button
              type="button"
              onClick={showSetup}
              disabled={opening !== null}
              className="flex min-h-[200px] flex-col items-center justify-center gap-3 border-[3px] border-dashed border-rule bg-paper/40 px-4 py-8 text-center transition-colors enabled:hover:border-ink enabled:hover:bg-paper disabled:opacity-60"
            >
              <span aria-hidden className="font-pixel text-3xl text-brand-deep">
                +
              </span>
              <span className="font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink">
                New project
              </span>
              <span className="max-w-[220px] font-ui text-[13px] leading-snug text-ink-3">
                Choose a folder, a world, a cast and who leads them.
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

/** Roughly how long ago, in the fewest words that are still true. */
function when(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : new Date(at).toLocaleDateString()
}
