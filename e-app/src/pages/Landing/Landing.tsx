import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { FakeAgentRuntime } from '../../agents/fakeAgentRuntime'
import { roster } from '../../agents/roster'
import { defaultThemeId, getTheme } from '../../themes'
import { WorldEngine } from '../../world/engine/WorldEngine'
import { Header } from '../../components/Header/Header'
import { PixelButton } from '../../components/Button/PixelButton'
import { Hero } from './Hero'
import { TeamSection } from './TeamSection'
import { WorkSection } from './WorkSection'
import { ThemesSection } from './ThemesSection'

export function Landing() {
  const theme = useMemo(() => getTheme(defaultThemeId), [])

  /*
   * The runtime and the engine are created once and live for the lifetime of
   * the page. Neither is React state: the engine mutates its own world every
   * frame and only publishes to React when an agent's status changes.
   */
  const engine = useMemo(() => {
    const runtime = new FakeAgentRuntime(roster)
    return new WorldEngine(theme, runtime)
  }, [theme])

  useEffect(() => () => engine.stop(), [engine])

  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)

  return (
    <div className="min-h-full bg-cream">
      <Header />
      <main>
        <Hero theme={theme} engine={engine} />
        <TeamSection theme={theme} agents={agents} />
        <WorkSection theme={theme} />
        <ThemesSection theme={theme} activeThemeId={theme.id} />

        <section className="border-t-[3px] border-ink px-6 py-20">
          <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-6 text-center">
            <h2 className="max-w-3xl font-pixel text-4xl uppercase leading-[1.05] tracking-[-0.01em] text-ink sm:text-5xl">
              Give your AI agents a place to work.
            </h2>
            <p className="max-w-xl font-mono text-base leading-relaxed text-ink-3">
              Walk backstage and find your team already working without you.
            </p>
            <PixelButton className="mt-2">Get Started</PixelButton>
          </div>
        </section>
      </main>

      <footer className="border-t-[3px] border-ink bg-ink px-6 py-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <p className="font-pixel text-xl uppercase tracking-[-0.01em] text-brand">
            Backstage
          </p>
          <p className="font-pixel text-xs uppercase tracking-[0.16em] text-ink-3">
            {theme.name} — {theme.characters.length} agents — Simulated
          </p>
        </div>
      </footer>
    </div>
  )
}
