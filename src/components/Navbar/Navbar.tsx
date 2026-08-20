import { useBackstage, type PageId } from '../../stores/backstageStore'
import { PixelMark } from '../Header/PixelMark'

const PAGES: { id: PageId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'cases', label: 'Cases' },
  { id: 'agents', label: 'Agents' },
  { id: 'automations', label: 'Automations' },
  { id: 'themes', label: 'Themes' }
]

/**
 * The workspace navigation. Deliberately the same height and border weight as
 * the landing header so entering the app reads as walking through a door in
 * the same building rather than arriving at a different product.
 */
export function Navbar() {
  const page = useBackstage((s) => s.page)
  const setPage = useBackstage((s) => s.setPage)
  const exitToLanding = useBackstage((s) => s.exitToLanding)

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b-[3px] border-ink bg-cream px-5">
      <div className="flex items-center gap-8">
        <button
          type="button"
          onClick={exitToLanding}
          title="Back to the landing page"
          className="flex items-center gap-3"
        >
          <PixelMark />
          <span className="font-pixel text-xl font-bold uppercase tracking-[-0.01em] text-ink">
            Backstage
          </span>
        </button>

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

      <button
        type="button"
        onClick={() => setPage('account')}
        aria-current={page === 'account' ? 'page' : undefined}
        className={[
          'flex items-center gap-2 border-2 px-2.5 py-1.5 transition-colors',
          page === 'account'
            ? 'border-ink bg-brand text-ink'
            : 'border-ink bg-paper text-ink-3 hover:bg-brand-pale hover:text-ink'
        ].join(' ')}
      >
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center border-2 border-ink bg-brand font-pixel text-[10px] font-bold text-ink"
        >
          U
        </span>
        <span className="font-pixel text-xs font-semibold uppercase tracking-[0.06em]">
          Connections
        </span>
      </button>
    </header>
  )
}
