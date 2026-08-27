import { useSyncExternalStore } from 'react'
import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { StatusChip } from '../../components/AgentStatus/StatusChip'
import { CharacterSprite } from '../../world/CharacterSprite'
import { characterStateForAgent } from '../../characters/character.states'

interface Props {
  theme: Theme
  engine: WorldEngine
}

/**
 * What the office is doing, in words.
 *
 * The brief asks for the world to demonstrate that agents actually work —
 * Jane thinking, then delegating, then Cho inspecting, then done. This is that
 * demonstration, and the important thing about it is that it is not scripted.
 * The statuses come off the same runtime driving the canvas next to it, so the
 * line that says THINKING is the reason the character on screen has a hand at
 * her chin. A hand-written ticker would drift from the room within a minute,
 * and then the product's one claim — that you can see what your agents are
 * doing — would be false on the page making it.
 *
 * Three rows, fixed to the first three of the cast. Sorting by activity was
 * the first attempt and it was wrong: rows jumping around every few seconds is
 * an arcade scoreboard, and requirement 9 asks for subtle. Fixed rows whose
 * labels change read as people getting on with things.
 */

/** How many of the cast the relay follows. Enough to show a handover. */
const ROWS = 3

export function AgentRelay({ theme, engine }: Props) {
  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)
  const cast = theme.characters.slice(0, ROWS)

  return (
    <section
      aria-label="Simulated agent activity"
      className="border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]"
    >
      <header className="flex items-baseline justify-between gap-3 border-b-2 border-rule px-3 py-2">
        <h2 className="font-pixel text-[11px] font-bold uppercase tracking-[0.1em] text-ink">
          Live in the office
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3">
          Simulated
        </span>
      </header>

      {/*
        `aria-live` off, deliberately. These lines change every few seconds and
        announcing each one would turn an ambient illustration into a screen
        reader talking over the user continuously. The section is labelled and
        readable on demand, which is the right level of attention for
        decoration that happens to be true.
      */}
      <ul className="divide-y-2 divide-rule">
        {cast.map((character) => {
          const agent = agents.find((a) => a.characterId === character.id)
          const status = agent?.status ?? 'idle'
          return (
            <li key={character.id} className="flex items-center gap-3 px-3 py-2">
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-end justify-center overflow-hidden border-2 border-rule bg-brand-pale"
              >
                <CharacterSprite
                  appearance={character.appearance}
                  /*
                   * The same status-to-pose mapping the world uses, so the
                   * portrait beside a THINKING label is the thinking pose and
                   * not a generic headshot.
                   */
                  state={characterStateForAgent(status)}
                  scale={2}
                  className="translate-y-[6px]"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-pixel text-[13px] font-bold uppercase leading-none tracking-[0.04em] text-ink">
                  {agent?.name ?? character.name}
                </span>
                <span className="mt-1 block truncate font-ui text-[12px] leading-none text-ink-3">
                  {agent?.task ?? character.role}
                </span>
              </span>

              <StatusChip status={status} className="shrink-0" />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
