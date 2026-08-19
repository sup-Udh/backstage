import { useSyncExternalStore } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useWorldEngine } from '../../world/useWorldEngine'
import { CharacterSprite } from '../../world/CharacterSprite'
import { StatusChip } from '../../components/AgentStatus/StatusChip'
import { PagePlaceholder } from '../shell/PagePlaceholder'

/**
 * The roster. It reads the same live views the workspace does, so an agent
 * shown as working here is the one typing in the office next door.
 */
export function Agents() {
  const themeId = useBackstage((s) => s.themeId)
  const { theme, engine } = useWorldEngine(themeId)
  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)

  return (
    <PagePlaceholder
      title="Your agents"
      lead="Four agents, each bound to a model. Their character comes from the active world."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {theme.characters.map((c) => {
          const agent = agents.find((a) => a.characterId === c.id)
          return (
            <li
              key={c.id}
              className="border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)]"
            >
              <div className="flex items-end justify-center border-b-[3px] border-ink bg-brand-pale pt-4">
                <CharacterSprite appearance={c.appearance} scale={3} />
              </div>
              <div className="px-4 py-3">
                <h2 className="font-pixel text-lg font-bold uppercase leading-none tracking-[0.04em] text-ink">
                  {c.name}
                </h2>
                <p className="mt-2 font-ui text-sm leading-none text-ink-3">
                  {c.role}
                </p>
                <p className="mt-3 flex items-baseline gap-2 font-mono text-xs leading-none">
                  <span className="uppercase tracking-[0.08em] text-ink-3">
                    Model
                  </span>
                  <span className="font-medium text-ink">
                    {agent?.model ?? '--'}
                  </span>
                </p>
                <div className="mt-2">
                  <StatusChip status={agent?.status ?? 'idle'} />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </PagePlaceholder>
  )
}
