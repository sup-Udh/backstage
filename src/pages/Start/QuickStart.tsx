import { useBackstage } from '../../stores/backstageStore'
import { PixelButton } from '../../components/Button/PixelButton'

/**
 * Where you start working.
 *
 * This is both requirement 10's "start a project" panel and requirement 16's
 * empty state, and they are the same thing on purpose. A brand new user has no
 * projects, no agents and no workspace; there is no version of this screen
 * where a real project list belongs on it, because a user with projects is
 * never shown this screen at all — they are signed in, and signing in goes
 * straight to the project list. So the empty state is not a fallback here. It
 * is the content.
 *
 * The four steps are the four steps. They are the actual stages of
 * `ProjectSetup` — Workspace, World, Cast, Team lead — rather than a marketing
 * paraphrase of them, so what this panel promises is what the next screen
 * asks. Providers are named separately because they are set up once per
 * machine, not once per project.
 */

/** The wizard's own steps, in its own order. */
const STEPS = [
  { label: 'Workspace', note: 'The folder your agents may read, write and run in.' },
  { label: 'World', note: 'Which office they work in. Six to choose from.' },
  { label: 'Cast', note: 'Who is on the team, and what each of them does.' },
  { label: 'Team lead', note: 'Who coordinates the others when you ask for work.' }
]

/**
 * What a project list looks like, for somebody who has not got one.
 *
 * Marked as an example on the panel itself and never mixed with anything real
 * — requirement 35's line, and it is a hard one. The moment a user has actual
 * projects they are on the actual project list, and this component is not on
 * screen. There is deliberately no code path where the two could meet.
 */
const EXAMPLES = [
  { name: 'spider-man-landing', meta: 'The Branch · 4 characters' },
  { name: 'batman-website', meta: 'Night Shift · 3 characters' },
  { name: 'backstage', meta: 'Detective Office · 8 characters' }
]

export function QuickStart() {
  const enterApp = useBackstage((s) => s.enterApp)

  return (
    <section
      id="start"
      aria-labelledby="start-heading"
      className="border-y-[3px] border-ink bg-cream-2 px-6 py-14"
    >
      <div className="mx-auto grid max-w-[1240px] items-start gap-8 min-[960px]:grid-cols-[1.5fr_1fr] min-[960px]:gap-10 xl:gap-12">
        {/* ---------------------------------------------------- action -- */}
        <div className="border-[3px] border-ink bg-paper p-6 shadow-[6px_6px_0_0_var(--color-shadow)] sm:p-8">
          <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-brand-deep">
            Start a project
          </p>
          <h2
            id="start-heading"
            className="mt-2 font-ui text-3xl font-extrabold uppercase leading-[1.05] tracking-[-0.03em] text-ink sm:text-4xl"
          >
            Nothing backstage yet.
          </h2>
          <p className="mt-3 max-w-[52ch] font-ui text-[15px] leading-[1.6] text-ink-3">
            Create your first project and give your agents a place to work —
            a folder of your choosing, a world to work in, and a team to put
            in it.
          </p>

          {/*
            `flex-wrap` with non-wrapping labels, rather than two equal columns.
            Sharing the row evenly is what broke these: "Create your first
            project" is long, and at the width half a card gives it, it folded
            onto two lines and the primary action became a paragraph with a
            border. Each button now takes the width its label needs and the
            second one drops below when there is not room for both.
          */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <PixelButton className="whitespace-nowrap" onClick={enterApp}>
              + Create your first project
            </PixelButton>
            <PixelButton
              variant="ghost"
              className="whitespace-nowrap"
              onClick={enterApp}
            >
              Open existing project
            </PixelButton>
          </div>

          <ol className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {STEPS.map((step, i) => (
              <li key={step.label} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-px grid h-[22px] w-[22px] shrink-0 place-items-center border-2 border-ink bg-brand font-pixel text-[11px] font-bold leading-none text-on-brand"
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-pixel text-[12px] font-bold uppercase tracking-[0.06em] text-ink">
                    {step.label}
                  </span>
                  <span className="mt-1 block font-ui text-[13px] leading-snug text-ink-3">
                    {step.note}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* --------------------------------------------------- example -- */}
        <div className="border-[3px] border-rule bg-paper/60 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-pixel text-[11px] font-bold uppercase tracking-[0.1em] text-ink">
              Your workspace
            </h3>
            <span className="border border-rule px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3">
              Example
            </span>
          </div>
          <p className="mt-2 font-ui text-[13px] leading-snug text-ink-3">
            Every project keeps its own folder, world, team and conversations.
            Yours will look like this.
          </p>

          <ul className="mt-4 space-y-2" aria-label="Example projects">
            {EXAMPLES.map((project) => (
              <li
                key={project.name}
                className="border-2 border-rule bg-cream px-3 py-2"
              >
                <p className="truncate font-pixel text-[12px] font-bold uppercase tracking-[0.04em] text-ink-3">
                  {project.name}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                  {project.meta}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-4 font-ui text-[12px] leading-snug text-ink-3">
            Projects are private to your account. Nobody else signing into
            Backstage on this computer can see them.
          </p>
        </div>
      </div>
    </section>
  )
}
