import { useAppearance, type AppearanceMode } from '../../stores/appearanceStore'

/**
 * Light, dark, or whatever the desktop is doing.
 *
 * A segmented control rather than a single cycling button, for one reason: the
 * third state. A button that cycles through three appearances is a button
 * where clicking twice does not undo the first click, and the state nobody can
 * find is always `system` — which is the default, so it is the one a user is
 * most likely to want back. Three cells, three labels, no hidden modes.
 *
 * Glyph-only because it lives in a navigation bar, with real labels on each
 * cell for anyone not reading the glyph. `aria-pressed` rather than a radio
 * group: these are three independent toggles from the assistive-technology
 * point of view, and exactly one is ever pressed.
 */

const OPTIONS: { mode: AppearanceMode; glyph: string; label: string }[] = [
  { mode: 'light', glyph: '☀', label: 'Light' },
  { mode: 'dark', glyph: '☾', label: 'Dark' },
  { mode: 'system', glyph: '◐', label: 'Match system' }
]

export function AppearanceToggle({ className = '' }: { className?: string }) {
  const mode = useAppearance((s) => s.mode)
  const setMode = useAppearance((s) => s.setMode)

  return (
    <div
      role="group"
      aria-label="Appearance"
      className={`flex items-center border-2 border-ink bg-paper ${className}`}
    >
      {OPTIONS.map((option) => {
        const on = option.mode === mode
        return (
          <button
            key={option.mode}
            type="button"
            aria-pressed={on}
            aria-label={option.label}
            title={option.label}
            onClick={() => setMode(option.mode)}
            className={[
              'grid h-[26px] w-[26px] place-items-center text-[13px] leading-none',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep',
              on
                ? 'bg-brand text-on-brand'
                : 'text-ink-3 hover:bg-brand-pale hover:text-ink'
            ].join(' ')}
          >
            <span aria-hidden>{option.glyph}</span>
          </button>
        )
      })}
    </div>
  )
}
