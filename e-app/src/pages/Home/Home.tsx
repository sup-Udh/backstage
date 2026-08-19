import { useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useWorldEngine } from '../../world/useWorldEngine'
import { WorldPanel } from './WorldPanel'
import { CommandCenter } from './CommandCenter'

/**
 * The workspace.
 *
 * The world owns the whole area and the command centre docks beside it, so the
 * office is as large as the window allows rather than sharing a column with
 * the chat. Collapsing the panel hands the entire screen to the world.
 */
export function Home() {
  const themeId = useBackstage((s) => s.themeId)
  const switching = useBackstage((s) => s.switching)
  const { theme, engine } = useWorldEngine(themeId)
  const [open, setOpen] = useState(true)

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/*
        The world is a flex sibling rather than an absolute layer, so its
        canvas is measured rather than guessed — which is what the camera
        needs in order to fit the room correctly.
      */}
      <div className="min-w-0 flex-1">
        <WorldPanel theme={theme} engine={engine} switching={switching} />
      </div>

      {open ? (
        <div className="relative w-[380px] shrink-0 2xl:w-[420px]">
          <DockToggle open onClick={() => setOpen(false)} />
          <CommandCenter theme={theme} engine={engine} />
        </div>
      ) : (
        <DockToggle open={false} onClick={() => setOpen(true)} />
      )}
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
