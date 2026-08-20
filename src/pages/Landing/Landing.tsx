import { useCallback, useState, useSyncExternalStore } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useWorldEngine } from '../../world/useWorldEngine'
import { defaultThemeId, isKnownTheme } from '../../themes'
import { showcaseRuntime } from '../../agents/showcase'
import { Header } from '../../components/Header/Header'
import { PixelButton } from '../../components/Button/PixelButton'
import { Hero } from './Hero'
import { TeamSection } from './TeamSection'
import { WorkSection } from './WorkSection'
import { ThemesSection } from './ThemesSection'

/**
 * An empty roster, which `projectCast` reads as "the whole cast".
 *
 * A module constant rather than an inline `[]` so the world engine's memo sees
 * a stable reference and does not rebake every sprite sheet on each render.
 */
const EVERYONE: string[] = []

export function Landing() {
  const enterApp = useBackstage((s) => s.enterApp)

  /*
   * The world being browsed here, held locally.
   *
   * Deliberately not a project setting and not global state. The landing page
   * is a shop window — flicking between worlds is what it is *for* — and a
   * project's theme is chosen during setup. Sharing one value between the two
   * is how looking at Friends on the way in used to change the world of the
   * project you then walked into.
   */
  const [themeId, setThemeId] = useState(defaultThemeId)
  const [switching, setSwitching] = useState(false)

  /* Veil, commit behind it, lift — so it reads as a scene change. */
  const switchTo = useCallback(
    (id: string) => {
      if (!isKnownTheme(id) || id === themeId) return
      setSwitching(true)
      window.setTimeout(() => {
        setThemeId(id)
        window.setTimeout(() => setSwitching(false), 60)
      }, 220)
    },
    [themeId]
  )

  /*
   * The landing office is a showcase, not the real team: always populated,
   * always busy, never calling a provider. It shows the theme's whole cast,
   * which an empty roster is exactly what `projectCast` falls back to.
   */
  const { theme, engine } = useWorldEngine(themeId, EVERYONE, showcaseRuntime)

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
