import { useState, useSyncExternalStore } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useWorldEngine } from '../../world/useWorldEngine'
import { useAgentConfigs } from '../../agents/useAgentConfigs'
import { useProviders } from '../../providers/useProviders'
import { CharacterSprite } from '../../world/CharacterSprite'
import { StatusChip } from '../../components/AgentStatus/StatusChip'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import { AgentEditor } from './AgentEditor'
import type { AgentConfig } from '../../shared/providerApi'

const PROFILE_LABEL: Record<string, string> = {
  quick: 'Quick',
  normal: 'Balanced',
  deep: 'Deep'
}

/**
 * The team roster.
 *
 * Shows configuration — who each agent is, which model answers for them, what
 * they may touch — alongside live runtime status, which comes from the same
 * views the world renders from. An agent shown as working here is the one
 * typing in the office next door.
 */
export function Agents() {
  const themeId = useBackstage((s) => s.themeId)
  const { theme, engine } = useWorldEngine(themeId)
  const live = useSyncExternalStore(engine.subscribeViews, engine.getViews)
  const { agents, families, busy, save, remove } = useAgentConfigs()
  const { statuses } = useProviders()

  const [editing, setEditing] = useState<Partial<AgentConfig> | null>(null)

  const commit = async (draft: Partial<AgentConfig>) => {
    await save(draft)
    setEditing(null)
  }

  return (
    <PagePlaceholder
      title="Your agents"
      lead="Each agent is a role, a model and a set of tools. They appear in the world once you give them work, and stay once they have."
    >
      {editing ? (
        <AgentEditor
          agent={editing}
          theme={theme}
          providers={statuses}
          families={families}
          busy={busy}
          onSave={commit}
          onCancel={() => setEditing(null)}
          onDelete={async (id) => {
            await remove(id)
            setEditing(null)
          }}
        />
      ) : (
        <>
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setEditing({})}
              className="border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-y-px hover:bg-brand-lite"
            >
              Create agent
            </button>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {agents.map((a) => {
              const cast = theme.characters
              const character = cast[((a.characterSlot % cast.length) + cast.length) % cast.length]
              const runtime = live.find((v) => v.characterId === a.id)
              const provider = statuses.find((p) => p.id === a.providerId)
              const model = a.modelId ?? provider?.selectedModel ?? '—'

              return (
                <li
                  key={a.id}
                  className={`border-[3px] border-ink shadow-[4px_4px_0_0_var(--color-ink)] ${
                    a.enabled ? 'bg-paper' : 'bg-paper/60'
                  }`}
                >
                  <div className="flex items-end justify-center border-b-[3px] border-ink bg-brand-pale pt-4">
                    <CharacterSprite
                      appearance={character.appearance}
                      state={
                        runtime?.status === 'working' ||
                        runtime?.status === 'thinking' ||
                        runtime?.status === 'talking'
                          ? 'working'
                          : 'idle'
                      }
                      scale={3}
                    />
                  </div>

                  <div className="px-4 py-3">
                    <h2 className="font-pixel text-lg font-bold uppercase leading-none tracking-[0.04em] text-ink">
                      {a.name}
                    </h2>
                    <p className="mt-2 font-ui text-sm leading-none text-ink-3">
                      {a.role}
                    </p>

                    <p className="mt-3 font-mono text-[11px] leading-none text-ink-3">
                      <span className="uppercase tracking-[0.08em]">
                        {provider?.name ?? a.providerId}
                      </span>
                      <span className="mx-1.5">·</span>
                      <span className="text-ink">{model}</span>
                    </p>

                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                      {PROFILE_LABEL[a.profile]} ·{' '}
                      {a.tools.length > 0 ? a.tools.join(' · ') : 'no tools'}
                    </p>

                    <div className="mt-2.5">
                      <StatusChip status={runtime?.status ?? 'idle'} />
                    </div>

                    {runtime?.task && (
                      <p className="mt-1.5 font-ui text-xs leading-snug text-ink-3">
                        {runtime.task}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(a)}
                        className="border-2 border-ink bg-cream px-3 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
                      >
                        Configure
                      </button>
                      <button
                        type="button"
                        onClick={() => void save({ ...a, enabled: !a.enabled })}
                        className="border-2 border-rule px-2.5 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
                      >
                        {a.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </PagePlaceholder>
  )
}
