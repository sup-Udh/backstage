import type { Theme } from '../../themes/types'
import { themeTeasers } from '../../themes'
import { PixelArt } from '../../world/PixelArt'

interface Props {
  theme: Theme
  activeThemeId: string
}

export function ThemesSection({ theme, activeThemeId }: Props) {
  return (
    <section
      id="themes"
      className="border-t-[3px] border-ink bg-cream-2 px-6 py-20"
    >
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-10 max-w-2xl">
          <h2 className="font-pixel text-4xl uppercase leading-none tracking-[-0.01em] text-ink sm:text-5xl">
            Choose your world
          </h2>
          <p className="mt-4 font-mono text-base leading-relaxed text-ink-3">
            The office is a theme, not the product. Your agents keep their
            work when the set changes.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {themeTeasers.map((t) => {
            const active = t.id === activeThemeId
            return (
              <article
                key={t.id}
                className={[
                  'border-[3px] border-ink transition-transform duration-75',
                  'hover:-translate-x-px hover:-translate-y-px',
                  active
                    ? 'bg-paper shadow-[4px_4px_0_0_var(--color-brand-shadow)]'
                    : 'bg-paper/60 shadow-[4px_4px_0_0_var(--color-ink)]'
                ].join(' ')}
              >
                <div
                  className={`flex justify-center border-b-[3px] border-ink py-5 ${
                    active ? 'bg-brand-pale' : 'bg-cream'
                  }`}
                >
                  <PixelArt
                    width={t.preview.width}
                    height={t.preview.height}
                    ops={t.preview.ops}
                    palette={theme.palette}
                    scale={3}
                    className={active ? '' : 'opacity-60'}
                  />
                </div>

                <div className="px-4 py-3">
                  <h3 className="font-pixel text-base font-bold uppercase leading-none tracking-[0.06em] text-ink">
                    {t.name}
                  </h3>
                  <p className="mt-2 min-h-[32px] font-mono text-xs leading-tight text-ink-3">
                    {t.blurb}
                  </p>
                  <p
                    className={`mt-3 inline-block border-2 px-2 py-0.5 font-pixel text-[10px] font-bold uppercase tracking-[0.16em] ${
                      active
                        ? 'border-ink bg-brand text-ink'
                        : 'border-ink-3 text-ink-3'
                    }`}
                  >
                    {active ? 'Active' : 'Coming soon'}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
