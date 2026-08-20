import type {
  AgentConfig,
  AgentRuntimeState,
  AgentValidation,
  ProviderStatus
} from '../../shared/providerApi'
import type { CharacterDef } from '../../characters/character.types'
import { castForSlot } from '../../project/cast'
import { CharacterSprite } from '../../world/CharacterSprite'
import { StatusChip } from '../../components/AgentStatus/StatusChip'
import { characterStateForAgent } from '../../characters/character.states'
import type { AgentStatus } from '../../agents/agent.types'

interface Props {
  agent: AgentConfig
  state: AgentRuntimeState | undefined
  validation: AgentValidation | undefined
  provider: ProviderStatus | undefined
  /** The project's cast, which is the only set this agent can be drawn from. */
  cast: CharacterDef[]
  /** Whether this agent coordinates the team in ALL AGENTS mode. */
  isLead?: boolean
  busy: string | null
  onEdit: () => void
  onSpawn: () => void
  onDespawn: () => void
  onToggleEnabled: () => void
  onStop: () => void
}

/**
 * One agent, compact.
 *
 * Deliberately small: this is a roster, and a roster of four agents that fills
 * a screen is a roster nobody can read at a glance. Everything on the card is
 * something the user acts on — who this is, which model answers for them, what
 * they are doing right now, and the one button that matters in that state.
 *
 * Status is live and comes from the same runtime state the world renders from,
 * so an agent shown as working here is the one typing in the office next door.
 */
export function AgentCard({
  agent,
  state,
  validation,
  provider,
  theme,
  busy,
  onEdit,
  onSpawn,
  onDespawn,
  onToggleEnabled,
  onStop
}: Props) {
  const cast = theme.characters
  const character = cast[((agent.characterSlot % cast.length) + cast.length) % cast.length]

  const status: AgentStatus = state?.status ?? 'offline'
  const model = agent.modelId ?? provider?.selectedModel ?? 'no model'
  const busyNow = state?.executionId !== null && state?.executionId !== undefined
  const blocked = validation && !validation.ok

  return (
    <li
      className={`flex flex-col border-[3px] border-ink shadow-[4px_4px_0_0_var(--color-ink)] ${
        agent.enabled ? 'bg-paper' : 'bg-paper/50'
      }`}
    >
      <div className="flex items-end justify-center border-b-[3px] border-ink bg-brand-pale pt-3">
        <CharacterSprite
          appearance={character.appearance}
          state={characterStateForAgent(status)}
          scale={3}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-pixel text-base font-bold uppercase leading-none tracking-[0.04em] text-ink">
            {agent.displayName || agent.name}
          </h3>
          {!agent.enabled && (
            <span className="shrink-0 border-2 border-rule px-1.5 font-pixel text-[9px] uppercase tracking-[0.08em] text-ink-3">
              Disabled
            </span>
          )}
        </div>

        <p className="mt-1 truncate font-ui text-[13px] leading-none text-ink-3">
          {agent.role}
        </p>

        {/* Provider badge: which engine is behind this worker. */}
        <p className="mt-2.5 flex items-baseline gap-1.5 font-mono text-[10px] leading-none">
          <span className="uppercase tracking-[0.08em] text-ink-3">
            {provider?.name ?? agent.providerId}
          </span>
          <span className="text-rule">·</span>
          <span className="truncate text-ink">{model}</span>
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {agent.spawned ? (
            <StatusChip status={status} boxed />
          ) : (
            <span className="inline-block border-2 border-rule bg-paper px-2 py-0.5 font-pixel text-[11px] uppercase tracking-[0.08em] text-ink-3">
              ○ Configured
            </span>
          )}
          {(state?.queued ?? 0) > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
              +{state?.queued} queued
            </span>
          )}
        </div>

        {/* What it is actually doing, when it is doing something. */}
        {state?.action && (
          <p className="mt-1.5 line-clamp-2 font-ui text-[12px] leading-snug text-ink-3">
            {state.action}
          </p>
        )}

        {state?.lastError && !busyNow && (
          <p className="mt-1.5 line-clamp-2 border-l-2 border-rust pl-2 font-ui text-[12px] leading-snug text-ink-3">
            {state.lastError}
          </p>
        )}

        {/*
          Why it cannot be spawned, said plainly and before the user tries.
          "Not ready" tells someone nothing; naming the missing key tells them
          exactly where to go.
        */}
        {blocked && !agent.spawned && (
          <ul className="mt-2 flex flex-col gap-0.5">
            {validation.problems.slice(0, 2).map((problem) => (
              <li
                key={problem}
                className="font-ui text-[11px] leading-snug text-ink-3"
              >
                — {problem}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={onEdit}
            className="border-2 border-ink bg-cream px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
          >
            Edit
          </button>

          {busyNow ? (
            <button
              type="button"
              onClick={onStop}
              className="border-2 border-ink bg-rust px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-cream transition-transform duration-75 hover:-translate-y-px"
            >
              Stop
            </button>
          ) : agent.spawned ? (
            <button
              type="button"
              onClick={onDespawn}
              disabled={busy !== null}
              className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink disabled:opacity-45"
            >
              Despawn
            </button>
          ) : (
            <button
              type="button"
              onClick={onSpawn}
              disabled={busy !== null || !agent.enabled || blocked}
              title={blocked ? validation?.problems.join('\n') : undefined}
              className="border-2 border-ink bg-brand px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-transform duration-75 enabled:hover:-translate-y-px enabled:hover:bg-brand-lite disabled:cursor-default disabled:opacity-40"
            >
              Spawn
            </button>
          )}

          <button
            type="button"
            onClick={onToggleEnabled}
            className="ml-auto border-2 border-rule px-2 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
          >
            {agent.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>
    </li>
  )
}
