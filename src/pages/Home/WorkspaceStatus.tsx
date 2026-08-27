import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import type { WorkspaceInfo } from '../../shared/providerApi'
import { STATUS_GLYPH } from '../../characters/character.states'
import { useProviders } from '../../providers/useProviders'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'

interface Props {
  theme: Theme
  engine: WorldEngine
}

/**
 * The status strip.
 *
 * What used to be here was the application's main navigation, which put the
 * most important controls in the least reachable place and pushed the world
 * and the session apart. Those controls now live at the top of the command
 * centre, and the bottom of the screen does what a status bar should: says
 * which project this is, who is in the room, and what is answering.
 */
export function WorkspaceStatus({ theme, engine }: Props) {
  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)
  const { statuses, workspace: fromProviders } = useProviders()
  const sessions = useBackstage((s) => s.agentSessions)
  const agentStates = useBackstage((s) => s.agentStates)
  const settings = useTeam((st) => st.settings)
  const updateSettings = useTeam((st) => st.updateSettings)
  const stopAll = useTeam((st) => st.stopAll)
  const setPage = useBackstage((st) => st.setPage)

  /*
   * The workspace is asked for directly as well: this strip is mounted for the
   * whole session and must not go blank if the providers hook has not settled.
   */
  const [info, setInfo] = useState<WorkspaceInfo | null>(null)
  useEffect(() => {
    void window.backstage?.workspace.get().then(setInfo)
  }, [])

  const workspace = fromProviders ?? info
  const active = agents.filter((a) =>
    ['working', 'thinking', 'talking', 'success'].includes(a.status)
  ).length
  const busyAgents = Object.values(agentStates).filter(
    (state) => state.executionId !== null
  ).length
  const liveSessions = sessions.filter(
    (s) => s.status !== 'exited' && s.status !== 'error'
  ).length

  const connected = statuses.filter((p) => p.connected)
  /*
   * Several providers can be answering at once, because each agent carries its
   * own. Naming one would be wrong the moment a second agent is on a different
   * engine.
   */
  const answering =
    connected.length === 0
      ? 'not connected'
      : connected.length === 1
        ? (connected[0].selectedModel ?? connected[0].name)
        : `${connected.length} providers`

  return (
    <footer className="flex shrink-0 items-center gap-4 border-t-[3px] border-ink bg-slate px-4 py-1.5">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">
          Workspace
        </span>
        <span
          className="truncate font-mono text-[10px] text-brand"
          title={workspace?.root ?? undefined}
        >
          {workspace?.root ? workspace.name : 'none open'}
        </span>
        {workspace?.root && (
          <span className="hidden truncate font-mono text-[10px] text-dim xl:inline">
            {workspace.root}
          </span>
        )}
      </span>

      <span aria-hidden className="h-3 w-px shrink-0 bg-slate-rule" />

      <span className="flex shrink-0 items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.06em]">
        <span className="border-2 border-brand-shadow bg-brand px-1.5 font-pixel text-[10px] font-semibold tracking-[0.06em] text-on-brand">
          {theme.name}
        </span>
        <span className="text-dim">
          <span className="text-on-slate-2">{agents.length}</span> agents
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className={active > 0 ? 'text-brand' : 'text-dim'}>
            {STATUS_GLYPH.working}
          </span>
          <span className={active > 0 ? 'text-brand' : 'text-dim'}>{active}</span>
          <span className="text-dim">active</span>
        </span>
        {liveSessions > 0 && (
          <span className="text-dim">
            <span className="text-brand">{liveSessions}</span> cli
          </span>
        )}
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.06em]">
        <span className="hidden text-dim xl:inline">
          Drag to pan · scroll to zoom · click an agent
        </span>
        <span aria-hidden className="hidden h-3 w-px bg-slate-rule xl:inline-block" />

        {/*
          The automation switch, where the work is happening.
          It is the control most worth being able to reach without leaving the
          workspace: it decides whether agents may start work on each other,
          and every hop it allows costs money.
        */}
        <button
          type="button"
          onClick={() =>
            void updateSettings({ autoCollaboration: !settings.autoCollaboration })
          }
          aria-pressed={settings.autoCollaboration}
          title={
            settings.autoCollaboration
              ? 'Automations may fire. Click to turn off.'
              : 'Agents act only when asked. Click to allow automations.'
          }
          className={`border-2 px-1.5 font-pixel text-[10px] font-semibold tracking-[0.06em] transition-colors ${
            settings.autoCollaboration
              ? 'border-brand-shadow bg-brand text-on-brand'
              : 'border-slate-rule text-dim hover:border-brand hover:text-brand'
          }`}
        >
          {settings.autoCollaboration ? '● Auto on' : '○ Auto off'}
        </button>

        {/*
          The emergency stop appears only when there is something to stop, so
          the strip does not carry a dead control most of the time.
        */}
        {busyAgents > 0 && (
          <button
            type="button"
            onClick={() => void stopAll()}
            title="Stop every Backstage agent. External CLI sessions are left alone."
            className="border-2 border-brand-shadow bg-brand px-1.5 font-pixel text-[10px] font-semibold tracking-[0.06em] text-on-brand transition-colors hover:bg-rust hover:text-on-slate"
          >
            Stop all
          </button>
        )}

        <button
          type="button"
          onClick={() => setPage('account')}
          className={connected.length > 0 ? 'text-brand' : 'text-dim hover:text-on-slate-2'}
        >
          {answering}
        </button>
      </span>
    </footer>
  )
}
