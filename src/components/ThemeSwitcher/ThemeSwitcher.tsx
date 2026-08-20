import { themeList } from '../../themes'

interface Props {
  activeId: string
  onSelect: (id: string) => void
  disabled?: boolean
  className?: string
}

/**
 * The world selector.
 *
 * Deliberately a single quiet row above the frame rather than a panel: the
 * point is that the office is the star and the worlds are a property of it.
 * It reads from the registry, so a newly registered theme appears here with
 * no change to this component.
 */
export function ThemeSwitcher({
  activeId,
  onSelect,
  disabled = false,
  className = ''
}: Props) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="mr-1 font-pixel text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">
        World
      </span>

      {themeList.map((t) => {
        const active = t.id === activeId
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(t.id)}
            title={t.tagline}
            className={[
              'inline-flex items-center gap-1.5 border-2 px-3 py-1.5',
              'font-pixel text-xs font-semibold uppercase tracking-[0.06em]',
              'transition-transform duration-75 ease-linear',
              'disabled:cursor-default',
              active
                ? 'border-ink bg-brand text-ink shadow-[3px_3px_0_0_var(--color-ink)]'
                : 'border-ink bg-paper text-ink-3 shadow-[2px_2px_0_0_var(--color-ink)] hover:-translate-x-px hover:-translate-y-px hover:bg-brand-pale hover:text-ink'
            ].join(' ')}
          >
            <span aria-hidden className={active ? 'text-ink' : 'text-rule'}>
              {active ? '◉' : '○'}
            </span>
            {t.name}
          </button>
        )
      })}
    </div>
  )
}
