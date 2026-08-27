import { useCallback, useState } from 'react'
import { useWorldEngine } from '../../world/useWorldEngine'
import { defaultThemeId, isKnownTheme } from '../../themes'
import { showcaseRuntime } from '../../agents/showcase'
import { StartNav } from './StartNav'
import { StartHero } from './StartHero'
import { QuickStart } from './QuickStart'
import { Capabilities } from './Capabilities'
import { TeamShowcase } from './TeamShowcase'
import { WorldsShowcase } from './WorldsShowcase'
import { StartFooter } from './StartFooter'

/**
 * Home — the screen Backstage opens on.
 *
 * Not a marketing page, and this is the distinction the whole redesign turns
 * on. Nobody arrives here from a search engine; they have already downloaded a
 * desktop application and double-clicked it. So the questions it answers are a
 * new user's real ones, in the order they are asked: what is this, what can I
 * do with it, and where do I start. Five sections, one screenful before the
 * fold, and one action more prominent than everything else on it.
 *
 * It is also the screen a signed-in user never sees. `App` and `useAuthGuard`
 * send an authenticated session straight to its projects — requirements 18 and
 * 41 — so everything here can be written for somebody with no account, no
 * projects and no agents, without a single branch for the case where they have
 * some. There is no path by which a real project could appear on this page,
 * which is what makes requirement 35's separation of demo and real data a
 * property of the routing rather than a rule this file has to remember.
 *
 * ---------------------------------------------------------------------------
 *
 * The office runs here for the same reason it runs on the login page: the
 * product's claim is that you can watch your agents work, and a start screen
 * that illustrates it with a static image is arguing against itself. What
 * changed is the proportion. It is a panel in the hero's second column now,
 * capped in height, with its statuses written out in text beside it — product
 * first, pixel world second, decoration third.
 */

/**
 * An empty roster, which `projectCast` reads as "the whole cast".
 *
 * A module constant rather than an inline `[]` so the world engine's memo sees
 * a stable reference and does not rebake every sprite sheet on each render.
 */
const EVERYONE: string[] = []

/** How long the veil stays down while a world is swapped behind it. */
const VEIL_MS = 220
/** A beat after the swap, so the new room is drawn before the veil lifts. */
const SETTLE_MS = 60

export function StartScreen() {
  /*
   * The world being browsed, held locally.
   *
   * Deliberately not a project setting and not global state. This screen is a
   * shop window — flicking between worlds is what the section at the bottom is
   * *for* — and a project's world is chosen during its setup. Sharing one
   * value between the two is how looking at The Branch on the way in used to
   * change the world of the project you then walked into.
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
        window.setTimeout(() => setSwitching(false), SETTLE_MS)
      }, VEIL_MS)
    },
    [themeId]
  )

  /*
   * The office here is a showcase, not the real team: always populated, always
   * busy, never calling a provider. It shows the theme's whole cast, which an
   * empty roster is exactly what `projectCast` falls back to.
   */
  const { theme, engine } = useWorldEngine(themeId, EVERYONE, showcaseRuntime)

  return (
    /*
     * `overflow-x-hidden` on the scroll container rather than trusting every
     * child. This is an Electron window a user can drag to 1000px wide, and a
     * start screen that scrolls sideways at that size is the most obvious kind
     * of broken there is — requirement 25. Every section below is a max-width
     * container with its own padding, so this should never fire; it is here so
     * that a future one getting it wrong degrades to a clipped edge rather
     * than to a horizontal scrollbar under the whole application.
     */
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden bg-cream">
      <StartNav mascot={theme.characters[0]} />

      <main className="flex-1">
        <StartHero theme={theme} engine={engine} switching={switching} />
        <QuickStart />
        <Capabilities theme={theme} />
        <TeamShowcase theme={theme} />
        <WorldsShowcase
          activeThemeId={themeId}
          switching={switching}
          onSelectTheme={switchTo}
        />
      </main>

      <StartFooter themeName={theme.name} castSize={theme.characters.length} />
    </div>
  )
}
