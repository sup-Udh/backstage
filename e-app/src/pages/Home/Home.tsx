import { useBackstage } from '../../stores/backstageStore'
import { useWorldEngine } from '../../world/useWorldEngine'
import { WorldPanel } from './WorldPanel'
import { CommandCenter } from './CommandCenter'

/**
 * The workspace.
 *
 * Talk to your team on the right, watch them work on the left. The split is a
 * grid rather than absolute positioning, so the world takes the slack as the
 * window grows and the command panel keeps a usable minimum.
 */
export function Home() {
  const themeId = useBackstage((s) => s.themeId)
  const switching = useBackstage((s) => s.switching)
  const { theme, engine } = useWorldEngine(themeId)

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_minmax(340px,1fr)]">
      <WorldPanel theme={theme} engine={engine} switching={switching} />
      <CommandCenter theme={theme} engine={engine} />
    </div>
  )
}
