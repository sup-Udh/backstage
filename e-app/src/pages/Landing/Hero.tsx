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
            <p className="mb-5 inline-flex items-center gap-2 border-[3px] border-ink bg-paper px-3 py-1 font-pixel text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
              <span className="blink text-brand-deep" aria-hidden>
                ●
              </span>
              {theme.name} — Live
            </p>
            <h1 className="max-w-[760px] font-ui text-5xl font-extrabold uppercase leading-[0.95] tracking-[-0.04em] text-ink sm:text-6xl 2xl:text-7xl">
              Your AI team is
              <br />
              already at work.
            </h1>
          </div>

          <p className="max-w-[520px] font-ui text-[17px] font-normal leading-[1.6] text-ink-3 lg:pb-1">
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
          <p
            className="font-ui text-sm italic text-ink-3 transition-opacity duration-300"
            style={{ opacity: switching ? 0 : 1 }}
          >
            {theme.tagline}
          </p>
        </div>

        <World theme={theme} engine={engine} switching={switching} />

        <div className="mt-16 flex flex-col items-center gap-7 sm:flex-row sm:justify-center sm:gap-12">
          <p className="text-center font-ui text-2xl font-extrabold uppercase leading-[1.1] tracking-[-0.03em] text-ink sm:text-left sm:text-3xl">
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
