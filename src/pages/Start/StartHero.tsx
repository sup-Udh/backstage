import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { useBackstage } from '../../stores/backstageStore'
import { PixelButton } from '../../components/Button/PixelButton'
import { WorkspacePreview } from './WorkspacePreview'
import { AgentRelay } from './AgentRelay'

interface Props {
  theme: Theme
  engine: WorldEngine
  switching: boolean
}

/**
 * The first screen of the product.
 *
 * Two columns, and the ratio between them is the design. Roughly three fifths
 * for what the product is and what to do about it; two fifths for the office.
 * That is requirement 23's split, and it is enforced by the grid rather than
 * by hoping the world behaves — the previous hero handed the world the full
 * page width and arranged the copy around whatever was left, which is how the
 * pixel environment came to be the loudest thing on a developer tool.
 *
 * The copy is a product introduction, not a marketing headline. Two lines
 * saying what this is, one saying what it does for you, and then the single
 * action that matters. Nothing on this screen is more prominent than
 * "New project", because on a start screen nothing is more important.
 *
 * The split turns on at 960px rather than at Tailwind's `lg`, and that number
 * is not arbitrary: the window's own minimum is 1000×700, and `lg` is 1024, so
 * a user who had merely *not maximised* Backstage was getting the stacked
 * layout at every size the application can actually be. Below 960 the columns
 * stack and the copy comes first, so a narrow window opens on the product
 * rather than on the scenery.
 */
export function StartHero({ theme, engine, switching }: Props) {
  const enterApp = useBackstage((s) => s.enterApp)

  return (
    <section id="top" className="px-6 pb-14 pt-10 sm:pt-14">
      <div className="mx-auto grid max-w-[1240px] items-start gap-8 min-[960px]:grid-cols-[1.5fr_1fr] min-[960px]:items-center min-[960px]:gap-10 xl:gap-12">
        {/* ------------------------------------------------------ copy -- */}
        <div className="rise">
          <p className="inline-flex items-center gap-2 border-2 border-ink bg-paper px-2.5 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            <span className="blink text-brand-deep" aria-hidden>
              ●
            </span>
            An AI development environment
          </p>

          <h1 className="mt-5 max-w-[16ch] font-ui text-[42px] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] text-ink sm:text-[56px] 2xl:text-[64px]">
            Your AI team,
            <br />
            working{' '}
            <span className="text-brand-deep">backstage</span>.
          </h1>

          <p className="mt-5 max-w-[46ch] font-ui text-[17px] leading-[1.6] text-ink-3">
            Give your agents a real workspace, real tools, and room to work
            together — a folder they can read, a terminal they can run, and
            each other to hand work to.
          </p>

          {/*
            One primary action, one secondary, and nothing else competing.
            Both lead to sign-in while signed out, which is `enterApp`'s whole
            job: it sends an authenticated user into initialisation and
            everybody else to Google, so neither this component nor the button
            it renders has to know which of those is happening.

            They wrap as whole buttons rather than wrapping their labels: at
            the width this column has in a 1000px window — the narrowest
            Backstage opens at — a shared row folded "+ New project" onto two
            lines, and a two-line primary action stops reading as a button.
          */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PixelButton className="whitespace-nowrap" onClick={enterApp}>
              + New project
            </PixelButton>
            <PixelButton
              variant="ghost"
              className="whitespace-nowrap"
              onClick={enterApp}
            >
              Open a project
            </PixelButton>
          </div>

          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            Sign in with Google · your code stays on this machine
          </p>
        </div>

        {/* ----------------------------------------------------- world -- */}
        <div className="rise flex flex-col gap-4" style={{ animationDelay: '90ms' }}>
          <WorkspacePreview theme={theme} engine={engine} switching={switching} />
          <AgentRelay theme={theme} engine={engine} />
        </div>
      </div>
    </section>
  )
}
