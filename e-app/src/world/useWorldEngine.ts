import { useEffect, useMemo } from 'react'
import { teamRuntime } from '../agents/team'
import { getTheme } from '../themes'
import { WorldEngine } from './engine/WorldEngine'

/**
 * A world engine for the active theme, sharing the one team runtime.
 *
 * The engine is per-theme because it bakes that theme's sprite sheets and
 * props once at construction — that is what keeps the render loop down to
 * blits. The runtime it reads from is global, so rebuilding the engine
 * swaps the set without disturbing the agents standing on it.
 */
export function useWorldEngine(themeId: string) {
  const theme = useMemo(() => getTheme(themeId), [themeId])
  const engine = useMemo(() => new WorldEngine(theme, teamRuntime), [theme])

  useEffect(() => () => engine.stop(), [engine])

  return { theme, engine }
}
