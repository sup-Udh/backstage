import type { Theme } from '../../themes/types'
import { CharacterSprite } from '../../world/CharacterSprite'

interface Props {
  theme: Theme
}

/**
 * The idea of a team, shown as four of them.
 *
 * These are characters, not agents. Nobody here is configured, spawned, or
 * connected to a provider — they are the cast of whichever world is currently
 * being browsed above, and they change when that changes. Requirement 13 is
 * blunt about not hard-coding them as real agents, and the way to be sure of
 * that is to take them from the theme registry rather than from a list in this
 * file: there is no name written down here to become somebody's actual agent
 * by accident.
 *
 * Four rather than the whole cast. The Detective Office has eight and Backstage
 * ships six worlds, so showing everyone would put up to eight portraits on a
 * start screen that already has an office on it. Four is enough to make the
 * point that a team has roles.
 */

/** How many of the cast to introduce. */
const SHOWN = 4

/**
 * The poses, in the order the cast is drawn.
 *
 * Fixed rather than random, and none of them is `walking`: requirement 22 asks
 * for an office that is alive but not chaotic, and a row of portraits where
 * everybody is mid-stride reads as a screensaver. Each character holds one
 * pose and animates within it.
 */
const POSES = ['working', 'thinking', 'talking', 'idle'] as const

export function TeamShowcase({ theme }: Props) {
  const cast = theme.characters.slice(0, SHOWN)

  return (
    <section
      aria-labelledby="team-heading"
      className="border-t-[3px] border-ink bg-cream-2 px-6 py-14"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2
            id="team-heading"
            className="font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3"
          >
            Your team
          </h2>
          <p className="font-ui text-[13px] text-ink-3">
            The {theme.name} cast. Your project chooses its own.
          </p>
        </div>

        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cast.map((character, i) => (
            <li
              key={character.id}
              className="flex items-center gap-3 border-[3px] border-ink bg-paper px-4 py-3 shadow-[4px_4px_0_0_var(--color-shadow)]"
            >
              <span
                aria-hidden
                className="relative grid h-[64px] w-[48px] shrink-0 place-items-center border-2 border-rule bg-brand-pale"
              >
                {/* A floorline, so the sprite stands on something. */}
                <span className="absolute inset-x-0 bottom-0 h-2 bg-cream-2" />
                <CharacterSprite
                  appearance={character.appearance}
                  state={POSES[i % POSES.length]}
                  scale={2}
                  className="relative"
                />
              </span>

              <span className="min-w-0">
                <span className="block font-pixel text-[15px] font-bold uppercase leading-none tracking-[0.04em] text-ink">
                  {character.name}
                </span>
                <span className="mt-1.5 block font-ui text-[13px] leading-snug text-ink-3">
                  {character.role}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
