import { useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useProject } from '../../stores/projectStore'
import { useTeam } from '../../stores/teamStore'
import { getTheme } from '../../themes'
import { ThemePreview } from '../../world/ThemePreview'
import { PixelMark } from '../../components/Header/PixelMark'
import { Avatar } from '../../components/Auth/Avatar'
import { AppearanceToggle } from '../../components/Appearance/AppearanceToggle'
import { useAuth } from '../../stores/authStore'
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
 *
 * And it is the only route *out* of one. A project accumulates agents, cases,
 * automations and transcripts, so the list is the honest place to remove one:
 * nowhere else can show what is about to go, or what is left afterwards.
 */
export function ProjectPicker() {
  const showSetup = useBackstage((s) => s.showSetup)
  const openProject = useBackstage((s) => s.openProject)

  const projects = useProject((s) => s.projects)
  const open = useProject((s) => s.open)
  const remove = useProject((s) => s.remove)
  const refreshTeam = useTeam((s) => s.refresh)
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

  /** The project being opened, so its own card can say so. */
  const [opening, setOpening] = useState<string | null>(null)
  /** The card asking whether it should really be deleted. At most one. */
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Nothing else may be started while a card is opening or being deleted. */
  const busyElsewhere = opening !== null || deleting !== null

  const enter = async (project: Project) => {
    setOpening(project.id)
    setConfirming(null)
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

  /**
   * Delete a project, once its own card has asked.
   *
   * The confirm is on the card rather than in a dialog because the card is
   * what identifies the project — the name and, more to the point, the path.
   * A dialog saying "delete Backstage?" over a list containing two checkouts
   * of the same repository is asking a question the user cannot answer.
   *
   * Deleting the last one leads to setup rather than to an empty list, which
   * is the same rule the walk-in already follows: with no projects there is
   * nothing to choose between, only one to make.
   */
  const destroy = async (project: Project) => {
    setDeleting(project.id)
    setError(null)
    try {
      const remaining = await remove(project.id)
      setConfirming(null)
      if (remaining.length === 0) showSetup()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `${project.name} could not be deleted.`
      )
    } finally {
      setDeleting(null)
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
          <span className="ml-2 border-2 border-ink bg-brand px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.08em] text-on-brand">
            Your projects
          </span>
        </div>

        {/*
          Whose projects these are, on the surface that lists them.

          There is no navigation bar here — this screen sits before a project
          is open — so the account has to be identifiable from the header
          itself. On a shared machine "which projects am I looking at?" and
          "who am I signed in as?" are the same question.
        */}
        <div className="flex items-center gap-2">
          <AppearanceToggle />

          <span className="flex items-center gap-2 border-2 border-ink bg-paper px-2.5 py-1">
            <Avatar user={user} size={20} />
            <span className="max-w-[180px] truncate font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              {user?.email ?? user?.displayName ?? 'Signed in'}
            </span>
          </span>

          <button
            type="button"
            onClick={() => void signOut()}
            className="border-2 border-rule px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-rust hover:text-rust focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1000px]">
          {/*
            The greeting is built from the authenticated profile — never a
            hard-coded name, and never the project's. `firstName` falls back
            through the display name to the email's local part, so an account
            with no Google name still gets addressed as somebody.
          */}
          <p className="font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-brand-deep">
            Welcome back{user ? `, ${firstName(user.displayName)}` : ''}
          </p>
          <h1 className="mt-1 font-ui text-3xl font-extrabold uppercase leading-[1.05] tracking-[-0.03em] text-ink">
            Which project?
          </h1>
          <p className="mt-3 max-w-[640px] font-ui text-[15px] leading-[1.6] text-ink-3">
            Each one is a folder, a world and a team of its own, and every one of
            them belongs to your account alone. Your agents can only reach the
            folder of the project you open — nothing outside it is readable,
            writable or runnable.
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
              const asking = confirming === project.id
              const gone = deleting === project.id
              return (
                /*
                  A card, not a button, since it holds two actions now. The
                  hover lift and the border move to the open surface inside it
                  so the card still reads as one object that responds to being
                  pointed at.
                */
                <div
                  key={project.id}
                  className={`group flex flex-col border-[3px] border-rule bg-paper/70 shadow-[4px_4px_0_0_var(--color-shadow)] transition-transform duration-75 focus-within:border-ink hover:border-ink hover:bg-paper ${
                    busyElsewhere ? '' : 'hover:-translate-x-px hover:-translate-y-px'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void enter(project)}
                    disabled={busyElsewhere || asking}
                    className="flex-1 text-left disabled:opacity-60"
                  >
                    <div className="overflow-hidden border-b-[3px] border-rule transition-colors group-focus-within:border-ink group-hover:border-ink">
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

                  {/*
                    Deleting is a footer on the card rather than a cross in the
                    corner of the artwork. A project is a folder a team has been
                    working in; removing one should take a deliberate look at
                    which card you are on, not a flick of the mouse at a target
                    that sits a few pixels from "open".
                  */}
                  <div className="border-t-[3px] border-rule px-4 py-2.5 transition-colors group-focus-within:border-ink group-hover:border-ink">
                    {asking ? (
                      <div>
                        <p className="font-ui text-[12px] leading-snug text-ink">
                          Delete {project.name}? Its agents, automations, cases and
                          conversations go with it.
                        </p>
                        {/*
                          Said plainly, because this is the fear that stops
                          someone using the button at all — and because an app
                          that has read, write and run access to the folder owes
                          the user an explicit statement that it is not touching
                          it.
                        */}
                        <p className="mt-1 font-ui text-[12px] leading-snug text-ink-3">
                          The folder on disk is left exactly as it is.
                        </p>
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            disabled={gone}
                            className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors enabled:hover:border-ink enabled:hover:text-ink disabled:opacity-40"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void destroy(project)}
                            disabled={gone}
                            className="border-2 border-ink bg-rust px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-on-slate disabled:opacity-60"
                          >
                            {gone ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(project.id)}
                        disabled={busyElsewhere}
                        className="font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors enabled:hover:text-rust disabled:opacity-40"
                      >
                        Delete project
                      </button>
                    )}
                  </div>
                </div>
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
              disabled={busyElsewhere}
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

/** The first word of a display name, for a greeting that is not a full name. */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName
}
