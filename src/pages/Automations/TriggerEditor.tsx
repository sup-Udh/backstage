import { useState } from 'react'
import type {
  AgentConfig,
  OrchestrationSettings,
  Trigger,
  TriggerActionType,
  TriggerEventType
} from '../../shared/providerApi'

interface Props {
  trigger: Partial<Trigger> | null
  agents: AgentConfig[]
  settings: OrchestrationSettings
  busy: string | null
  onSave: (trigger: Partial<Trigger>) => Promise<void>
  onCancel: () => void
}

/**
 * WHEN / IF / THEN, as a form.
 *
 * The safety limits are part of the trigger rather than a global preference,
 * because the automation that needs a tight cooldown is rarely the one the
 * global default was chosen for. Whichever of the two is stricter applies.
 */

const EVENTS: { id: TriggerEventType; label: string; needsSource: boolean }[] = [
  { id: 'agent.task.completed', label: 'Agent completes a task', needsSource: true },
  { id: 'agent.task.started', label: 'Agent starts a task', needsSource: true },
  { id: 'agent.error', label: 'Agent errors', needsSource: true },
  { id: 'agent.message.received', label: 'Agent receives a message', needsSource: true },
  { id: 'task.created', label: 'A task is created', needsSource: false },
  { id: 'task.completed', label: 'Any task completes', needsSource: false },
  { id: 'file.changed', label: 'A file changes', needsSource: false },
  { id: 'git.changed', label: 'Git state changes', needsSource: false }
]

const ACTIONS: { id: TriggerActionType; label: string; blurb: string }[] = [
  {
    id: 'request.review',
    label: 'Ask an agent to review',
    blurb: 'Starts a task, with the completed work attached as context.'
  },
  {
    id: 'create.task',
    label: 'Create a task for an agent',
    blurb: 'Starts a task on their own queue. Costs a provider call.'
  },
  {
    id: 'send.message',
    label: 'Send a message to an agent',
    blurb: 'Context only. Lands in their session and starts nothing.'
  },
  {
    id: 'notify.user',
    label: 'Notify me',
    blurb: 'Tells you. No agent is asked to do anything.'
  }
]

const field =
  'w-full border-[3px] border-ink bg-cream px-3 py-2 font-ui text-sm text-ink outline-none focus:border-brand-deep'
const label =
  'font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3'

