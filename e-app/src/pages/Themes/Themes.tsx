import { themeList } from '../../themes'
import { useBackstage } from '../../stores/backstageStore'
import { ThemePreview } from '../../world/ThemePreview'
import { PagePlaceholder } from '../shell/PagePlaceholder'

/**
 * World selection, driven by the same global theme state the workspace reads,
 * so choosing here changes the office you walk back into.
 */
export function Themes() {
  const themeId = useBackstage((s) => s.themeId)
  const switching = useBackstage((s) => s.switching)
  const switchTheme = useBackstage((s) => s.switchTheme)
  const setPage = useBackstage((s) => s.setPage)

  return (
    <PagePlaceholder
      title="Themes"
      lead="Your agents keep their model, their task and their status when the set changes."
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {themeList.map((t) => {
          const active = t.id === themeId
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              disabled={switching}
              onClick={() => {
                switchTheme(t.id)
                setPage('home')
              }}
              className={[
                'group border-[3px] border-ink text-left transition-transform duration-75',
                active
                  ? 'bg-paper shadow-[4px_4px_0_0_var(--color-brand-shadow)]'
                  : 'bg-paper/70 shadow-[4px_4px_0_0_var(--color-ink)] hover:-translate-x-px hover:-translate-y-px hover:bg-paper'
              ].join(' ')}
            >
              <div
                className="flex justify-center overflow-hidden border-b-[3px] border-ink"
                style={{ background: t.palette.wall }}
              >
                <ThemePreview theme={t} scale={2} />
              </div>
              <div className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-pixel text-base font-bold uppercase leading-none tracking-[0.04em] text-ink">
                    {t.name}
                  </h2>
                  <span
                    className={`shrink-0 border-2 px-2 py-0.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] ${
                      active
                        ? 'border-ink bg-brand text-ink'
                        : 'border-rule text-ink-3 group-hover:border-ink group-hover:text-ink'
                    }`}
                  >
                    {active ? 'Active' : 'Enter'}
                  </span>
                </div>
                <p className="mt-2.5 font-ui text-sm leading-[1.5] text-ink-3">
                  {t.tagline}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </PagePlaceholder>
  )
}
