import type { CharacterDef } from '../../characters/character.types'
import { useBackstage } from '../../stores/backstageStore'
import { PixelMark } from '../../components/Header/PixelMark'
import { PixelButton } from '../../components/Button/PixelButton'
import { AppearanceToggle } from '../../components/Appearance/AppearanceToggle'
import { CharacterSprite } from '../../world/CharacterSprite'

interface Props {
  /** Who stands beside the wordmark. Changes with the world being browsed. */
  mascot: CharacterDef
}

/**
 * The start screen's navigation.
 *
 * Three items, and only three, because there are only three places this
 * application has at the top level: the screen you are on, your projects, and
 * your agents. Requirement 32 is explicit that nothing is listed here which
 * does not exist, so there is no About, no Docs, no Pricing and no Blog — this
 * is the front door of a desktop application, not a website.
 *
 * Projects and Agents are shown while signed out rather than hidden, and they
 * lead to the sign-in page. That is the honest arrangement: they are real
 * destinations, the user genuinely has them, and the only thing between the
 * two is an account. Hiding them would make the application look emptier than
 * it is; letting them through would be a guard that is not a guard. The real
 * protection is three layers down — `PROTECTED_VIEWS`, then every scoped read
 * in the main process, then row level security — and none of it depends on
 * this bar.
 */
export function StartNav({ mascot }: Props) {
  const enterApp = useBackstage((s) => s.enterApp)

  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-cream/95">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-6">
        {/* ------------------------------------------------------ mark -- */}
        <a
          href="#top"
          className="flex shrink-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
        >
          <PixelMark />
          <span className="font-pixel text-xl font-bold uppercase leading-none tracking-[-0.01em] text-ink">
            Backstage
          </span>
          {/*
            One character, at the size the brief asks for: an accent beside the
            wordmark rather than a mascot competing with it. Dropped below `sm`,
            where the bar has to choose between decoration and the sign-in
            button, and the button wins every time.
          */}
          <span
            aria-hidden
            className="ml-1 hidden h-[34px] w-[26px] place-items-center border-2 border-rule bg-brand-pale sm:grid"
          >
            <CharacterSprite appearance={mascot.appearance} state="idle" scale={1} />
          </span>
        </a>

        {/* ------------------------------------------------------- nav -- */}
        <nav aria-label="Primary" className="ml-auto flex items-center gap-0.5">
          <a
            href="#top"
            aria-current="page"
            className="relative px-3 py-2 font-ui text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
          >
            Home
            <span aria-hidden className="absolute inset-x-2 -bottom-[3px] h-[3px] bg-brand" />
          </a>

          {(['Projects', 'Agents'] as const).map((label) => (
            <button
              key={label}
              type="button"
              onClick={enterApp}
              title={`Sign in to open your ${label.toLowerCase()}`}
              className="px-3 py-2 font-ui text-sm font-semibold text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
            >
              {label}
            </button>
          ))}
        </nav>

        {/* ---------------------------------------------------- actions -- */}
        <div className="flex shrink-0 items-center gap-2.5">
          <AppearanceToggle />
          <PixelButton size="sm" onClick={enterApp}>
            Sign in
          </PixelButton>
        </div>
      </div>
    </header>
  )
}
