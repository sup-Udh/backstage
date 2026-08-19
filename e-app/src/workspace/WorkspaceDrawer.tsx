import { useEffect, useState } from 'react'
import { useBackstage, type DrawerId } from '../stores/backstageStore'
import type { WorkspaceInfo } from '../shared/providerApi'
import { TerminalPanel } from './TerminalPanel'
import {
  CommandsPanel,
  FilesPanel,
  FileView,
  GitPanel,
  TasksPanel
} from './panels'
import { ActivityConsole } from './ActivityConsole'

/**
 * The command bar and the drawer it opens.
 *
 * Everything the workspace can do lives behind one strip rather than on screen
 * at once — the pixel world stays the centrepiece, and a panel appears only
 * when it is asked for.
 *
 * The terminal is deliberately kept mounted once opened. Unmounting it would
 * dispose the xterm instance and lose the scrollback of a session that is
 * still running.
 */

const BAR: { id: Exclude<DrawerId, null>; label: string; key: string }[] = [
  { id: 'files', label: 'Files', key: 'Ctrl+P' },
  { id: 'git', label: 'Git', key: 'Ctrl+Shift+G' },
  { id: 'terminal', label: 'Terminal', key: 'Ctrl+`' },
  { id: 'tasks', label: 'Tasks', key: '' },
  { id: 'commands', label: 'Commands', key: '' },
  { id: 'activity', label: 'Activity', key: '' }
]

export function WorkspaceDrawer() {
  const drawer = useBackstage((s) => s.drawer)
  const setDrawer = useBackstage((s) => s.setDrawer)
  const openFile = useBackstage((s) => s.openFile)
  const setOpenFile = useBackstage((s) => s.setOpenFile)
  const setAgentSessions = useBackstage((s) => s.setAgentSessions)
  const queueCommand = useBackstage((s) => s.queueCommand)

  /* Mirror live CLI sessions so the tasks panel and world can see them. */
  useEffect(() => {
    if (!window.backstage?.sessions) return
    void window.backstage.sessions.list().then(setAgentSessions)
    return window.backstage.sessions.onChanged(setAgentSessions)
  }, [setAgentSessions])

  /* Keyboard shortcuts, chosen not to collide with Electron's own. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key === '`') {
        e.preventDefault()
        setDrawer('terminal')
      } else if (e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault()
        setDrawer('files')
      } else if (e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setDrawer('git')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setDrawer])

  const terminalOpened = useBackstage((s) => s.terminalEverOpened)
  const markTerminalOpened = useBackstage((s) => s.markTerminalOpened)
  useEffect(() => {
    if (drawer === 'terminal') markTerminalOpened()
  }, [drawer, markTerminalOpened])

  return (
    <div className="flex shrink-0 flex-col border-t-[3px] border-ink">
      {/* The drawer body. */}
      {drawer && (
        <div className="h-[300px] min-h-0 border-b-[3px] border-ink bg-cream 2xl:h-[360px]">
          {/*
            Terminal stays mounted after first use: disposing it would kill the
            xterm instance and the scrollback of a live session.
          */}
          <div className={drawer === 'terminal' ? 'h-full' : 'hidden'}>
            {terminalOpened && <TerminalPanel />}
          </div>

          {drawer === 'files' && (
            <div className="h-full">
              {openFile ? (
                <FileView path={openFile} onClose={() => setOpenFile(null)} />
              ) : (
                <FilesPanel onOpen={setOpenFile} />
              )}
            </div>
          )}
          {drawer === 'git' && <GitPanel />}
          {drawer === 'tasks' && (
            <div className="flex h-full flex-col">
              <TasksPanel />
            </div>
          )}
          {drawer === 'commands' && (
            <div className="flex h-full flex-col">
              <CommandsPanel
                onRun={(command) => {
                  // Hand it to the terminal rather than running it blind, so
                  // the user sees the real process and can interrupt it.
                  queueCommand(command)
                  setDrawer('terminal')
                }}
              />
            </div>
          )}
          {drawer === 'activity' && <ActivityConsole />}
        </div>
      )}

      {/* The bar itself. */}
      <div className="flex items-center gap-1 bg-ink px-3 py-1.5">
        {BAR.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setDrawer(item.id)}
            aria-pressed={drawer === item.id}
            title={item.key || undefined}
            className={`border-2 px-2.5 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${
              drawer === item.id
                ? 'border-brand bg-brand text-ink'
                : 'border-ink-3 text-dim hover:border-brand hover:text-brand'
            }`}
          >
            {item.label}
          </button>
        ))}

        <WorkspaceChip />
      </div>
    </div>
  )
}

/** Always-visible reminder of which project everything is pointed at. */
function WorkspaceChip() {
  const [info, setInfo] = useState<WorkspaceInfo | null>(null)
  useEffect(() => {
    void window.backstage?.workspace.get().then(setInfo)
  }, [setInfo])

  return (
    <span className="ml-auto flex min-w-0 items-baseline gap-2">
      <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-dim">
        Workspace
      </span>
      <span className="truncate font-mono text-[10px] text-brand" title={info?.root ?? ''}>
        {info?.root ? info.name : 'none open'}
      </span>
    </span>
  )
}
