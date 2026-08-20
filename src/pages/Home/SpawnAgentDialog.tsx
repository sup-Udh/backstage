import { useEffect, useMemo, useState } from 'react'
import type { Theme } from '../../themes/types'
import type { AgentConfig, CapabilityId } from '../../shared/providerApi'
import { CAPABILITIES, DEFAULT_CAPABILITIES } from '../../shared/capabilities'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import { CharacterSprite } from '../../world/CharacterSprite'

interface Props {
  theme: Theme
  onClose: () => void
  /** Called with the new agent once it is actually in the world. */
  onSpawned: (agent: AgentConfig) => void
}

/**
 * Hire someone.
 *
 * Everything chosen here is real configuration: the provider is one the user
 * has actually connected, the model is one that provider reported the account
 * can reach, and pressing Spawn writes an agent to the roster and brings it
 * into the world through the same two calls the Agents page uses. There is no
 * separate path for "quick" agents — a spawned agent is an agent.
 *
 * Deliberately short. The full editor already exists on the Agents page for
 * instructions, execution profile and fine-grained permissions; asking for all
 * of that before someone can add a second Gemini agent would make the fast
 * path the slow one.
 */
export function SpawnAgentDialog({ theme, onClose, onSpawned }: Props) {
  const providers = useBackstage((s) => s.providers)
  const agents = useTeam((s) => s.agents)
  const save = useTeam((s) => s.save)
  const spawn = useTeam((s) => s.spawn)

  /* Only providers with a working connection can be chosen. */
  const connected = useMemo(
    () => providers.filter((p) => p.connected && p.hasKey),
    [providers]
  )

  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [slot, setSlot] = useState(0)
  const [capabilities, setCapabilities] = useState<CapabilityId[]>([
    ...DEFAULT_CAPABILITIES
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const provider = connected.find((p) => p.id === providerId)

  /* Default to the first connected provider once the list arrives. */
  useEffect(() => {
    if (!providerId && connected[0]) setProviderId(connected[0].id)
  }, [connected, providerId])

  /*
   * The model list belongs to the provider, so changing provider has to
   * re-pick. Keeping the old id would offer a Gemini model on an OpenAI agent
   * and fail at the first request.
   */
  useEffect(() => {
    if (!provider) return
    const models = provider.models
    if (models.some((m) => m.id === modelId)) return
    setModelId(provider.selectedModel ?? models[0]?.id ?? '')
  }, [provider, modelId])

  /**
   * A free character.
   *
   * Slots already worn by a spawned agent are taken, so a new hire does not
   * walk in wearing a face already at a desk. The theme's cast is finite and
   * the roster is not, so the search wraps: past the end of the cast the same
   * characters come round again, which is better than refusing to spawn.
   */
  const takenSlots = useMemo(
    () => new Set(agents.filter((a) => a.spawned).map((a) => a.characterSlot)),
    [agents]
  )

  useEffect(() => {
    if (!takenSlots.has(slot)) return
    for (let i = 0; i < theme.characters.length; i++) {
      if (!takenSlots.has(i)) {
        setSlot(i)
        return
      }
    }
    // Every character is in use; the cast wraps rather than blocking a spawn.
    setSlot(agents.length % theme.characters.length)
    // Only when the roster changes: this must not fight the user's own pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takenSlots.size, theme.id])

  /** "Gemini agent 2" — the next free number for this provider. */
  const suggestedName = useMemo(() => {
    if (!provider) return 'New agent'
    const base = `${provider.name} agent`
    let n = 1
    const taken = new Set(agents.map((a) => a.name.toLowerCase()))
    while (taken.has(`${base} ${n}`.toLowerCase())) n++
    return `${base} ${n}`
  }, [provider, agents])

  const toggle = (id: CapabilityId) =>
    setCapabilities((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    )

  const submit = async () => {
    if (!provider || !modelId) return
    setBusy(true)
    setError(null)
    try {
      const finalName = name.trim() || suggestedName
      const saved = await save({
        name: finalName,
        role: role.trim() || 'Agent',
        providerId: provider.id,
        modelId,
        characterSlot: slot,
        themeId: theme.id,
        capabilities,
        profile: 'normal',
        enabled: true,
        instructions:
          `You are ${finalName}, a ${role.trim() || 'general-purpose'} agent on this team. ` +
          'Inspect the project before drawing conclusions, and say plainly what you verified and what you did not.'
      })

      /*
       * `save` returns the whole roster, and the new agent is the one that was
       * not there before. Matching on name would break the moment two agents
       * share one, which the auto-naming makes unlikely but the free-text
       * field makes possible.
       */
      const before = new Set(agents.map((a) => a.id))
      const created = saved.find((a) => !before.has(a.id))
      if (!created) {
        setError('The agent was saved but could not be found afterwards.')
        return
      }

      // Spawning validates: a misconfigured agent is refused here rather than
      // appearing in the world and failing on its first task.
      const validation = await spawn(created.id)
      if (!validation.ok) {
        setError(validation.problems[0] ?? 'That agent could not be spawned.')
        return
      }

      onSpawned(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not spawn that agent.')
    } finally {
      setBusy(false)
    }
  }

  const character = theme.characters[slot % theme.characters.length]

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-ink/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Spawn a new agent"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-[420px] overflow-y-auto border-[3px] border-ink bg-cream shadow-[6px_6px_0_0_var(--color-brand-shadow)]"
      >
        <header className="flex items-center justify-between border-b-[3px] border-ink bg-brand px-3 py-2">
          <h2 className="font-pixel text-sm font-bold uppercase tracking-[0.08em] text-ink">
            Spawn new agent
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-xs text-ink hover:text-ink-3"
          >
            ✕
          </button>
        </header>

        {connected.length === 0 ? (
          <div className="p-3">
            <p className="font-ui text-[13px] leading-snug text-ink">
              No provider is connected yet. Connect OpenAI or Gemini in
              Connections and you can hire as many agents as you like.
            </p>
            <button
              type="button"
              onClick={() => {
                useBackstage.getState().setPage('account')
                onClose()
              }}
              className="mt-3 border-2 border-ink bg-brand px-3 py-1 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-ink shadow-[2px_2px_0_0_var(--color-ink)]"
            >
              Open Connections
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            <Field label="Provider">
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="w-full border-2 border-ink bg-paper px-2 py-1 font-ui text-[12px] text-ink outline-none focus:border-brand-deep"
              >
                {connected.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ✓
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Model">
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={!provider || provider.models.length === 0}
                className="w-full border-2 border-ink bg-paper px-2 py-1 font-ui text-[12px] text-ink outline-none focus:border-brand-deep disabled:text-ink-3"
              >
                {provider?.models.length === 0 && (
                  <option value="">No models reported by this account</option>
                )}
                {provider?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex gap-2">
              <Field label="Name" className="flex-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={suggestedName}
                  className="w-full border-2 border-ink bg-paper px-2 py-1 font-ui text-[12px] text-ink outline-none focus:border-brand-deep placeholder:text-ink-3"
                />
              </Field>
              <Field label="Role" className="flex-1">
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Researcher"
                  className="w-full border-2 border-ink bg-paper px-2 py-1 font-ui text-[12px] text-ink outline-none focus:border-brand-deep placeholder:text-ink-3"
                />
              </Field>
            </div>

            <Field label={`Character — ${theme.name}`}>
              <div className="flex items-center gap-2">
                <div className="shrink-0 border-2 border-ink bg-ink-2 p-1">
                  <CharacterSprite
                    appearance={character.appearance}
                    state="idle"
                    scale={2}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {theme.characters.map((c, i) => {
                    const taken = takenSlots.has(i)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSlot(i)}
                        title={taken ? `${c.name} is already at a desk` : c.name}
                        className={[
                          'border-2 px-1.5 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors',
                          i === slot
                            ? 'border-ink bg-brand text-ink'
                            : taken
                              ? 'border-rule bg-cream-2 text-ink-3 line-through'
                              : 'border-rule bg-paper text-ink-3 hover:border-ink hover:text-ink'
                        ].join(' ')}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Field>

            <Field label="Can">
              <div className="flex flex-wrap gap-1">
                {CAPABILITIES.map((c) => {
                  const on = capabilities.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      title={c.blurb}
                      aria-pressed={on}
                      className={[
                        'border-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] transition-colors',
                        on
                          ? c.privileged
                            ? 'border-rust bg-rust text-cream'
                            : 'border-ink bg-brand text-ink'
                          : 'border-rule bg-paper text-ink-3 hover:border-ink'
                      ].join(' ')}
                    >
                      {c.group} · {c.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            {error && (
              <p className="border-2 border-rust bg-paper px-2 py-1 font-ui text-[12px] leading-snug text-rust">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border-2 border-ink bg-cream px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-cream-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !provider || !modelId}
                className="flex-[2] border-2 border-ink bg-brand px-3 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-y-px hover:bg-brand-lite disabled:translate-y-0 disabled:bg-cream-2 disabled:text-ink-3 disabled:shadow-none"
              >
                {busy ? 'Spawning…' : 'Spawn'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  className,
  children
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  )
}
