import { useEffect, useMemo } from 'react'
import type { AgentRuntime } from '../agents/agent.types'
import { teamRuntime } from '../agents/team'
import { getTheme } from '../themes'
import { projectCast } from '../project/cast'
import { WorldEngine } from './engine/WorldEngine'

/**
 * A world engine for one theme and one cast.
 *
 * The engine is rebuilt when either changes, because it bakes sprite sheets
 * and props once at construction — that is what keeps the render loop down to
 * blits. Taking the roster as well as the theme is what keeps the office
 * populated by the project rather than by the world: only the characters this
 * project chose ever get a sheet baked, so there is no path by which an
 * unchosen one could be drawn.
 *
 * The runtime is a parameter so the same world can be driven by the real team
 * in the workspace or by the showcase on the landing page; the renderer cannot
 * tell the difference.
 */
export function useWorldEngine(
  themeId: string | undefined,
  roster: readonly string[],
  runtime: AgentRuntime = teamRuntime
) {
  const theme = useMemo(() => getTheme(themeId), [themeId])

  /*
   * Keyed on the roster's contents rather than its identity. The array is
   * rebuilt on every render of whatever owns the project, and comparing by
   * reference would rebake every sprite sheet in the office each time.
   */
  const rosterKey = roster.join('|')
  const cast = useMemo(
    () => projectCast(theme, rosterKey ? rosterKey.split('|') : []),
    [theme, rosterKey]
  )

  const engine = useMemo(
    () => new WorldEngine(theme, cast, runtime),
    [theme, cast, runtime]
  )

  useEffect(() => () => engine.stop(), [engine])

  return { theme, cast, engine }
}
