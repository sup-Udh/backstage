import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { FakeAgentRuntime } from '../../agents/fakeAgentRuntime'
import { roster } from '../../agents/roster'
import { getTheme } from '../../themes'
import { useTheme } from '../../themes/useTheme'
import { WorldEngine } from '../../world/engine/WorldEngine'
import { Header } from '../../components/Header/Header'
import { PixelButton } from '../../components/Button/PixelButton'
import { Hero } from './Hero'
import { TeamSection } from './TeamSection'
import { WorkSection } from './WorkSection'
import { ThemesSection } from './ThemesSection'

export function Landing() {
  const { themeId, switching, switchTo } = useTheme()
  const theme = useMemo(() => getTheme(themeId), [themeId])

  /*
   * The agent runtime is created once and deliberately outlives every theme
   * change. That is the whole point of the feature: agent-1 keeps its model,
   * its status, its current task and its place in the schedule when the world
   * changes around it. Only the character portraying it differs.
   */
  const runtime = useMemo(() => new FakeAgentRuntime(roster), [])

  /*
   * The engine, by contrast, is per-world: it bakes that theme's sprite
   * sheets and props once at construction, which is what keeps the render
   * loop down to blits. Rebuilding it is the cheapest correct way to swap.
   */
  const engine = useMemo(() => new WorldEngine(theme, runtime), [theme, runtime])

  useEffect(() => () => engine.stop(), [engine])

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
            <h2 className="max-w-3xl font-heading text-4xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-ink sm:text-5xl">
              Give your AI agents a place to work.
            </h2>
            <p className="max-w-xl font-pixel text-lg leading-relaxed text-ink-3">
              Walk backstage and find your team already working without you.
            </p>
            <PixelButton className="mt-2">Get Started</PixelButton>
          </div>
        </section>
      </main>

      <footer className="border-t-[3px] border-ink bg-ink px-6 py-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <p className="font-pixel text-xl font-bold uppercase tracking-[-0.01em] text-brand">
            Backstage
          </p>
          <p className="font-pixel text-xs uppercase tracking-[0.16em] text-dim">
            {theme.name} — {theme.characters.length} agents — Simulated
          </p>
        </div>
      </footer>
    </div>
  )
}