export function TriggerEditor({
  trigger,
  agents,
  settings,
  busy,
  onSave,
  onCancel
}: Props) {
  const [draft, setDraft] = useState<Partial<Trigger>>(() => ({
    name: '',
    enabled: true,
    event: 'agent.task.completed',
    sourceAgentId: null,
    condition: null,
    action: 'request.review',
    targetAgentId: null,
    message: '',
    maxChainDepth: settings.maxChainDepth,
    cooldownMs: settings.defaultCooldownMs,
    ...trigger
  }))

  const set = <K extends keyof Trigger>(key: K, value: Trigger[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const event = EVENTS.find((e) => e.id === draft.event)
  const action = ACTIONS.find((a) => a.id === draft.action)
  const needsTarget = draft.action !== 'notify.user'

  const source = agents.find((a) => a.id === draft.sourceAgentId)
  const target = agents.find((a) => a.id === draft.targetAgentId)

  /*
   * An automation must not be a way around the relationship graph. If the
   * source may not contact the target, the trigger will be refused at run
   * time — better to say so while it is being written.
   */
  const permissionGap =
    needsTarget && source && target && !source.canTalkTo.includes(target.id)
      ? `${source.name} is not permitted to contact ${target.name}. Add it on ${source.name}'s card, or this automation will never run.`
      : null

  const problems: string[] = []
  if (!draft.name?.trim()) problems.push('Give it a name.')
  if (needsTarget && !draft.targetAgentId) problems.push('Choose a target agent.')
  if (!draft.message?.trim() && draft.action !== 'notify.user') {
    problems.push('Write the message the target will receive.')
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (problems.length === 0) void onSave(draft)
      }}
      className="max-w-[680px] border-[3px] border-ink bg-paper p-5 shadow-[4px_4px_0_0_var(--color-ink)]"
    >
      <h2 className="font-pixel text-lg font-bold uppercase tracking-[0.04em] text-ink">
        {trigger?.id ? 'Edit automation' : 'Create trigger'}
      </h2>

      <div className="mt-5">
        <label className={label} htmlFor="trigger-name">
          Name
        </label>
        <input
          id="trigger-name"
          className={`mt-1.5 ${field}`}
          value={draft.name ?? ''}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Michael reviews Jane's work"
        />
      </div>

      {/* --------------------------------------------------------- WHEN -- */}
      <fieldset className="mt-6 border-2 border-rule p-3">
        <legend className="px-1 font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
          When
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="trigger-event">
              Event
            </label>
            <select
              id="trigger-event"
              className={`mt-1.5 ${field}`}
              value={draft.event}
              onChange={(e) => set('event', e.target.value as TriggerEventType)}
            >
              {EVENTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>

          {event?.needsSource && (
            <div>
              <label className={label} htmlFor="trigger-source">
                Source agent
              </label>
              <select
                id="trigger-source"
                className={`mt-1.5 ${field}`}
                value={draft.sourceAgentId ?? ''}
                onChange={(e) => set('sourceAgentId', e.target.value || null)}
              >
                <option value="">Any agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.role}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </fieldset>

      {/* ----------------------------------------------------------- IF -- */}
      <fieldset className="mt-4 border-2 border-rule p-3">
        <legend className="px-1 font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
          If
        </legend>
        <label className={label} htmlFor="trigger-condition">
          Contains (optional)
        </label>
        <input
          id="trigger-condition"
          className={`mt-1.5 ${field} font-mono text-xs`}
          value={draft.condition ?? ''}
          onChange={(e) => set('condition', e.target.value || null)}
          placeholder="auth"
        />
        <p className="mt-1.5 font-ui text-xs text-ink-3">
          Only run when the event mentions this. Leave blank to run every time.
        </p>
      </fieldset>

      {/* --------------------------------------------------------- THEN -- */}
      <fieldset className="mt-4 border-2 border-rule p-3">
        <legend className="px-1 font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
          Then
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="trigger-action">
              Action
            </label>
            <select
              id="trigger-action"
              className={`mt-1.5 ${field}`}
              value={draft.action}
              onChange={(e) => set('action', e.target.value as TriggerActionType)}
            >
              {ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {needsTarget && (
            <div>
              <label className={label} htmlFor="trigger-target">
                Target agent
              </label>
              <select
                id="trigger-target"
                className={`mt-1.5 ${field}`}
                value={draft.targetAgentId ?? ''}
                onChange={(e) => set('targetAgentId', e.target.value || null)}
              >
                <option value="">Choose…</option>
                {agents
                  .filter((a) => a.id !== draft.sourceAgentId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.role}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>

        <p className="mt-1.5 font-ui text-xs text-ink-3">{action?.blurb}</p>

        <div className="mt-3">
          <label className={label} htmlFor="trigger-message">
            Message
          </label>
          <textarea
            id="trigger-message"
            rows={3}
            className={`mt-1.5 ${field} resize-y leading-[1.5]`}
            value={draft.message ?? ''}
            onChange={(e) => set('message', e.target.value)}
            placeholder="Review the completed work for problems and report what you find."
          />
          <p className="mt-1.5 font-ui text-xs text-ink-3">
            What actually happened is attached automatically, so the target
            knows which work you mean.
          </p>
        </div>
      </fieldset>

      {/* ------------------------------------------------------- SAFETY -- */}
      <fieldset className="mt-4 border-2 border-rule p-3">
        <legend className="px-1 font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
          Safety
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="trigger-depth">
              Max chain depth
            </label>
            <input
              id="trigger-depth"
              type="number"
              min={1}
              max={10}
              className={`mt-1.5 ${field} font-mono`}
              value={draft.maxChainDepth ?? settings.maxChainDepth}
              onChange={(e) => set('maxChainDepth', Number(e.target.value))}
            />
          </div>
          <div>
            <label className={label} htmlFor="trigger-cooldown">
              Cooldown (seconds)
            </label>
            <input
              id="trigger-cooldown"
              type="number"
              min={0}
              max={3600}
              className={`mt-1.5 ${field} font-mono`}
              value={Math.round((draft.cooldownMs ?? settings.defaultCooldownMs) / 1000)}
              onChange={(e) => set('cooldownMs', Number(e.target.value) * 1000)}
            />
          </div>
        </div>

        <p className="mt-2 font-ui text-xs leading-snug text-ink-3">
          The workspace limit is {settings.maxChainDepth} deep, and whichever is
          stricter wins. A message identical to one already sent in the same
          chain is refused regardless, which is what stops two agents asking
          each other the same question forever.
        </p>
      </fieldset>

      {permissionGap && (
        <p className="mt-4 border-2 border-ink bg-brand-pale px-3 py-2 font-ui text-[13px] leading-snug text-ink">
          {permissionGap}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy !== null || problems.length > 0}
          title={problems.join('\n') || undefined}
          className="border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-y-px enabled:hover:bg-brand-lite disabled:cursor-default disabled:opacity-40"
        >
          {trigger?.id ? 'Save automation' : 'Enable trigger'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border-2 border-rule px-3 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
        >
          Cancel
        </button>
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {problems.map((problem) => (
            <li key={problem} className="font-ui text-[12px] text-ink-3">
              — {problem}
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
