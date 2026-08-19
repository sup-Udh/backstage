import { useEffect, useMemo } from 'react'
import type { AgentRuntime } from '../agents/agent.types'
import { teamRuntime } from '../agents/team'
import { getTheme } from '../themes'
import { WorldEngine } from './engine/WorldEngine'

/**
 * A world engine for the active theme.
 *
 * The engine is per-theme because it bakes that theme's sprite sheets and
 * props once at construction — that is what keeps the render loop down to
 * blits. The runtime is a parameter so the same world can be driven by the
 * real team in the workspace or by the showcase on the landing page; the
 * renderer cannot tell the difference.
 */
export function useWorldEngine(themeId: string, runtime: AgentRuntime = teamRuntime) {
  const theme = useMemo(() => getTheme(themeId), [themeId])
  const engine = useMemo(() => new WorldEngine(theme, runtime), [theme, runtime])

  useEffect(() => () => engine.stop(), [engine])

  return { theme, engine }
}
