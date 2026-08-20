/**
 * The wordmark. Drawn as SVG rects with crispEdges so it stays on the pixel
 * grid at every zoom level, matching the canvas art rather than approximating
 * it with a font glyph or an icon set.
 */
export function PixelMark({ size = 28 }: { size?: number }) {
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
