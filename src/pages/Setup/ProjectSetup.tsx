import { useMemo, useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useProject } from '../../stores/projectStore'
import { useTeam } from '../../stores/teamStore'
import { defaultThemeId, getTheme, themeList } from '../../themes'
import { ThemePreview } from '../../world/ThemePreview'
import { PixelMark } from '../../components/Header/PixelMark'
import { CharacterTile } from './CharacterTile'

/**
 * Creating a project.
 *
 * Four decisions, in the order they depend on each other: where the work is,
 * which world it happens in, who is in it, and who leads. Each one narrows the
 * next — the cast can only be picked once a theme exists, and the lead can only
 * be picked from the cast — which is why this is a sequence rather than a form.
 *
 * The steps after the first are all reversible and nothing is written until
 * the last one, so backing out costs the user nothing. That is also why the
 * folder picker does not open the workspace: abandoning setup half-way must
 * not leave the app pointed at a folder nobody chose.
 */

/** How many characters a new project starts with selected. */
const DEFAULT_TEAM_SIZE = 4

const STEPS = ['Workspace', 'World', 'Cast', 'Team lead'] as const

/**
 * Who the wizard offers as team lead for a cast.
 *
 * The theme's suggestion when it is in the chosen cast, and the first person
 * picked otherwise. Only ever a pre-selected radio button: once the project
 * exists, `godAgentId` on the project decides who coordinates and nothing
 * reads the theme again.
 */
function suggestLead(themeId: string, cast: string[]): string | null {
  const suggested = getTheme(themeId).suggestedLeaderId
  if (suggested && cast.includes(suggested)) return suggested
  return cast[0] ?? null
}

