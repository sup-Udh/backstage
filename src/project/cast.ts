import type { CharacterDef } from '../characters/character.types'
import type { Theme } from '../themes/types'

/**
 * Who is in this project.
 *
 * A theme ships a full cast — the detective bureau has eight people — and a
 * project uses some of them. Every surface used to read `theme.characters`
 * directly, which is why all eight appeared everywhere and why a project could
 * show a face nobody had chosen.
 *
 * This is the one place that answers "who is in the room", and everything that
 * names, draws, casts or lists a character goes through it: the world, the
 * worker list, the chat header, the roster page, the spawn dialog, the
 * inspector and the case list. A character that is not in the returned array
 * cannot appear anywhere, because there is no other route to one.
 */

/**
 * The project's cast, in the order the user picked it.
 *
 * Unknown ids are dropped rather than repaired: a roster naming a character
 * this theme does not have is a record left over from a different world, and
 * inventing a substitute would put a stranger in the office.
 *
 * An empty result falls back to the theme's whole cast, which happens in
 * exactly one situation — the project's theme was changed and its roster still
 * names the old world's characters. A world with nobody in it is a broken
 * screen; a world with the new theme's default cast is a recoverable one, and
 * the settings page rewrites the roster the moment the user looks at it.
 */
export function projectCast(theme: Theme, roster: readonly string[]): CharacterDef[] {
  if (roster.length === 0) return theme.characters

  const byId = new Map(theme.characters.map((c) => [c.id, c]))
  const chosen = roster
    .map((id) => byId.get(id))
    .filter((c): c is CharacterDef => c !== undefined)

  return chosen.length > 0 ? chosen : theme.characters
}

/**
 * Which character an agent's slot refers to.
 *
 * The wrap is defensive rather than expected. A slot should always be a valid
 * index — the roster is seeded with one agent per character and migration
 * re-seats everyone — but a roster can be shortened in settings while agents
 * still point past its end, and an agent with no body cannot be rendered,
 * selected or talked to. Wrapping means two agents may share a face, which is
 * visibly odd and recoverable; returning nothing is neither.
 */
export function castForSlot(cast: CharacterDef[], slot: number): CharacterDef {
  return cast[((slot % cast.length) + cast.length) % cast.length]
}

/** The character's name for a slot, which is what most surfaces actually want. */
export function castNameForSlot(cast: CharacterDef[], slot: number): string {
  return castForSlot(cast, slot).name
}
