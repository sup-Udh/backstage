import { useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useProject } from '../../stores/projectStore'
import { useWorldEngine } from '../../world/useWorldEngine'
import { WorldPanel } from './WorldPanel'
import { CommandCenter } from './CommandCenter'
import { WorkspaceStatus } from './WorkspaceStatus'
import { useWorkspaceEvents } from '../../workspace/useWorkspaceEvents'
import { useWorkers } from '../../agents/useWorkers'
import { SpawnAgentDialog } from './SpawnAgentDialog'

/** Stable empty roster, so the world engine's memo is not defeated. */
const EMPTY_ROSTER: string[] = []

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
  const project = useProject((s) => s.project)
  const switching = useProject((s) => s.switching)
  /*
   * The world is built from the project, not from a global theme. Only the
   * characters this project chose are cast, baked or drawn — there is no path
   * by which another theme's people could appear in this office.
   */
  const { theme, cast, engine } = useWorldEngine(
    project?.themeId,
    project?.characterRoster ?? EMPTY_ROSTER
  )
  const [open, setOpen] = useState(true)
  const [spawning, setSpawning] = useState(false)
  const setChatTarget = useBackstage((s) => s.setChatTarget)

  // Real file, PTY and CLI-session events feed the world and every surface.
  useWorkspaceEvents()

  /*
   * One worker list for the whole workspace. The world, the selector, the
   * chat and the inspector are all views of it, which is the only reason they
   * can be relied on to agree about who is present and what they are doing.
   */
  const workers = useWorkers()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/*
          The world is a flex sibling rather than an absolute layer, so its
          canvas is measured rather than guessed — which is what the camera
          needs in order to fit the room correctly.
        */}
        <div className="min-w-0 flex-1">
          <WorldPanel
            engine={engine}
            switching={switching}
            workers={workers}
            cast={cast}
          />
        </div>

        {open ? (
          /*
            Roughly 38% of the window, floored so the session stays usable on a
            small display and capped so it never overtakes the office.
          */
          <div className="relative w-[38%] min-w-[380px] max-w-[620px] shrink-0">
            <DockToggle open onClick={() => setOpen(false)} />
            <CommandCenter
              cast={cast}
              workers={workers}
              onSpawn={() => setSpawning(true)}
            />
          </div>
        ) : (
          <DockToggle open={false} onClick={() => setOpen(true)} />
        )}

        {spawning && (
          <SpawnAgentDialog
            cast={cast}
            onClose={() => setSpawning(false)}
            /*
             * Talk to whoever was just hired. Spawning someone and then having
             * to find them in a dropdown is the wrong end of the interaction —
             * the reason to add an agent is to give it something to do.
             */
            onSpawned={(agent) => setChatTarget(agent.id)}
          />
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
