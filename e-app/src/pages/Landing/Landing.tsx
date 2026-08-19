import { useSyncExternalStore } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useWorldEngine } from '../../world/useWorldEngine'
import { Header } from '../../components/Header/Header'
import { PixelButton } from '../../components/Button/PixelButton'
import { Hero } from './Hero'
import { TeamSection } from './TeamSection'
import { WorkSection } from './WorkSection'
import { ThemesSection } from './ThemesSection'

export function Landing() {
  const themeId = useBackstage((s) => s.themeId)
  const switching = useBackstage((s) => s.switching)
  const switchTo = useBackstage((s) => s.switchTheme)
  const enterApp = useBackstage((s) => s.enterApp)
  const { theme, engine } = useWorldEngine(themeId)

  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)

  return (
    <div className="min-h-full bg-cream">
      <Header />
      <main>
        <Hero
          theme={theme}
          engine={engine}
          activeThemeId={themeId}
          switching={switching}
          onSelectTheme={switchTo}
        />
        <TeamSection theme={theme} agents={agents} />
        <WorkSection theme={theme} />
        <ThemesSection
          activeThemeId={themeId}
          switching={switching}
          onSelectTheme={switchTo}
        />

        <section className="border-t-[3px] border-ink px-6 py-20">
          <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-6 text-center">
            <h2 className="max-w-[760px] font-ui text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.04em] text-ink sm:text-5xl">
              Give your AI agents a place to work.
            </h2>
            <p className="max-w-[520px] font-ui text-[17px] leading-[1.6] text-ink-3">
              Walk backstage and find your team already working without you.
            </p>
            <PixelButton className="mt-2" onClick={enterApp}>
              Get Started
            </PixelButton>
          </div>
        </section>
      </main>

      <footer className="border-t-[3px] border-ink bg-ink px-6 py-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <p className="font-pixel text-xl font-bold uppercase tracking-[-0.01em] text-brand">
            Backstage
          </p>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-dim">
            {theme.name} · {theme.characters.length} AGENTS · SIMULATED
          </p>
        </div>
      </footer>
    </div>
  )
}
