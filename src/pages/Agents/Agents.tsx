import { useEffect, useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import { getTheme } from '../../themes'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import { AgentCard } from './AgentCard'
import { AgentEditor } from './AgentEditor'
import { TeamGraph } from './TeamGraph'
import { AwarenessPanel } from './AwarenessPanel'
import type { AgentConfig, WorkspaceInfo } from '../../shared/providerApi'

/**
 * The team management page.
 *
 * Half HR department, half orchestration console: it is where agents are
 * hired, given a model and a set of permissions, brought into the office and
 * sent home again. Everything on it is live — the status on a card is the same
 * runtime state the world renders from, so an agent shown as working here is
 * the one typing in the office next door.
 */
export function Agents() {
  const themeId = useBackstage((s) => s.themeId)
  const providers = useBackstage((s) => s.providers)
  const agentStates = useBackstage((s) => s.agentStates)

  const agents = useTeam((s) => s.agents)
  const capabilities = useTeam((s) => s.capabilities)
  const validations = useTeam((s) => s.validations)
  const busy = useTeam((s) => s.busy)
  const save = useTeam((s) => s.save)
  const remove = useTeam((s) => s.remove)
  const spawn = useTeam((s) => s.spawn)
  const despawn = useTeam((s) => s.despawn)
  const setEnabled = useTeam((s) => s.setEnabled)
  const cancel = useTeam((s) => s.cancel)
  const stopAll = useTeam((s) => s.stopAll)

  const [editing, setEditing] = useState<Partial<AgentConfig> | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)

  useEffect(() => {
    void window.backstage?.workspace.get().then(setWorkspace)
  }, [])

  const theme = getTheme(themeId)
  const anyConnected = providers.some((p) => p.connected)

  const spawned = agents.filter((a) => a.enabled && a.spawned)
  const busyCount = spawned.filter((a) => {
    const state = agentStates[a.id]
    return state?.executionId !== null && state?.executionId !== undefined
  }).length

  /* -------------------------------------------------------------- saving -- */

  const commit = async (draft: Partial<AgentConfig>) => {
    await save(draft)
    setEditing(null)
    setNotice(null)
  }

  /**
   * Save, then bring them in.
   *
   * Two steps rather than one, because they are two different things: an agent
   * can exist without being in the office. Spawning is refused rather than
   * half-done if the configuration would not work, and the reason is shown.
   */
  const commitAndSpawn = async (draft: Partial<AgentConfig>) => {
    const list = await save(draft)
    const saved =
      list.find((a) => a.id === draft.id) ??
      // A new agent gets its id from the main process, so it is found by
      // being the one that was not in the list before.
      list.find((a) => !agents.some((existing) => existing.id === a.id)) ??
      null

    if (!saved) {
      setNotice('Saved, but the agent could not be found to spawn.')
      return
    }

    const validation = await spawn(saved.id)
    if (!validation.ok) {
      setNotice(`${saved.name} was saved but could not be spawned: ${validation.problems[0]}`)
      return
    }
    setEditing(null)
    setNotice(null)
  }

  if (editing) {
    return (
      <PagePlaceholder
        title={editing.id ? 'Configure agent' : 'Create agent'}
        lead="A name, a model, a set of permissions and a character. Everything here is saved to disk and survives a restart."
      >
        {notice && (
          <p className="mb-4 max-w-[640px] border-2 border-ink bg-brand-pale px-3 py-2 font-ui text-[13px] leading-snug text-ink">
            {notice}
          </p>
        )}
        <AgentEditor
          agent={editing}
          agents={agents}
          activeThemeId={themeId}
          providers={providers}
          capabilities={capabilities}
          workspaceRoot={workspace?.root ?? null}
          busy={busy}
          onSave={commit}
          onSaveAndSpawn={commitAndSpawn}
          onCancel={() => {
            setEditing(null)
            setNotice(null)
          }}
          onDelete={async (id) => {
            await remove(id)
            setEditing(null)
          }}
        />
      </PagePlaceholder>
    )
  }

  return (
    <PagePlaceholder
      title="Your AI team"
      lead="Create, configure and manage the agents working inside Backstage. Each one is an independent worker with its own model, permissions and conversation."
    >
      {/* ------------------------------------------------------- controls -- */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            setEditing({})
          }}
          disabled={!anyConnected}
          title={
            anyConnected
              ? undefined
              : 'Connect a provider before creating an agent.'
          }
          className="border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-x-px enabled:hover:-translate-y-px enabled:hover:bg-brand-lite disabled:cursor-default disabled:opacity-40"
        >
          + Create agent
        </button>

        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          <span className="text-ink">{agents.length}</span> configured
          <span className="mx-2 text-rule">·</span>
          <span className="text-ink">{spawned.length}</span> in the office
          <span className="mx-2 text-rule">·</span>
          <span className={busyCount > 0 ? 'text-brand-deep' : 'text-ink'}>
            {busyCount}
          </span>{' '}
          working
        </span>

        {/*
          The emergency stop. It cancels Backstage's own executions only — a
          `claude` process the user started in a terminal is their process, and
          killing it because an agent misbehaved would destroy work this app
          does not own.
        */}
        <button
          type="button"
          onClick={() => void stopAll()}
          disabled={busyCount === 0}
          className="ml-auto border-2 border-ink bg-cream px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors enabled:hover:bg-rust enabled:hover:text-cream disabled:opacity-40"
        >
          Stop all agents
        </button>
      </div>

      {!anyConnected && (
        <div className="mb-6 max-w-[640px] border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
          <p className="font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink">
            No provider connections available
          </p>
          <p className="mt-1.5 font-ui text-[13px] leading-snug text-ink-3">
            Connect a provider to create an AI agent. Your key is encrypted by
            your operating system and never reaches this interface.
          </p>
          <button
            type="button"
            onClick={() => useBackstage.getState().setPage('account')}
            className="mt-3 border-2 border-ink bg-brand px-3 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-y-px"
          >
            Open Connections
          </button>
        </div>
      )}

      {notice && (
        <p className="mb-4 max-w-[640px] border-2 border-ink bg-brand-pale px-3 py-2 font-ui text-[13px] leading-snug text-ink">
          {notice}
        </p>
      )}

      {/* ---------------------------------------------------------- roster -- */}
      <h2 className="mb-3 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Your agents
      </h2>

      {agents.length === 0 ? (
        <div className="max-w-[520px] border-[3px] border-dashed border-rule bg-paper/60 p-6">
          <p className="font-ui text-sm text-ink-3">
            No agents yet. Create one and they will appear in the office.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              state={agentStates[agent.id]}
              validation={validations[agent.id]}
              provider={providers.find((p) => p.id === agent.providerId)}
              theme={theme}
              busy={busy}
              onEdit={() => {
                setNotice(null)
                setEditing(agent)
              }}
              onSpawn={async () => {
                const validation = await spawn(agent.id)
                if (!validation.ok) {
                  setNotice(
                    `${agent.name} cannot be spawned: ${validation.problems.join(' ')}`
                  )
                } else {
                  setNotice(null)
                }
              }}
              onDespawn={() => void despawn(agent.id)}
              onToggleEnabled={() => void setEnabled(agent.id, !agent.enabled)}
              onStop={() => void cancel(agent.id)}
            />
          ))}
        </ul>
      )}

      {/* ------------------------------------------------ graph + awareness -- */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
        <section>
          <h2 className="mb-3 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
            Team graph
          </h2>
          <TeamGraph
            agents={agents}
            onEdit={(agentId) => {
              const found = agents.find((a) => a.id === agentId)
              if (found) setEditing(found)
            }}
          />
        </section>

        <section>
          <h2 className="mb-3 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
            What your agents can see
          </h2>
          <AwarenessPanel />
        </section>
      </div>
    </PagePlaceholder>
  )
}
