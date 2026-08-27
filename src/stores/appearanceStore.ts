import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Light or dark, for the whole application.
 *
 * This is deliberately *not* a second theme system. Backstage already has one
 * — worlds, in `src/themes` — and that one answers a different question: which
 * office the agents work in, chosen per project, rendered into a canvas. This
 * answers whether the product around that canvas is paper or midnight, and it
 * owns exactly one piece of state to do it: a `data-appearance` attribute on
 * `<html>`.
 *
 * Every colour decision behind that attribute lives in `index.css` as a token
 * override. No component here or anywhere else branches on the appearance, and
 * that is the property worth protecting: `bg-paper text-ink border-ink` is
 * already correct in both, so nothing had to grow a `dark:` variant and there
 * is no second palette to keep in step with the first.
 *
 * Three modes rather than two. `system` is the default and is a real state, not
 * "light unless told otherwise" — a user who has never opened the toggle should
 * follow their desktop when it changes at sunset, and one who has chosen should
 * stay chosen. Collapsing the two would make the first launch a silent, and
 * permanent, vote for light.
 */

export type AppearanceMode = 'system' | 'light' | 'dark'
/** What is actually on screen, once `system` has been resolved. */
export type Appearance = 'light' | 'dark'

/**
 * Where the preference is kept.
 *
 * `localStorage` rather than the main process, unlike authentication and the
 * provider keys. Those are secrets and identity; this is a display preference
 * that has to be readable *before the first paint* to avoid a flash, and an
 * IPC round trip cannot be. It is also worth nothing to an attacker and means
 * nothing on another machine.
 */
const KEY = 'backstage.appearance'

const QUERY = '(prefers-color-scheme: dark)'

function systemAppearance(): Appearance {
  // Both `?.`s matter: a host with no `matchMedia` at all, and the optional
  // call returning undefined rather than a MediaQueryList.
  return window.matchMedia?.(QUERY)?.matches ? 'dark' : 'light'
}

function readMode(): AppearanceMode {
  try {
    const saved = window.localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    // Storage can be unavailable. `system` is always a valid answer.
  }
  return 'system'
}

export function resolveAppearance(mode: AppearanceMode): Appearance {
  return mode === 'system' ? systemAppearance() : mode
}

/**
 * Stamp the resolved appearance on the document.
 *
 * Called at module load — before React renders anything — as well as on every
 * change, which is what keeps requirement 28's "no flash" promise honest for
 * the appearance as well as for the session: the first frame is already the
 * right colour rather than being corrected a tick later.
 */
function apply(appearance: Appearance): void {
  document.documentElement.dataset.appearance = appearance
}

const INITIAL_MODE = readMode()
const INITIAL_APPEARANCE = resolveAppearance(INITIAL_MODE)
apply(INITIAL_APPEARANCE)

interface AppearanceState {
  mode: AppearanceMode
  /** What is on screen. Equal to `mode` unless `mode` is `system`. */
  appearance: Appearance
  setMode: (mode: AppearanceMode) => void
  /**
   * The toggle's click.
   *
   * Light and dark only. `system` is reachable from the menu but is not part
   * of the cycle: a two-state control that silently has three states is one
   * where clicking twice does not get you back where you were.
   */
  toggle: () => void
  /** The system changed its mind, and we are following it. */
  syncSystem: () => void
}

export const useAppearance = create<AppearanceState>((set, get) => ({
  mode: INITIAL_MODE,
  appearance: INITIAL_APPEARANCE,

  setMode: (mode) => {
    const appearance = resolveAppearance(mode)
    try {
      window.localStorage.setItem(KEY, mode)
    } catch {
      // Not persisting is survivable; not applying is not.
    }
    apply(appearance)
    set({ mode, appearance })
  },

  toggle: () => get().setMode(get().appearance === 'dark' ? 'light' : 'dark'),

  syncSystem: () => {
    if (get().mode !== 'system') return
    const appearance = systemAppearance()
    if (appearance === get().appearance) return
    apply(appearance)
    set({ appearance })
  }
}))

/**
 * Follow the desktop while the mode is `system`.
 *
 * Mounted once at the root, beside the auth bridge, so the whole application
 * changes with the operating system rather than only whichever screen happens
 * to be listening. The listener stays attached in every mode — it is a few
 * bytes, and `syncSystem` is the thing that decides whether to act — so
 * switching back to `system` starts following again immediately instead of on
 * the next reload.
 */
export function useAppearanceBridge(): void {
  useEffect(() => {
    const media = window.matchMedia?.(QUERY)
    if (!media) return

    const onChange = () => useAppearance.getState().syncSystem()
    media.addEventListener('change', onChange)
    // The system may have changed while the app was closed.
    onChange()
    return () => media.removeEventListener('change', onChange)
  }, [])
}
