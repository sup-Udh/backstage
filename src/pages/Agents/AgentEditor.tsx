import { useMemo, useState } from 'react'
import type {
  AgentConfig,
  CapabilityInfo,
  ExecutionProfile,
  ProviderStatus
} from '../../shared/providerApi'
import { DEFAULT_CAPABILITIES } from '../../shared/capabilities'
import type { CapabilityId } from '../../shared/agents'
import type { CharacterDef } from '../../characters/character.types'
import { castForSlot } from '../../project/cast'
import { CharacterSprite } from '../../world/CharacterSprite'
import { StatusChip } from '../../components/AgentStatus/StatusChip'

interface Props {
  agent: Partial<AgentConfig> | null
  agents: AgentConfig[]
  /**
   * The project's cast.
   *
   * There is no theme picker here any more. A theme belongs to the project, so
   * offering one per agent would let a single project hold people from four
   * different worlds — the exact leak the project model exists to close.
   * Changing the world is a project setting, and it re-casts everybody at once.
   */
  cast: CharacterDef[]
  providers: ProviderStatus[]
  capabilities: CapabilityInfo[]
  workspaceRoot: string | null
  busy: string | null
  onSave: (agent: Partial<AgentConfig>) => Promise<void>
  onSaveAndSpawn: (agent: Partial<AgentConfig>) => Promise<void>
  onCancel: () => void
  onDelete?: (id: string) => Promise<void>
}

const PROFILES: { id: ExecutionProfile; label: string; blurb: string }[] = [
  { id: 'quick', label: 'Quick', blurb: '12 steps. Simple questions.' },
  { id: 'normal', label: 'Balanced', blurb: '32 steps. Most work.' },
  { id: 'deep', label: 'Deep', blurb: '64 steps. Multi-file investigation.' }
]

const ROLE_SUGGESTIONS = [
  'Investigator',
  'Developer',
  'Researcher',
  'Reviewer',
  'Designer',
  'Tester',
  'Analyst'
]

const field =
  'w-full border-[3px] border-ink bg-cream px-3 py-2 font-ui text-sm text-ink outline-none focus:border-brand-deep'
const label =
  'font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3'
const section = 'mt-6 border-t-2 border-rule pt-5 first:mt-0 first:border-0 first:pt-0'

/**
 * Create or configure one agent.
 *
 * Everything the runtime needs is here: who they are, which model answers for
 * them, what they are allowed to touch, which world they belong to and who
 * they may talk to. All of it is persisted by the main process, so it survives
 * a restart.
 *
 * The form refuses to produce a broken agent rather than letting one be saved
 * and fail later: a provider with no key cannot be chosen, and the reasons an
 * agent could not be spawned are shown next to the button that would spawn it.
 */
