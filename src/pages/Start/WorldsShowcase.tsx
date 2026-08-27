import { themeList } from '../../themes'
import { ThemePreview } from '../../world/ThemePreview'

interface Props {
  activeThemeId: string
  switching: boolean
  onSelectTheme: (id: string) => void
}

/**
 * Choose the world above.
 *
 * Every card is generated from the theme registry, which is what keeps this
 * section honest about requirement 14: it cannot advertise a world that does
 * not exist, because there is nowhere to write one down. Registering a theme
 * makes it appear here, previewable and selectable, with no change to this
 * file — and un-registering one removes it.
 *
 * The preview is a crop of that theme's actual scene, rendered by the same
 * pipeline as the office, rather than hand-drawn artwork. A card therefore
 * cannot promise a room that does not look like that.
 *
 * Clicking one changes the world in the hero, not a setting. A project's world
 * is chosen when the project is created and belongs to it thereafter; there is
 * deliberately no global theme for this section to write to, which is what
 * stopped browsing here from changing the world of the project you then walked
 * into.
 */
export function WorldsShowcase({ activeThemeId, switching, onSelectTheme }: Props) {
  return (
    <section
      id="worlds"
      aria-labelledby="worlds-heading"
      className="border-t-[3px] border-ink px-6 py-14"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2
            id="worlds-heading"
            className="font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3"
          >
            Your workspace, your world
          </h2>
          <p className="font-ui text-[13px] text-ink-3">
            {themeList.length} worlds. Pick one to see it above.
          </p>
        </div>

        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themeList.map((t) => {
            const active = t.id === activeThemeId
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={switching}
                  onClick={() => onSelectTheme(t.id)}
                  className={[
                    'group flex w-full items-center gap-3 border-[3px] p-2.5 text-left',
                    'transition-transform duration-75 ease-linear',
                    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep',
                    'disabled:cursor-default',
                    active
                      ? 'border-ink bg-paper shadow-[4px_4px_0_0_var(--color-brand-shadow)]'
                      : 'border-rule bg-paper/60 hover:-translate-x-px hover:-translate-y-px hover:border-ink hover:bg-paper'
                  ].join(' ')}
                >
                  {/*
                    A fixed-size window onto the preview rather than the whole
                    crop scaled down. `ThemePreview` only upscales by integers
                    — a fractional scale is the one thing that turns pixel art
                    to mush — so the card clips it instead of resizing it.
                  */}
                  <span
                    aria-hidden
                    className="grid h-[64px] w-[120px] shrink-0 place-items-center overflow-hidden border-2 border-ink"
                    style={{ background: t.palette.wall }}
                  >
                    <ThemePreview
                      theme={t}
                      scale={1}
                      className={
                        active ? '' : 'opacity-80 transition-opacity group-hover:opacity-100'
                      }
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-pixel text-[13px] font-bold uppercase leading-none tracking-[0.04em] text-ink">
                        {t.name}
                      </span>
                      <span
                        className={`shrink-0 border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] ${
                          active
                            ? 'border-brand-shadow bg-brand text-on-brand'
                            : 'border-rule text-ink-3 group-hover:border-ink group-hover:text-ink'
                        }`}
                      >
                        {active ? 'Showing' : 'View'}
                      </span>
                    </span>
                    <span className="mt-1.5 block font-ui text-[12px] leading-snug text-ink-3">
                      {t.tagline}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
