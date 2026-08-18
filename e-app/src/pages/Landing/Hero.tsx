import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { World } from '../../world/World'
import { PixelButton } from '../../components/Button/PixelButton'
import { ThemeSwitcher } from '../../components/ThemeSwitcher/ThemeSwitcher'

interface Props {
  theme: Theme
  engine: WorldEngine
  activeThemeId: string
  switching: boolean
  onSelectTheme: (id: string) => void
}

/**
 * The hero is the office. Copy is laid out around the world rather than
 * stacked above it, so the page reads as a window into a room instead of a
 * marketing page that happens to contain a picture.
 */
export function Hero({
  theme,
  engine,
  activeThemeId,
  switching,
  onSelectTheme
}: Props) {
  return (
    <section id="top" className="px-6 pb-20 pt-10">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 border-[3px] border-ink bg-paper px-3 py-1 font-pixel text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
              <span className="blink text-brand-deep" aria-hidden>
                ●
              </span>
              {theme.name} — Live
            </p>
            <h1 className="font-heading text-5xl font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-7xl">
              Your AI team is
              <br />
              already at work.
            </h1>
          </div>

          <p className="max-w-md font-pixel text-lg leading-relaxed text-ink-3 lg:pb-2">
            Backstage turns your AI agents into characters that work,
            collaborate and get things done inside a world you can actually
            see.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <ThemeSwitcher
            activeId={activeThemeId}
            onSelect={onSelectTheme}
            disabled={switching}
          />
          <p className="font-pixel text-xs text-ink-3">{theme.tagline}</p>
        </div>

        <World theme={theme} engine={engine} switching={switching} />

        <div className="mt-16 flex flex-col items-center gap-7 sm:flex-row sm:justify-center sm:gap-12">
          <p className="text-center font-pixel text-2xl font-bold uppercase leading-tight tracking-[0.02em] text-ink sm:text-left sm:text-3xl">
            Stop watching terminals.
            <br />
            <span className="text-brand-deep">Start watching your AI work.</span>
          </p>
          <PixelButton>Get Started</PixelButton>
        </div>
      </div>
    </section>
  )
}
