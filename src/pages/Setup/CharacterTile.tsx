import type { CharacterDef } from '../../characters/character.types'
import { CharacterSprite } from '../../world/CharacterSprite'

interface Props {
  character: CharacterDef
  selected: boolean
  /** Shown as the team lead rather than merely selected. */
  lead?: boolean
  /** Marks the tile as a radio rather than a checkbox, for the lead step. */
  single?: boolean
  disabled?: boolean
  onToggle: () => void
}

/**
 * One character, pickable.
 *
 * Deliberately not `CharacterCard`: that one reports a live agent's model and
 * status, and during setup neither exists yet — the character is not portraying
 * anybody until the project is created. This shows only what the choice is
 * about, which is who they are and what they look like.
 */
export function CharacterTile({
  character,
  selected,
  lead = false,
  single = false,
  disabled = false,
  onToggle
}: Props) {
  return (
    <button
      type="button"
      role={single ? 'radio' : 'checkbox'}
      aria-checked={selected}
      disabled={disabled}
      onClick={onToggle}
      className={[
        'group relative flex flex-col items-stretch border-[3px] text-left transition-transform duration-75',
        'disabled:cursor-default disabled:opacity-40',
        selected
          ? 'border-ink bg-paper shadow-[4px_4px_0_0_var(--color-brand-shadow)]'
          : 'border-rule bg-paper/60 shadow-[4px_4px_0_0_transparent] enabled:hover:-translate-x-px enabled:hover:-translate-y-px enabled:hover:border-ink enabled:hover:bg-paper'
      ].join(' ')}
    >
      <div
        className={[
          'relative flex h-[112px] items-end justify-center border-b-[3px]',
          selected ? 'border-ink bg-brand-pale' : 'border-rule bg-cream-2'
        ].join(' ')}
      >
        <div className="absolute inset-x-0 bottom-0 h-6 bg-cream-2" />
        <div className="absolute bottom-[20px] h-1.5 w-10 bg-ink/15" />
        <CharacterSprite
          appearance={character.appearance}
          state="idle"
          facing="down"
          scale={3}
          className="relative mb-4"
        />

        {/*
          The mark sits on the plate rather than beside the name, so a grid of
          eight reads as "these three are chosen" at a glance.
        */}
        <span
          aria-hidden
          className={[
            'absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center border-2 font-pixel text-[10px] font-bold',
            selected
              ? 'border-ink bg-brand text-ink'
              : 'border-rule bg-cream text-transparent'
          ].join(' ')}
        >
          {lead ? '★' : '✓'}
        </span>
      </div>

      <div className="px-3 py-2">
        <p className="font-pixel text-sm font-bold uppercase leading-none tracking-[0.04em] text-ink">
          {character.name}
        </p>
        <p className="mt-1.5 font-ui text-[12px] leading-tight text-ink-3">
          {character.role}
        </p>
      </div>
    </button>
  )
}