export function AgentEditor({
  agent,
  agents,
  cast,
  providers,
  capabilities,
  workspaceRoot,
  busy,
  onSave,
  onSaveAndSpawn,
  onCancel,
  onDelete
}: Props) {
  const connected = providers.filter((p) => p.connected)

  const [draft, setDraft] = useState<Partial<AgentConfig>>(() => ({
    name: '',
    displayName: '',
    role: '',
    characterSlot: 0,
    providerId: connected[0]?.id ?? providers[0]?.id ?? 'openai',
    modelId: null,
    instructions: '',
    capabilities: [...DEFAULT_CAPABILITIES],
    profile: 'normal',
    enabled: true,
    spawned: false,
    workspace: null,
    canTalkTo: [],
    ...agent
  }))

  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const provider = providers.find((p) => p.id === draft.providerId)
  const providerConnected = provider?.connected ?? false
  const character = castForSlot(cast, draft.characterSlot ?? 0)
  const slot = cast.indexOf(character)

  const selectedModel = draft.modelId ?? provider?.selectedModel ?? null
  const modelInfo = provider?.models.find((m) => m.id === selectedModel)

  const held = (draft.capabilities ?? []) as CapabilityId[]

  const groups = useMemo(() => {
    const out: { group: string; items: CapabilityInfo[] }[] = []
    for (const capability of capabilities) {
      const found = out.find((g) => g.group === capability.group)
      if (found) found.items.push(capability)
      else out.push({ group: capability.group, items: [capability] })
    }
    return out
  }, [capabilities])

  const toggleCapability = (id: string) =>
    set(
      'capabilities',
      (held.includes(id as CapabilityId)
        ? held.filter((c) => c !== id)
        : [...held, id as CapabilityId]) as AgentConfig['capabilities']
    )

  const toggleRelationship = (id: string) => {
    const current = draft.canTalkTo ?? []
    set(
      'canTalkTo',
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    )
  }

  /* Everything that would stop this agent working, checked as it is typed. */
  const problems: string[] = []
  if (!draft.name?.trim()) problems.push('It needs a name.')
  if (!draft.role?.trim()) problems.push('It needs a role.')
  if (!providerConnected) {
    problems.push(
      `${provider?.name ?? 'That provider'} is not connected. Add its API key in Connections.`
    )
  } else if (!selectedModel) {
    problems.push(`No model is selected for ${provider?.name}.`)
  }
  if (!draft.instructions?.trim()) problems.push('It needs a system prompt.')
  if (held.length === 0) problems.push('It has no capabilities and could do nothing.')

  const canSave = Boolean(draft.name?.trim())
  const canSpawn = problems.length === 0
  const others = agents.filter((a) => a.id !== agent?.id)
  const working = busy !== null

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) void onSave(draft)
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_268px] lg:items-start"
    >
      <div className="min-w-0 border-[3px] border-ink bg-paper p-5 shadow-[4px_4px_0_0_var(--color-ink)]">
        <h2 className="font-pixel text-lg font-bold uppercase tracking-[0.04em] text-ink">
          {agent?.id ? `Configure ${agent.name}` : "Who's joining the team?"}
        </h2>

        {/* ------------------------------------------------------ identity -- */}
        <div className={section}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="agent-name">
                Name
              </label>
              <input
                id="agent-name"
                className={`mt-1.5 ${field}`}
                value={draft.name ?? ''}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Jane"
              />
            </div>
            <div>
              <label className={label} htmlFor="agent-role">
                Role
              </label>
              <input
                id="agent-role"
                className={`mt-1.5 ${field}`}
                value={draft.role ?? ''}
                onChange={(e) => set('role', e.target.value)}
                placeholder="Investigator"
                list="agent-role-suggestions"
              />
              <datalist id="agent-role-suggestions">
                {ROLE_SUGGESTIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------ provider -- */}
        <div className={section}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="agent-provider">
                Provider
              </label>
              <select
                id="agent-provider"
                className={`mt-1.5 ${field}`}
                value={draft.providerId ?? ''}
                onChange={(e) => {
                  set('providerId', e.target.value)
                  // A model id from one provider is meaningless to another.
                  set('modelId', null)
                }}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.connected}>
                    {p.name}
                    {p.connected ? '' : ' — not connected'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="agent-model">
                Model
              </label>
              <select
                id="agent-model"
                className={`mt-1.5 ${field} font-mono text-xs`}
                value={draft.modelId ?? ''}
                disabled={!providerConnected}
                onChange={(e) => set('modelId', e.target.value || null)}
              >
                <option value="">
                  {provider?.selectedModel
                    ? `Provider default (${provider.selectedModel})`
                    : 'Provider default'}
                </option>
                {(provider?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Compact facts about the chosen model, when the provider knows any. */}
          {selectedModel && (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px] text-ink-3">
              <span className="uppercase tracking-[0.08em] text-ink">
                {modelInfo?.name ?? selectedModel}
              </span>
              <span>Provider: {provider?.name}</span>
              <span>Tools: supported</span>
              {modelInfo?.description && (
                <span className="text-ink-3">{modelInfo.description}</span>
              )}
            </p>
          )}

          {!providerConnected && (
            <p className="mt-2 border-2 border-ink bg-brand-pale px-2.5 py-1.5 font-ui text-[12px] leading-snug text-ink">
              {connected.length === 0
                ? 'No provider connections available. Connect a provider in Connections to create an AI agent.'
                : `${provider?.name} is not connected. Pick a connected provider, or add its key in Connections.`}
            </p>
          )}
        </div>

        {/* ------------------------------------------------- system prompt -- */}
        <div className={section}>
          <label className={label} htmlFor="agent-instructions">
            System prompt
          </label>
          <textarea
            id="agent-instructions"
            rows={7}
            className={`mt-1.5 ${field} resize-y leading-[1.6]`}
            value={draft.instructions ?? ''}
            onChange={(e) => set('instructions', e.target.value)}
            placeholder={
              'You are the investigator of the team.\nInspect the project carefully before making conclusions.\nPrefer evidence from actual files.'
            }
          />
          <p className="mt-1.5 font-ui text-xs text-ink-3">
            Added to Backstage&apos;s own rules about using tools and never
            inventing project details.
          </p>
        </div>

        {/* -------------------------------------------------- capabilities -- */}
        <div className={section}>
          <span className={label}>Capabilities</span>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <fieldset key={group.group} className="border-2 border-rule p-2.5">
                <legend className="px-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                  {group.group}
                </legend>
                <div className="flex flex-col gap-1.5">
                  {group.items.map((capability) => {
                    const on = held.includes(capability.id)
                    return (
                      <button
                        key={capability.id}
                        type="button"
                        onClick={() => toggleCapability(capability.id)}
                        aria-pressed={on}
                        title={capability.blurb}
                        className="flex items-baseline gap-2 text-left"
                      >
                        <span
                          aria-hidden
                          className={`font-mono text-[13px] leading-none ${
                            on ? 'text-brand-deep' : 'text-ink-3'
                          }`}
                        >
                          {on ? '☑' : '☐'}
                        </span>
                        <span
                          className={`font-ui text-[13px] leading-snug ${
                            on ? 'text-ink' : 'text-ink-3'
                          }`}
                        >
                          {capability.label}
                          {capability.privileged && (
                            <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-rust">
                              asks first
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <p className="mt-1.5 font-ui text-xs text-ink-3">
            Nothing is granted automatically. Anything that can change your
            project or run a command asks you before it happens.
          </p>
        </div>

        {/* ----------------------------------------------------- workspace -- */}
        <div className={section}>
          <label className={label} htmlFor="agent-workspace">
            Workspace access
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => set('workspace', null)}
              aria-pressed={!draft.workspace}
              className={`border-2 px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                !draft.workspace
                  ? 'border-ink bg-brand text-ink'
                  : 'border-rule text-ink-3 hover:border-ink hover:text-ink'
              }`}
            >
              Current workspace
            </button>
            <button
              type="button"
              onClick={() => set('workspace', draft.workspace || workspaceRoot)}
              aria-pressed={Boolean(draft.workspace)}
              disabled={!workspaceRoot && !draft.workspace}
              className={`border-2 px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors disabled:opacity-40 ${
                draft.workspace
                  ? 'border-ink bg-brand text-ink'
                  : 'border-rule text-ink-3 enabled:hover:border-ink enabled:hover:text-ink'
              }`}
            >
              Pin to a folder
            </button>
          </div>
          {draft.workspace && (
            <input
              id="agent-workspace"
              className={`mt-2 ${field} font-mono text-xs`}
              value={draft.workspace}
              onChange={(e) => set('workspace', e.target.value || null)}
              placeholder={workspaceRoot ?? 'C:\\code\\project'}
            />
          )}
          <p className="mt-1.5 font-ui text-xs text-ink-3">
            {draft.workspace
              ? 'This agent always works in that folder, whichever project is open.'
              : 'This agent works in whichever project is open. It cannot reach outside it.'}
          </p>
        </div>

        {/* ------------------------------------------------------- character -- */}
        <div className={section}>
          <label className={label} htmlFor="agent-character">
            Character
          </label>
          <select
            id="agent-character"
            className={`mt-1.5 ${field}`}
            value={slot}
            onChange={(e) => set('characterSlot', Number(e.target.value))}
          >
            {cast.map((c, i) => (
              <option key={c.id} value={i}>
                {c.name} — {c.role}
              </option>
            ))}
          </select>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {cast.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set('characterSlot', i)}
                title={`${c.name} — ${c.role}`}
                aria-pressed={i === slot}
                className={`border-2 p-1 transition-colors ${
                  i === slot
                    ? 'border-ink bg-brand'
                    : 'border-rule bg-cream hover:border-ink'
                }`}
              >
                <CharacterSprite appearance={c.appearance} scale={2} />
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-ui text-xs text-ink-3">
            Only this project&apos;s cast is offered. The world, and who is in
            it, are project settings — so a character can never appear in a
            project that did not choose them.
          </p>
        </div>

        {/* -------------------------------------------------- relationships -- */}
        {others.length > 0 && (
          <div className={section}>
            <span className={label}>Can talk to</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {others.map((other) => {
                const on = (draft.canTalkTo ?? []).includes(other.id)
                return (
                  <button
                    key={other.id}
                    type="button"
                    onClick={() => toggleRelationship(other.id)}
                    aria-pressed={on}
                    className={`border-2 px-3 py-2 text-left transition-colors ${
                      on
                        ? 'border-ink bg-brand-pale'
                        : 'border-rule bg-cream hover:border-ink'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                      <span
                        aria-hidden
                        className={on ? 'text-brand-deep' : 'text-ink-3'}
                      >
                        {on ? '☑' : '☐'}
                      </span>
                      {other.displayName || other.name}
                    </span>
                    <span className="mt-0.5 block font-ui text-xs text-ink-3">
                      {other.role}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 font-ui text-xs text-ink-3">
              One direction only. Letting this agent contact someone does not
              let them reply with work of their own — grant that on their card.
              Needs the &quot;Talk to other agents&quot; capability above.
            </p>
          </div>
        )}

        {/* ------------------------------------------------------ execution -- */}
        <div className={section}>
          <span className={label}>Execution budget</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set('profile', p.id)}
                aria-pressed={draft.profile === p.id}
                title={p.blurb}
                className={`border-2 px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                  draft.profile === p.id
                    ? 'border-ink bg-brand text-ink'
                    : 'border-rule text-ink-3 hover:border-ink hover:text-ink'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-ui text-xs text-ink-3">
            {PROFILES.find((p) => p.id === draft.profile)?.blurb}
          </p>
        </div>

        {/* -------------------------------------------------------- actions -- */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t-2 border-rule pt-5">
          <button
            type="button"
            disabled={working || !canSpawn}
            onClick={() => void onSaveAndSpawn(draft)}
            title={canSpawn ? undefined : problems.join('\n')}
            className="border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-x-px enabled:hover:-translate-y-px enabled:hover:bg-brand-lite disabled:cursor-default disabled:opacity-40"
          >
            {agent?.spawned ? 'Save' : 'Spawn agent'}
          </button>

          <button
            type="submit"
            disabled={working || !canSave}
            className="border-[3px] border-ink bg-cream px-4 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-colors enabled:hover:bg-brand-pale disabled:opacity-40"
          >
            Save without spawning
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="border-2 border-rule px-3 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
          >
            Cancel
          </button>

          {agent?.id && onDelete && (
            <div className="ml-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="font-ui text-[12px] text-ink">
                    Delete {agent.name}?
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 hover:border-ink hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(agent.id as string)}
                    className="border-2 border-ink bg-rust px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-cream"
                  >
                    Delete
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-rust hover:text-rust"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>

        {confirmDelete && (
          <p className="mt-2 font-ui text-[12px] leading-snug text-ink-3">
            This removes the agent&apos;s configuration and any automations
            pointing at it. Their conversation history is kept on disk.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------- preview -- */}
      <aside className="lg:sticky lg:top-4">
        <div className="border-[3px] border-brand bg-ink shadow-[4px_4px_0_0_rgba(27,27,42,0.5)]">
          <div className="flex justify-center border-b-2 border-ink-3 bg-ink-2 py-4">
            <CharacterSprite
              appearance={character.appearance}
              state="idle"
              scale={4}
            />
          </div>
          <div className="p-3">
            <p className="font-pixel text-base font-bold uppercase leading-none tracking-[0.06em] text-brand">
              {draft.displayName || draft.name || 'Unnamed'}
            </p>
            <p className="mt-1.5 font-ui text-xs leading-none text-cream-2">
              {draft.role || 'No role yet'}
            </p>
            <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-dim">
              {provider?.name ?? draft.providerId}
              {selectedModel ? ` · ${selectedModel}` : ''}
            </p>
            <div className="mt-2.5">
              <StatusChip status={canSpawn ? 'ready' : 'offline'} dark />
            </div>
            <p className="mt-2 font-ui text-[11px] leading-snug text-dim">
              A preview. Nobody walks into the office until you spawn them.
            </p>
          </div>
        </div>

        {/* Exactly what stands between this draft and a working agent. */}
        {problems.length > 0 && (
          <div className="mt-3 border-[3px] border-ink bg-paper p-3 shadow-[4px_4px_0_0_var(--color-ink)]">
            <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
              Before spawning
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {problems.map((problem) => (
                <li
                  key={problem}
                  className="font-ui text-[12px] leading-snug text-ink-3"
                >
                  — {problem}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </form>
  )
}
