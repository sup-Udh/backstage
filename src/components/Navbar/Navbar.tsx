import { useBackstage, type PageId } from '../../stores/backstageStore'
import { useProject, useProjectTheme } from '../../stores/projectStore'
import { PixelMark } from '../Header/PixelMark'
import { AccountMenu } from './AccountMenu'
import { AppearanceToggle } from '../Appearance/AppearanceToggle'

/**
 * The pages inside a project.
 *
 * There is no Themes item. A theme is chosen when the project is created and
 * belongs to it thereafter — a global switch in the navigation would let one
 * project's world be changed from inside another's, which is the leak this
 * whole model exists to close. Changing it later lives in Account, beside the
 * rest of the project's settings.
 */
const PAGES: { id: PageId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'cases', label: 'Cases' },
  { id: 'agents', label: 'Agents' },
  { id: 'automations', label: 'Automations' }
]

/**
 * The workspace navigation. Deliberately the same height and border weight as
 * the landing header so entering the app reads as walking through a door in
 * the same building rather than arriving at a different product.
 */
export function Navbar() {
  const page = useBackstage((s) => s.page)
  const setPage = useBackstage((s) => s.setPage)
  const showProjects = useBackstage((s) => s.showProjects)
  const project = useProject((s) => s.project)
  const theme = useProjectTheme()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b-[3px] border-ink bg-cream px-5">
      <div className="flex items-center gap-8">
        {/*
          The wordmark goes to the project list, not to Home. Home is for
          people without an account, and this bar only exists inside one — so
          the only place "up" can mean is the list of everything you own. It
          used to lead to Home, which for a signed-in user is now a screen the
          guard immediately bounces them off.
        */}
        <button
          type="button"
          onClick={showProjects}
          title="Back to your projects"
          className="flex items-center gap-3"
        >
          <PixelMark />
          <span className="font-pixel text-xl font-bold uppercase tracking-[-0.01em] text-ink">
            Backstage
          </span>
        </button>

        {/*
          Which project, and which world it happens in.

          Permanently on screen rather than tucked into settings: every page
          below this bar shows only one project's agents, cases and
          conversations, and the user has to be able to tell at a glance which
          one that is. It doubles as the way into the project's own settings.
        */}
        {project && (
          <button
            type="button"
            onClick={() => setPage('account')}
            title="Project settings"
            className="flex items-baseline gap-2 border-2 border-ink bg-paper px-2.5 py-1 transition-colors hover:bg-brand-pale"
          >
            <span className="font-pixel text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
              {project.name}
            </span>
            <span aria-hidden className="text-rule">
              ·
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              {theme.name}
            </span>
          </button>
        )}

        <nav className="flex items-center gap-1">
          {PAGES.map((item) => {
            const active = item.id === page
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setPage(item.id)}
                className={[
                  'relative px-3 py-2 font-ui text-sm font-semibold transition-colors',
                  active ? 'text-ink' : 'text-ink-3 hover:text-ink'
                ].join(' ')}
              >
                {item.label}
                {/* A hard 3px underline rather than a pill: it matches the
                    pixel borders used everywhere else in the product. */}
                <span
                  aria-hidden
                  className={`absolute inset-x-2 -bottom-[3px] h-[3px] ${
                    active ? 'bg-brand' : 'bg-transparent'
                  }`}
                />
              </button>
            )
          })}
        </nav>
      </div>

      {/*
        The account, which used to be a settings shortcut with a hard-coded
        letter U for an avatar. It now shows who is actually signed in — the
        Google name and picture — and holds the sign-out.
      */}
      <div className="flex items-center gap-2.5">
        <AppearanceToggle />
        <AccountMenu />
      </div>
    </header>
  )
}
