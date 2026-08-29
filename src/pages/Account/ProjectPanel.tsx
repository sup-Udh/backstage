import { useEffect, useState } from 'react'
import { useProject, useProjectCast, useProjectTheme } from '../../stores/projectStore'
import { useTeam } from '../../stores/teamStore'
import { castForSlot } from '../../project/cast'
import { CharacterSprite } from '../../world/CharacterSprite'

/**
 * The project's own settings.
 *
 * Everything here belongs to one project and changes nothing about any other:
 * its name, the folder it works in, who is in it, and who leads. The workspace
 * is deliberately *not* changeable from here — a project is defined by its
 * folder, and repointing it would silently hand one project's agents,
 * conversations and cases to a different codebase.
 */
export function ProjectPanel() {
  const project = useProject((s) => s.project)
  const update = useProject((s) => s.update)
  const theme = useProjectTheme()
  const cast = useProjectCast()
  const agents = useTeam((s) => s.agents)

  const [name, setName] = useState(project?.name ?? '')

  // Follow the store when the project changes underneath, but never while the
  // user is mid-edit on a different project's name.
  useEffect(() => {
    setName(project?.name ?? '')
  }, [project?.id, project?.name])

  if (!project) return null

  const commitName = () => {
    const next = name.trim()
    if (!next || next === project.name) {
      setName(project.name)
      return
    }
    void update({ name: next })
  }

  /** Whether this character is in the roster. */
  const inRoster = (characterId: string) =>
    project.characterRoster.includes(characterId)

  const toggleCharacter = (characterId: string) => {
    const next = inRoster(characterId)
      ? project.characterRoster.filter((id) => id !== characterId)
      : [...project.characterRoster, characterId]

    // A project with nobody in it has no world to render and no agent to talk
    // to, so the last character cannot be removed.
    if (next.length === 0) return
    void update({ characterRoster: next })
  }

  return (
    <section className="mb-10">
      <h2 className="mb-4 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Project
      </h2>

      <article className="max-w-[640px] border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-shadow)]">
        <label className="block">
          <span className="font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setName(project.name)
            }}
            className="mt-1.5 w-full border-2 border-ink bg-cream px-3 py-1.5 font-ui text-sm text-ink outline-none focus:border-brand-deep"
          />
        </label>

        <div className="mt-4">
          <span className="font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Workspace
          </span>
          <p className="mt-1.5 break-all border-2 border-rule bg-cream px-3 py-1.5 font-mono text-xs text-ink-3">
            {project.workspacePath}
          </p>
          <p className="mt-1.5 font-ui text-xs leading-snug text-ink-3">
            Your agents can only read, edit and run commands inside this folder.
            It is fixed for the life of the project — create another project to
            work somewhere else.
          </p>
        </div>
      </article>

      {/* ------------------------------------------------------------ cast -- */}
      <h3 className="mb-2 mt-8 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Cast
      </h3>
      <p className="mb-4 max-w-[640px] font-ui text-[13px] leading-snug text-ink-3">
        Who exists in this project. Only these characters appear anywhere —
        in the office, the roster, your conversations or your tasks.
      </p>

      <div className="flex flex-wrap gap-2">
        {theme.characters.map((c) => {
          const on = inRoster(c.id)
          const last = on && project.characterRoster.length === 1
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              disabled={last}
              title={
                last
                  ? 'A project needs at least one character.'
                  : `${c.name} — ${c.role}`
              }
              onClick={() => toggleCharacter(c.id)}
              className={[
                'flex items-center gap-2 border-2 py-1 pl-1 pr-2.5 transition-colors',
                on
                  ? 'border-ink bg-brand-pale'
                  : 'border-rule bg-cream/60 opacity-60 hover:border-ink hover:opacity-100',
                last ? 'cursor-default' : ''
              ].join(' ')}
            >
              <CharacterSprite appearance={c.appearance} scale={2} />
              <span className="font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                {c.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* ------------------------------------------------------- team lead -- */}
      <h3 className="mb-2 mt-8 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Team lead
      </h3>
      <p className="mb-4 max-w-[640px] font-ui text-[13px] leading-snug text-ink-3">
        When you talk to ALL AGENTS, this is who receives it. They decide what
        needs doing, hand the parts out, and report back with the answer.
      </p>

      {agents.length === 0 ? (
        <p className="max-w-[640px] border-[3px] border-dashed border-rule bg-paper/60 p-4 font-ui text-sm text-ink-3">
          This project has no agents yet.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Team lead" className="flex flex-wrap gap-2">
          {agents.map((agent) => {
            const character = castForSlot(cast, agent.characterSlot)
            const on = agent.id === project.godAgentId
            return (
              <button
                key={agent.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => void update({ godAgentId: agent.id })}
                className={[
                  'flex items-center gap-2 border-2 py-1 pl-1 pr-2.5 transition-colors',
                  on
                    ? 'border-ink bg-brand'
                    : 'border-rule bg-cream/60 hover:border-ink hover:bg-brand-pale'
                ].join(' ')}
              >
                <CharacterSprite appearance={character.appearance} scale={2} />
                <span
                  className={`font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] ${
                    on ? 'text-on-brand' : 'text-ink'
                  }`}
                >
                  {on && <span aria-hidden>★ </span>}
                  {character.name}
                </span>
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.06em] ${
                    on ? 'text-on-brand/75' : 'text-ink-3'
                  }`}
                >
                  {agent.role}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
