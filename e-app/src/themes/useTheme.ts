import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultThemeId, isKnownTheme } from './index'

const STORAGE_KEY = 'backstage.theme'

/** Fade the world out, swap, fade back in. Kept short on purpose. */
const VEIL_IN_MS = 220
const VEIL_HOLD_MS = 60

function loadThemeId(): string {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isKnownTheme(saved)) return saved as string
  } catch {
    // Storage can be unavailable; the default is always a valid fallback.
  }
  return defaultThemeId
}

function saveThemeId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Persisting is a convenience, never a requirement.
  }
}

export interface ThemeController {
  themeId: string
  /** True while the world is veiled mid-swap. */
  switching: boolean
  switchTo: (id: string) => void
}

/**
 * Owns which world is active.
 *
 * The swap is deliberately staged rather than instant: the veil drops, the
 * theme commits behind it, then the veil lifts on the new room. That reads as
 * walking into another set rather than as a React re-render.
 *
 * The selection is read from localStorage on first render, so a returning
 * user lands straight in their world with no flash of the default.
 */
export function useTheme(): ThemeController {
  const [themeId, setThemeId] = useState(loadThemeId)
  const [switching, setSwitching] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending) window.clearTimeout(t)
    }
  }, [])

  const switchTo = useCallback(
    (id: string) => {
      if (id === themeId || !isKnownTheme(id)) return
      setSwitching(true)
      timers.current.push(
        window.setTimeout(() => {
          setThemeId(id)
          saveThemeId(id)
          // One more beat so the new world has painted before the veil lifts.
          timers.current.push(
            window.setTimeout(() => setSwitching(false), VEIL_HOLD_MS)
          )
        }, VEIL_IN_MS)
      )
    },
    [themeId]
  )

  return { themeId, switching, switchTo }
}
