import type { Theme } from '../../themes/types'
import type { AgentView } from '../../world/world.types'
import { CharacterCard } from '../../components/CharacterCard/CharacterCard'

interface Props {
  theme: Theme
  agents: AgentView[]
}

export function TeamSection({ theme, agents }: Props) {
  return (
    <section id="team" className="border-t-[3px] border-ink bg-cream-2 px-6 py-20">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-heading text-4xl font-extrabold uppercase leading-none tracking-[-0.02em] text-ink sm:text-5xl">
            Meet your team
          </h2>
          <p className="font-pixel text-base text-ink-3">
            Four agents. One office. Status is live.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {theme.characters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              agent={agents.find((a) => a.characterId === c.id)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
