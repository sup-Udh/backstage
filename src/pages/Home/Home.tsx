import { useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useWorldEngine } from '../../world/useWorldEngine'
import { WorldPanel } from './WorldPanel'
import { CommandCenter } from './CommandCenter'
import { WorkspaceStatus } from './WorkspaceStatus'
import { useWorkspaceEvents } from '../../workspace/useWorkspaceEvents'

/**
 * The workspace.
 *
 * Two columns and a status strip, rather than a stack. The world tells the
 * story on the left; the command centre on the right is where the work is
 * done — team, tools, session and input in one place, so nothing the user
 * needs is more than a glance away.
 *
 * The split is proportional and clamped: the panel has to be wide enough for
 * a real Claude Code session and a file tree, and the world has to stay the
 * thing you look at. Collapsing the panel hands the entire screen to the world.
 */
export function Home() {
  const themeId = useBackstage((s) => s.themeId)
  const switching = useBackstage((s) => s.switching)
  const { theme, engine } = useWorldEngine(themeId)
  const [open, setOpen] = useState(true)

  // Real file, PTY and CLI-session events feed the world and every surface.
  useWorkspaceEvents()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/*
          The world is a flex sibling rather than an absolute layer, so its
          canvas is measured rather than guessed — which is what the camera
          needs in order to fit the room correctly.
        */}
        <div className="min-w-0 flex-1">
          <WorldPanel engine={engine} switching={switching} />
        </div>

        {open ? (
          /*
            Roughly 38% of the window, floored so the session stays usable on a
            small display and capped so it never overtakes the office.
          */
          <div className="relative w-[38%] min-w-[380px] max-w-[620px] shrink-0">
            <DockToggle open onClick={() => setOpen(false)} />
            <CommandCenter theme={theme} />
          </div>
        ) : (
          <DockToggle open={false} onClick={() => setOpen(true)} />
        )}
      </div>

      <WorkspaceStatus theme={theme} engine={engine} />
    </div>
  )
}

/**
 * The dock handle. When the panel is open it straddles the seam; when closed
 * it parks in the top-right corner of the world.
 */
function DockToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? 'Hide the command centre' : 'Show the command centre'}
      className={[
        'z-30 grid h-9 w-7 place-items-center border-2 border-ink bg-cream',
        'font-pixel text-sm font-bold text-ink shadow-[2px_2px_0_0_var(--color-ink)]',
        'transition-transform duration-75 hover:-translate-y-px hover:bg-brand',
        open ? 'absolute -left-4 top-4' : 'absolute right-4 top-4'
      ].join(' ')}
    >
      {open ? '›' : '‹'}
    </button>
  )
}
