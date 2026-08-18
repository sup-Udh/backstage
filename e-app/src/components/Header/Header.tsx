import { PixelButton } from '../Button/PixelButton'

/**
 * The wordmark. Drawn as SVG rects with crispEdges so it stays on the pixel
 * grid at every zoom level, matching the canvas art rather than approximating
 * it with a font glyph or an icon set.
 */
function PixelMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x="0" y="1" width="12" height="9" fill="var(--color-ink)" />
      <rect x="1" y="2" width="10" height="7" fill="var(--color-brand)" />
      <rect x="2" y="3" width="6" height="1" fill="var(--color-ink)" />
      <rect x="2" y="5" width="4" height="1" fill="var(--color-ink)" />
      <rect x="2" y="7" width="7" height="1" fill="var(--color-ink)" />
      <rect x="5" y="10" width="2" height="1" fill="var(--color-ink)" />
      <rect x="3" y="11" width="6" height="1" fill="var(--color-ink)" />
    </svg>
  )
}

const NAV = [
  { label: 'About', href: '#work' },
  { label: 'Themes', href: '#themes' },
  { label: 'Agents', href: '#team' }
]

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-cream/95 backdrop-blur-none">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-3">
          <PixelMark />
          <span className="font-pixel text-2xl uppercase tracking-[-0.02em] text-ink">
            Backstage
          </span>
        </a>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-2 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3 transition-colors hover:text-ink"
            >
              {item.label}
            </a>
          ))}
          <PixelButton size="sm" className="ml-3">
            Get Started
          </PixelButton>
        </nav>
      </div>
    </header>
  )
}
