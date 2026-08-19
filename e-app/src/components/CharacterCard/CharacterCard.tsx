import type { CharacterDef } from '../../characters/character.types'
import type { AgentView } from '../../world/world.types'
import { CharacterSprite } from '../../world/CharacterSprite'
import { StatusChip } from '../AgentStatus/StatusChip'

interface Props {
  character: CharacterDef
  agent?: AgentView
}

/** The sprite pose that best represents each status on a static card. */
function poseFor(status: AgentView['status'] | undefined) {
  switch (status) {
    case 'working':
      return 'working' as const
    case 'thinking':
      return 'thinking' as const
    case 'talking':
      return 'talking' as const
    case 'success':
      return 'success' as const
    default:
      return 'idle' as const
  }
}

/**
 * A team card. It reads its live status from the same runtime driving the
 * office, so the cards and the world can never disagree about what an agent
 * is doing.
 */
export function CharacterCard({ character, agent }: Props) {
  return (
    <article className="border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_0_var(--color-brand-shadow)]">
      {/* Sprite plate, on the warm room colour so it sits in its world. */}
      <div className="relative flex h-[132px] items-end justify-center border-b-[3px] border-ink bg-brand-pale">
        {/* Floorline and contact shadow. */}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-cream-2" />
        <div className="absolute bottom-[26px] h-1.5 w-12 bg-ink/15" />
        <CharacterSprite
          appearance={character.appearance}
          state={poseFor(agent?.status)}
          facing="down"
          scale={4}
          className="relative mb-5"
        />
      </div>

      <div className="px-4 py-3">
        <h3 className="font-pixel text-xl font-bold uppercase leading-none tracking-[0.04em] text-ink">
          {character.name}
        </h3>
        <p className="mt-2 font-ui text-sm leading-none text-ink-3">
          {character.role}
        </p>

        <div className="pixel-rule my-3" />

        <p className="flex items-baseline gap-2 font-mono text-xs leading-none">
          <span className="uppercase tracking-[0.08em] text-ink-3">Model</span>
          <span className="font-medium text-ink">{agent?.model ?? '--'}</span>
        </p>

        <div className="mt-2">
          <StatusChip status={agent?.status ?? 'idle'} />
        </div>
      </div>
    </article>
  )
}
