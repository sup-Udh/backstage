import { themeList } from '../../themes'
import { useProject } from '../../stores/projectStore'
import { ThemePreview } from '../../world/ThemePreview'

/**
 * The project's world, changeable after the fact.
 *
 * This used to be a top-level Themes page with a global switch behind it. It
 * is a project setting now, and lives inside Account with the rest of them —
 * a theme belongs to one project, so offering it as a navigation item was
 * offering to change one project's world from inside another's.
 *
 * Changing it rewrites the roster too, because a roster names characters from
 * one world and means nothing in another. That is why this warns rather than
 * switching on the first click: the agents keep their models, permissions,
 * instructions and conversations, but they are played by different people
 * afterwards.
 */
export function ThemePanel() {
  const project = useProject((s) => s.project)
  const switching = useProject((s) => s.switching)
  const changeTheme = useProject((s) => s.changeTheme)

  if (!project) return null

  return (
    <section>
      <h2 className="font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        World
      </h2>
      <p className="mt-2 max-w-[640px] font-ui text-[13px] leading-[1.6] text-ink-3">
        The world this project happens in. Your agents keep their model,
        permissions and conversations when it changes — only who they are
        portrayed by changes with it.
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {themeList.map((t) => {
          const active = t.id === project.themeId
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              disabled={switching || active}
              onClick={() => changeTheme(t.id)}
              className={[
                'group border-[3px] border-ink text-left transition-transform duration-75',
                active
                  ? 'bg-paper shadow-[4px_4px_0_0_var(--color-brand-shadow)]'
                  : 'bg-paper/70 shadow-[4px_4px_0_0_var(--color-shadow)] enabled:hover:-translate-x-px enabled:hover:-translate-y-px enabled:hover:bg-paper',
                switching ? 'opacity-60' : ''
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
                  <h3 className="font-pixel text-base font-bold uppercase leading-none tracking-[0.04em] text-ink">
                    {t.name}
                  </h3>
                  <span
                    className={`shrink-0 border-2 px-2 py-0.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] ${
                      active
                        ? 'border-ink bg-brand text-on-brand'
                        : 'border-rule text-ink-3 group-hover:border-ink group-hover:text-ink'
                    }`}
                  >
                    {active ? 'Current' : 'Move here'}
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
    </section>
  )
}
