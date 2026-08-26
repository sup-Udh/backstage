import { useEffect, useState } from 'react'
import { themeOrder } from '../../themes'

/**
 * A world that changes on its own.
 *
 * The login page cycles through every theme Backstage ships rather than
 * sitting in the Detective Office, because the office behind the card is the
 * product's only argument at that moment: one room says "there is a world in
 * here", six say "there are worlds in here, and you pick". The landing page
 * makes the same point with a switcher the user clicks; here there is nothing
 * to click, so it makes it by itself.
 *
 * The change is staged rather than instant — veil, swap behind it, lift —
 * which is exactly what `Landing.switchTo` and `projectStore.changeTheme` do,
 * and for the same reason: a theme swap is a whole new sprite sheet, a new
 * palette and a new cast appearing in one frame, and unveiled it reads as a
 * glitch rather than as a scene change.
 *
 *   0ms    veil starts closing
 *   220ms  theme swaps behind it, fully hidden
 *   280ms  veil lifts on the new room
 *
 * Returns the theme to render and whether the veil is down, so the caller can
 * drive both the engine and the dissolve from one source.
 */

/** How long each world is on screen, veil included. */
const DWELL_MS = 5000
/** How long the veil takes to close, and how long the swap hides behind it. */
const VEIL_MS = 220
/** A beat after the swap before lifting, so the new room is drawn first. */
const SETTLE_MS = 60

export function useRotatingWorld(): { themeId: string; switching: boolean } {
  const [index, setIndex] = useState(0)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    /*
     * Somebody who has asked their system for less motion gets one room and
     * no transitions. The world is decoration on this page — the theme's name
     * is written out beneath the card either way — so holding it still costs
     * them nothing, and a page that dissolves every five seconds is precisely
     * what that preference exists to switch off.
     */
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (reduced?.matches) return

    /*
     * Timers are tracked and cleared together. The swap is a chain of nested
     * timeouts, and unmounting mid-chain — which happens the moment sign-in
     * succeeds and this page is replaced — would otherwise leave two pending
     * callbacks setting state on a component that no longer exists.
     */
    let live = true
    const timers: number[] = []

    const after = (ms: number, fn: () => void) => {
      timers.push(
        window.setTimeout(() => {
          if (live) fn()
        }, ms)
      )
    }

    const tick = window.setInterval(() => {
      setSwitching(true)
      after(VEIL_MS, () => {
        setIndex((i) => (i + 1) % themeOrder.length)
        after(SETTLE_MS, () => setSwitching(false))
      })
    }, DWELL_MS)

    return () => {
      live = false
      window.clearInterval(tick)
      for (const t of timers) window.clearTimeout(t)
    }
  }, [])

  return { themeId: themeOrder[index] ?? themeOrder[0], switching }
}
