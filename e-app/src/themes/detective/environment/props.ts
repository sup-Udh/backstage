import type { Op } from '../../../world/pixel/ops'
import { makeRng } from '../../../world/pixel/ops'

/**
 * Detective-specific furniture. Everything else this office uses comes from
 * the shared library, so the Mentalist world is composed the same way every
 * other world is.
 */
export * from '../../shared/props'

/**
 * The evidence board. This is the single object that tells the user what
 * kind of office they are looking into, so it gets the most detail.
 */
export function evidenceBoard(x: number, y: number, w: number, h: number): Op[] {
  const ops: Op[] = [
    [x - 3, y - 3, w + 6, h + 6, 'ink'],
    [x - 2, y - 2, w + 4, h + 4, 'woodDark'],
    [x - 1, y - 1, w + 2, h + 2, 'ink'],
    [x, y, w, h, 'cork']
  ]

  // Cork speckle.
  const rng = makeRng(7)
  for (let i = 0; i < 90; i++) {
    ops.push([
      x + Math.floor(rng() * w),
      y + Math.floor(rng() * h),
      1,
      1,
      'corkDark'
    ])
  }

  type Pinned = { dx: number; dy: number; w: number; h: number; kind: string }
  const items: Pinned[] = [
    { dx: 4, dy: 4, w: 14, h: 11, kind: 'card' },
    { dx: 23, dy: 3, w: 12, h: 13, kind: 'photo' },
    { dx: 41, dy: 5, w: 9, h: 9, kind: 'sticky' },
    { dx: 55, dy: 4, w: 13, h: 10, kind: 'card' },
    { dx: 5, dy: 21, w: 13, h: 14, kind: 'photo' },
    { dx: 24, dy: 22, w: 15, h: 11, kind: 'card' },
    { dx: 45, dy: 21, w: 8, h: 8, kind: 'stickyDeep' },
    { dx: 57, dy: 20, w: 11, h: 15, kind: 'photo' }
  ]

  // Red string between pins, drawn under the cards.
  const pins = items.map((i) => ({ x: x + i.dx + (i.w >> 1), y: y + i.dy }))
  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [0, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [1, 5]
  ]
  for (const [a, b] of links) {
    const p = pins[a]
    const q = pins[b]
    const midY = Math.min(p.y, q.y) + 1
    ops.push([Math.min(p.x, q.x), midY, Math.abs(q.x - p.x) + 1, 1, 'rust'])
    ops.push([p.x, Math.min(p.y, midY), 1, Math.abs(p.y - midY) + 1, 'rust'])
    ops.push([q.x, Math.min(q.y, midY), 1, Math.abs(q.y - midY) + 1, 'rust'])
  }

  for (const it of items) {
    const ix = x + it.dx
    const iy = y + it.dy
    ops.push([ix - 1, iy - 1, it.w + 2, it.h + 2, 'ink'])
    if (it.kind === 'sticky') {
      ops.push([ix, iy, it.w, it.h, 'brand'])
      ops.push([ix + 1, iy + 2, it.w - 3, 1, 'brandShadow'])
      ops.push([ix + 1, iy + 4, it.w - 4, 1, 'brandShadow'])
      ops.push([ix + 1, iy + 6, it.w - 2, 1, 'brandShadow'])
    } else if (it.kind === 'stickyDeep') {
      ops.push([ix, iy, it.w, it.h, 'brandDeep'])
      ops.push([ix + 1, iy + 2, it.w - 3, 1, 'brandShadow'])
      ops.push([ix + 1, iy + 5, it.w - 2, 1, 'brandShadow'])
    } else if (it.kind === 'photo') {
      ops.push([ix, iy, it.w, it.h, 'paper'])
      ops.push([ix + 1, iy + 1, it.w - 2, it.h - 4, 'ink2'])
      // A tiny silhouette, so it reads as a surveillance photo.
      const cx = ix + (it.w >> 1)
      ops.push([cx - 1, iy + 3, 3, 3, 'steelDark'])
      ops.push([cx - 2, iy + 6, 5, it.h - 9, 'steelDark'])
    } else {
      ops.push([ix, iy, it.w, it.h, 'paper'])
      for (let l = 0; l < 4; l++) {
        const lw = it.w - 4 - ((l * 3) % 5)
        if (lw > 1) ops.push([ix + 2, iy + 2 + l * 2, lw, 1, 'ink3'])
      }
    }
    // Pin head.
    ops.push([ix + (it.w >> 1), iy - 1, 1, 2, 'ink'])
    ops.push([ix + (it.w >> 1), iy - 1, 1, 1, 'brandLite'])
  }
  return ops
}