export function ProjectSetup() {
  const exitToLanding = useBackstage((s) => s.exitToLanding)
  const showProjects = useBackstage((s) => s.showProjects)
  const openProject = useBackstage((s) => s.openProject)
  const create = useProject((s) => s.create)
  const refreshTeam = useTeam((s) => s.refresh)

  /*
   * Where cancelling goes. Back to the list if there is one to go back to,
   * and out to the landing page only when this is the first project — leaving
   * by the same door you came in by.
   */
  const projects = useProject((s) => s.projects)

  /*
   * A folder the app already knows about, from an install that predates
   * projects. Offered as the starting point rather than making the user
   * navigate back to the folder Backstage is already pointed at.
   */
  const legacy = useProject((s) => s.legacy)

  const [step, setStep] = useState(0)
  const [workspacePath, setWorkspacePath] = useState(legacy?.workspacePath ?? '')
  const [name, setName] = useState(() =>
    legacy?.workspacePath ? folderName(legacy.workspacePath) : ''
  )
  const [themeId, setThemeId] = useState(defaultThemeId)
  const [picked, setPicked] = useState<string[]>([])
  const [lead, setLead] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const theme = useMemo(() => getTheme(themeId), [themeId])

  /* ------------------------------------------------------------ choices -- */

  const chooseFolder = async () => {
    const chosen = await window.backstage?.projects.chooseFolder()
    if (!chosen) return
    setWorkspacePath(chosen.path)
    // Only overwrite a name the user has not typed over.
    setName((current) => (current.trim() ? current : chosen.name))
    setError(null)
  }

  /*
   * Choosing a world replaces the cast rather than keeping it.
   *
   * A roster names characters from one theme and means nothing in another, so
   * there is no version of "keep my selection" that could be honoured. The new
   * world arrives with a starting team already picked, which is what makes the
   * next two steps a confirmation rather than a chore.
   */
  const chooseTheme = (id: string) => {
    setThemeId(id)
    const cast = getTheme(id).characters
    const starting = cast.slice(0, DEFAULT_TEAM_SIZE).map((c) => c.id)
    setPicked(starting)
    setLead(suggestLead(id, starting))
  }

  const toggleCharacter = (id: string) => {
    setPicked((current) => {
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
      // The lead has to stay in the cast, or the project would open with a
      // coordinator nobody can see.
      setLead((currentLead) =>
        currentLead && next.includes(currentLead) ? currentLead : suggestLead(themeId, next)
      )
      return next
    })
  }

  /*
   * The cast defaults on first arrival at the World step rather than at mount,
   * so the default theme's team is chosen even if the user never clicks a
   * theme card.
   */
  const ensureCast = () => {
    if (picked.length > 0) return
    const starting = theme.characters.slice(0, DEFAULT_TEAM_SIZE).map((c) => c.id)
    setPicked(starting)
    setLead(suggestLead(theme.id, starting))
  }

  /* -------------------------------------------------------------- gating -- */

  const blocker = (() => {
    if (step === 0) {
      if (!workspacePath) return 'Choose a folder for this project.'
      if (!name.trim()) return 'Give the project a name.'
    }
    if (step === 2 && picked.length === 0) {
      return 'Choose at least one character.'
    }
    if (step === 3 && !lead) return 'Choose who leads the team.'
    return null
  })()

  const next = () => {
    if (blocker) return setError(blocker)
    setError(null)
    if (step === 0) ensureCast()
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const back = () => {
    setError(null)
    if (step === 0) return projects.length > 0 ? showProjects() : exitToLanding()
    setStep((s) => s - 1)
  }

  /* -------------------------------------------------------------- create -- */

  const finish = async () => {
    if (blocker) return setError(blocker)

    setCreating(true)
    setError(null)
    try {
      const byId = new Map(theme.characters.map((c) => [c.id, c]))
      const result = await create({
        name: name.trim(),
        workspacePath,
        themeId,
        // Ordered by the roster, so an agent's slot and the cast agree.
        roster: picked.flatMap((id) => {
          const character = byId.get(id)
          return character
            ? [{ characterId: id, name: character.name, role: character.role }]
            : []
        }),
        godCharacterId: lead
      })

      if (result.error || !result.project) {
        setError(result.error ?? 'The project could not be created.')
        return
      }

      // The roster exists now; load it before the world tries to render it.
      await refreshTeam()
      openProject()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The project could not be created.')
    } finally {
      setCreating(false)
    }
  }

  const last = step === STEPS.length - 1

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      {/* ---------------------------------------------------------- header -- */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b-[3px] border-ink px-5">
        <div className="flex items-center gap-3">
          <PixelMark />
          <span className="font-pixel text-xl font-bold uppercase tracking-[-0.01em] text-ink">
            Backstage
          </span>
          <span className="ml-2 border-2 border-ink bg-brand px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.08em] text-ink">
            New project
          </span>
        </div>

        <ol className="flex items-center gap-1">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-1">
              <span
                className={[
                  'px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em]',
                  i === step
                    ? 'border-2 border-ink bg-paper text-ink'
                    : i < step
                      ? 'text-ink-3'
                      : 'text-rule'
                ].join(' ')}
              >
                {i < step ? '◆' : i === step ? '✦' : '○'} {label}
              </span>
              {i < STEPS.length - 1 && <span aria-hidden className="text-rule">·</span>}
            </li>
          ))}
        </ol>
      </header>

      {/* ------------------------------------------------------------ body -- */}
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1000px]">
          {step === 0 && (
            <Section
              title="Where is the work?"
              lead="Pick the folder your agents will work in. This is the only place they can reach — nothing outside it is readable, writable or runnable."
            >
              <div className="max-w-[640px]">
                <button
                  type="button"
                  onClick={() => void chooseFolder()}
                  className="border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px hover:bg-brand-lite"
                >
                  {workspacePath ? 'Choose a different folder' : 'Choose folder'}
                </button>

                {workspacePath && (
                  <p className="mt-3 break-all border-2 border-rule bg-paper px-3 py-2 font-mono text-[12px] text-ink-3">
                    {workspacePath}
                  </p>
                )}

                <label className="mt-6 block">
                  <span className="font-pixel text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">
                    Project name
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e-app"
                    className="mt-2 w-full border-[3px] border-ink bg-paper px-3 py-2 font-ui text-[15px] text-ink outline-none focus:bg-brand-pale"
                  />
                  <span className="mt-1.5 block font-ui text-[12px] text-ink-3">
                    Taken from the folder. Change it to whatever you call this work.
                  </span>
                </label>
              </div>
            </Section>
          )}

          {step === 1 && (
            <Section
              title="Select your world"
              lead="The world decides what the office looks like and who your agents are portrayed by. It belongs to this project — another project can be somewhere else entirely."
            >
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {themeList.map((t) => {
                  const active = t.id === themeId
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => chooseTheme(t.id)}
                      className={[
                        'group border-[3px] text-left transition-transform duration-75',
                        active
                          ? 'border-ink bg-paper shadow-[4px_4px_0_0_var(--color-brand-shadow)]'
                          : 'border-rule bg-paper/70 shadow-[4px_4px_0_0_var(--color-ink)] hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-paper'
                      ].join(' ')}
                    >
                      <div className="overflow-hidden border-b-[3px] border-inherit">
                        <ThemePreview theme={t} scale={2} className="w-full" />
                      </div>
                      <div className="px-4 py-3">
                        <p className="font-pixel text-base font-bold uppercase tracking-[0.04em] text-ink">
                          {t.name}
                        </p>
                        <p className="mt-1.5 font-ui text-[13px] leading-snug text-ink-3">
                          {t.tagline}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section
              title={`Who works on ${name.trim() || 'this project'}?`}
              lead={`These are the people of ${theme.name}. Whoever you pick becomes this project's team — and nobody else, from this world or any other, appears anywhere inside it.`}
            >
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {theme.characters.map((c) => (
                  <CharacterTile
                    key={c.id}
                    character={c}
                    selected={picked.includes(c.id)}
                    onToggle={() => toggleCharacter(c.id)}
                  />
                ))}
              </div>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
                <span className="text-ink">{picked.length}</span> of{' '}
                {theme.characters.length} chosen
              </p>
            </Section>
          )}

          {step === 3 && (
            <Section
              title="Who leads the team?"
              lead="When you talk to ALL AGENTS, this is who receives it. They decide what needs doing, hand the parts out to whoever should do them, and report back with the answer."
            >
              <div
                role="radiogroup"
                aria-label="Team lead"
                className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4"
              >
                {picked.map((id) => {
                  const character = theme.characters.find((c) => c.id === id)
                  if (!character) return null
                  return (
                    <CharacterTile
                      key={id}
                      character={character}
                      selected={lead === id}
                      lead
                      single
                      onToggle={() => setLead(id)}
                    />
                  )
                })}
              </div>
            </Section>
          )}
        </div>
      </main>

      {/* ---------------------------------------------------------- footer -- */}
      <footer className="flex shrink-0 items-center gap-3 border-t-[3px] border-ink bg-paper px-6 py-4">
        <button
          type="button"
          onClick={back}
          disabled={creating}
          className="border-2 border-rule px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors enabled:hover:border-ink enabled:hover:text-ink disabled:opacity-40"
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        {error && (
          <p className="border-2 border-rust bg-cream px-2.5 py-1 font-ui text-[13px] text-ink">
            {error}
          </p>
        )}

        <div className="ml-auto flex items-center gap-3">
          {last && (
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
              {name.trim() || 'Project'}
              <span className="mx-1.5 text-rule">·</span>
              {theme.name}
              <span className="mx-1.5 text-rule">·</span>
              {picked.length} agents
            </p>
          )}

          <button
            type="button"
            onClick={() => (last ? void finish() : next())}
            disabled={creating}
            className="border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-x-px enabled:hover:-translate-y-px enabled:hover:bg-brand-lite disabled:opacity-50"
          >
            {creating ? 'Creating…' : last ? 'Create project' : 'Continue'}
          </button>
        </div>
      </footer>
    </div>
  )
}

/** The last segment of a path, whichever separator it uses. */
function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function Section({
  title,
  lead,
  children
}: {
  title: string
  lead: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h1 className="font-ui text-3xl font-extrabold uppercase leading-[1.05] tracking-[-0.03em] text-ink">
        {title}
      </h1>
      <p className="mt-3 max-w-[640px] font-ui text-[15px] leading-[1.6] text-ink-3">
        {lead}
      </p>
      <div className="mt-8">{children}</div>
    </section>
  )
}
