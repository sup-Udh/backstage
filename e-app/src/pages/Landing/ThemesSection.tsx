import { themeList } from '../../themes'
import { ThemePreview } from '../../world/ThemePreview'

interface Props {
  activeThemeId: string
  switching: boolean
  onSelectTheme: (id: string) => void
}

/**
 * The world picker.
 *
 * Every card is generated from the registry, so registering a theme makes it
 * appear here, previewable and selectable, with no change to this file. The
 * preview is a crop of that theme's real scene rather than artwork, so a card
 * can never advertise a world that does not look like that.
 */
export function ThemesSection({ activeThemeId, switching, onSelectTheme }: Props) {
  return (
    <section
      id="themes"
      className="border-t-[3px] border-ink bg-cream-2 px-6 py-20"
    >
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-10 max-w-2xl">
          <h2 className="font-ui text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.04em] text-ink sm:text-5xl">
            Choose your world
          </h2>
          <p className="mt-4 max-w-[520px] font-ui text-[17px] leading-[1.6] text-ink-3">
            The office is a theme, not the product. Your agents keep their
            model, their task and their status when the set changes.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {themeList.map((t) => {
            const active = t.id === activeThemeId
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                disabled={switching}
                onClick={() => onSelectTheme(t.id)}
                className={[
                  'group border-[3px] border-ink text-left',
                  'transition-transform duration-75 ease-linear',
                  'disabled:cursor-default',
                  active
                    ? 'bg-paper shadow-[4px_4px_0_0_var(--color-brand-shadow)]'
                    : 'bg-paper/70 shadow-[4px_4px_0_0_var(--color-ink)] hover:-translate-x-px hover:-translate-y-px hover:bg-paper'
                ].join(' ')}
              >
                <div
                  className="flex justify-center overflow-hidden border-b-[3px] border-ink"
                  style={{ background: t.palette.wall }}
                >
                  <ThemePreview
                    theme={t}
                    scale={3}
                    className={
                      active
                        ? ''
                        : 'opacity-80 transition-opacity group-hover:opacity-100'
                    }
                  />
                </div>

                <div className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-pixel text-base font-bold uppercase leading-none tracking-[0.04em] text-ink">
                      {t.name}
                    </h3>
                    <span
                      className={`shrink-0 border-2 px-2 py-0.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] ${
                        active
                          ? 'border-ink bg-brand text-ink'
                          : 'border-rule text-ink-3 group-hover:border-ink group-hover:text-ink'
                      }`}
                    >
                      {active ? 'Active' : 'Enter'}
                    </span>
                  </div>
                  <p className="mt-2.5 min-h-[36px] font-ui text-sm leading-[1.5] text-ink-3">
                    {t.tagline}
                  </p>
                  <p className="mt-3 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-ink-3">
                    {t.characters.map((c) => c.name).join(' · ')}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
