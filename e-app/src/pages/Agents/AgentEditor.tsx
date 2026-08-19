import { useState } from 'react'
import type {
  AgentConfig,
  ExecutionProfile,
  ProviderStatus,
  ToolFamilyInfo
} from '../../shared/providerApi'
import type { Theme } from '../../themes/types'
import { CharacterSprite } from '../../world/CharacterSprite'

interface Props {
  agent: Partial<AgentConfig> | null
  theme: Theme
  providers: ProviderStatus[]
  families: ToolFamilyInfo[]
  busy: boolean
  onSave: (agent: Partial<AgentConfig>) => void
  onCancel: () => void
  onDelete?: (id: string) => void
}

const PROFILES: { id: ExecutionProfile; label: string; blurb: string }[] = [
  { id: 'quick', label: 'Quick', blurb: '12 steps. Simple questions.' },
  { id: 'normal', label: 'Balanced', blurb: '32 steps. Most work.' },
  { id: 'deep', label: 'Deep', blurb: '64 steps. Multi-file investigation.' }
]

const field =
  'w-full border-[3px] border-ink bg-cream px-3 py-2 font-ui text-sm text-ink outline-none focus:border-brand-deep'
const label =
  'font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3'

/**
 * Create or configure one agent.
 *
 * Everything the runtime needs is here: who they are, which model answers for
 * them, what they are allowed to touch and how much budget they get. All of it
 * is persisted by the main process, so it survives a restart.
 */
export function AgentEditor({
  agent,
  theme,
  providers,
  families,
  busy,
  onSave,
  onCancel,
  onDelete
}: Props) {
  const [draft, setDraft] = useState<Partial<AgentConfig>>({
    name: '',
    role: '',
    characterSlot: 0,
    providerId: providers[0]?.id ?? 'openai',
    modelId: null,
    instructions: '',
    tools: ['filesystem', 'git'],
    profile: 'normal',
    enabled: true,
    ...agent
  })

  const set = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const provider = providers.find((p) => p.id === draft.providerId)
  const cast = theme.characters
  const slot = ((draft.characterSlot ?? 0) % cast.length + cast.length) % cast.length

  const toggleTool = (id: string) => {
    const current = draft.tools ?? []
    set(
      'tools',
      current.includes(id) ? current.filter((t) => t !== id) : [...current, id]
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!draft.name?.trim()) return
        onSave(draft)
      }}
      className="max-w-[640px] border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
    >
      <h3 className="font-pixel text-base font-bold uppercase tracking-[0.04em] text-ink">
        {agent?.id ? `Configure ${agent.name}` : 'Create agent'}
      </h3>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
          />
        </div>
      </div>

      {/* Character: a slot into the active world's cast. */}
      <div className="mt-4">
        <span className={label}>Character</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {cast.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => set('characterSlot', i)}
              title={c.name}
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
          Their look in the current world. Other themes cast the same slot with
          their own character.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              set('modelId', null)
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.connected ? '' : ' (not connected)'}
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
            onChange={(e) => set('modelId', e.target.value || null)}
          >
            <option value="">
              Provider default
              {provider?.selectedModel ? ` (${provider.selectedModel})` : ''}
            </option>
            {(provider?.models ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className={label} htmlFor="agent-instructions">
          Instructions
        </label>
        <textarea
          id="agent-instructions"
          rows={4}
          className={`mt-1.5 ${field} resize-none leading-[1.5]`}
          value={draft.instructions ?? ''}
          onChange={(e) => set('instructions', e.target.value)}
          placeholder="Investigate software problems carefully. Inspect evidence before drawing conclusions."
        />
        <p className="mt-1.5 font-ui text-xs text-ink-3">
          Added to Backstage&apos;s own rules about using tools and never
          inventing project details.
        </p>
      </div>

      {/* Tools: the decision that actually matters per agent. */}
      <div className="mt-4">
        <span className={label}>Tools</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {families.map((f) => {
            const on = (draft.tools ?? []).includes(f.id)
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleTool(f.id)}
                aria-pressed={on}
                className={`border-2 px-3 py-2 text-left transition-colors ${
                  on ? 'border-ink bg-brand-pale' : 'border-rule bg-cream hover:border-ink'
                }`}
              >
                <span className="flex items-center gap-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                  <span aria-hidden className={on ? 'text-brand-deep' : 'text-ink-3'}>
                    {on ? '◆' : '◇'}
                  </span>
                  {f.label}
                </span>
                <span className="mt-0.5 block font-ui text-xs text-ink-3">
                  {f.blurb}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        <span className={label}>Execution</span>
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

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy || !draft.name?.trim()}
          className="border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-y-px enabled:hover:bg-brand-lite disabled:opacity-45"
        >
          {agent?.id ? 'Save' : 'Create agent'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border-[3px] border-ink bg-cream px-4 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 shadow-[3px_3px_0_0_var(--color-ink)] transition-colors hover:text-ink"
        >
          Cancel
        </button>

        {agent?.id && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(agent.id as string)}
            className="ml-auto border-2 border-rule px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
