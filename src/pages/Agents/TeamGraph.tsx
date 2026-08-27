import type { AgentConfig } from '../../shared/providerApi'

interface Props {
  agents: AgentConfig[]
  onEdit: (agentId: string) => void
}

/**
 * Who is allowed to talk to whom.
 *
 * Relationships are directional, and that direction is the whole point: Jane
 * being able to ask Michael for help does not mean Michael can send work back.
 * A node-and-line diagram would hide that; an explicit arrow per permission
 * cannot.
 *
 * Deliberately not a graph editor. It answers "what did I configure?" at a
 * glance and hands editing back to the agent it belongs to.
 */
export function TeamGraph({ agents, onEdit }: Props) {
  const named = (id: string) => agents.find((a) => a.id === id)

  const senders = agents.filter((a) => a.canTalkTo.length > 0)

  if (agents.length < 2) {
    return (
      <p className="font-ui text-[13px] leading-[1.6] text-ink-3">
        Add a second agent and you can let them work together.
      </p>
    )
  }

  return (
    <div className="border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-shadow)]">
      {senders.length === 0 ? (
        <p className="font-ui text-[13px] leading-[1.6] text-ink-3">
          Nobody can contact anybody yet. Open an agent and choose who it is
          allowed to talk to — until then they all work alone.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {senders.map((agent) => (
            <li key={agent.id}>
              <button
                type="button"
                onClick={() => onEdit(agent.id)}
                className="font-pixel text-sm font-bold uppercase tracking-[0.06em] text-ink underline decoration-brand decoration-2 underline-offset-4 hover:decoration-brand-deep"
              >
                {agent.displayName || agent.name}
              </button>

              <ul className="mt-1.5 flex flex-col gap-1 pl-1">
                {agent.canTalkTo.map((targetId, i) => {
                  const target = named(targetId)
                  const last = i === agent.canTalkTo.length - 1
                  const mutual = target?.canTalkTo.includes(agent.id) ?? false

                  return (
                    <li key={targetId} className="flex items-center gap-2">
                      {/*
                        Box-drawing rather than SVG: it stays crisp at any zoom,
                        matches the pixel language, and reads the same way in a
                        terminal-shaped panel as it does here.
                      */}
                      <span
                        aria-hidden
                        className="font-mono text-[12px] leading-none text-rule"
                      >
                        {last ? '└─' : '├─'}
                      </span>
                      <span
                        aria-hidden
                        className="font-mono text-[12px] leading-none text-brand-deep"
                      >
                        {mutual ? '<─>' : '──>'}
                      </span>
                      <span className="font-pixel text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">
                        {target ? target.displayName || target.name : targetId}
                      </span>
                      <span className="font-ui text-[12px] text-ink-3">
                        {target ? target.role : 'no longer on the team'}
                      </span>
                      {mutual && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                          both ways
                        </span>
                      )}
                      {!target?.spawned && target && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                          not spawned
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t-2 border-rule pt-3 font-ui text-[12px] leading-snug text-ink-3">
        An arrow is a permission, not an instruction. It lets an agent hand work
        over when its own task calls for it — automatic handovers are a
        separate switch, on Automations.
      </p>
    </div>
  )
}
