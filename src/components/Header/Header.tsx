import { PixelButton } from '../Button/PixelButton'
import { PixelMark } from './PixelMark'
import { useBackstage } from '../../stores/backstageStore'

const NAV = [
  { label: 'About', href: '#work' },
  { label: 'Themes', href: '#themes' },
  { label: 'Agents', href: '#team' }
]

export function Header() {
  const enterApp = useBackstage((s) => s.enterApp)

  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-cream/95 backdrop-blur-none">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-3">
          <PixelMark />
          <span className="font-pixel text-2xl font-bold uppercase tracking-[-0.01em] text-ink">
            Backstage
          </span>
        </a>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-2 font-ui text-sm font-semibold tracking-[0.01em] text-ink-3 transition-colors hover:text-ink"
            >
              {item.label}
            </a>
          ))}
          <PixelButton size="sm" className="ml-3" onClick={enterApp}>
            Get Started
          </PixelButton>
        </nav>
      </div>
    </header>
  )
}
