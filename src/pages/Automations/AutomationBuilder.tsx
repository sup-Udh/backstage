import { useState } from 'react'
import type {
  AgentConfig,
  OrchestrationSettings,
  Trigger,
  TriggerActionType,
  TriggerEventType,
  TriggerSchedule
} from '../../shared/providerApi'
import {
  DAY_NAMES,
  DEFAULT_SCHEDULE,
  WEEKDAYS,
  clockLabel,
  describeSchedule,
  isScheduleEvent
} from '../../shared/schedule'

/**
 * WHEN → WHO → WHAT → RESULT, four questions at a time.
 *
 * The form this replaces asked all of them at once, in a single column of
 * fifteen controls, and the two that actually decide what an automation *is* —
 * the trigger and the agent — sat between a chain-depth number field and a
 * cooldown. Somebody who had never written an automation could not tell which
 * parts were the idea and which were the safety rails.
 *
 * So: one question per step, each with its own answer already chosen, and a
 * review that reads as a sentence before anything is saved. The safety rails
 * are still there and still editable, in the last step, under their own
 * heading, where they belong.
 */

interface Props {
  /** A template, an existing automation, or an empty draft. */
  initial: Partial<Trigger>
  agents: AgentConfig[]
  settings: OrchestrationSettings
  busy: string | null
  onSave: (draft: Partial<Trigger>) => Promise<void>
  onCancel: () => void
}

type StepId = 'when' | 'who' | 'what' | 'result'

const STEPS: { id: StepId; label: string; question: string }[] = [
  { id: 'when', label: 'When', question: 'When should this run?' },
  { id: 'who', label: 'Who', question: 'Which agents should do it?' },
  { id: 'what', label: 'What', question: 'What should they do?' },
  { id: 'result', label: 'Result', question: 'What happens with the result?' }
]

/**
 * The triggers that actually fire.
 *
 * Every one is either polled by the scheduler or emitted on the runtime's own
 * event bus. Triggers the brief asked for that nothing emits — a build
 * finishing, a test run completing, a project opening — are deliberately
 * absent rather than present and inert: a dropdown entry that silently never
 * fires is the worst possible way to learn a feature does not exist.
 */
const TRIGGERS: {
  id: TriggerEventType
  group: string
  label: string
  blurb: string
  needsSource?: boolean
}[] = [
  {
    id: 'schedule.daily',
    group: 'Time',
    label: 'Every day',
    blurb: 'At a time you choose, on the days you choose.'
  },
  {
    id: 'schedule.weekly',
    group: 'Time',
    label: 'Every week',
    blurb: 'On chosen days, at a chosen time.'
  },
  {
    id: 'schedule.interval',
    group: 'Time',
    label: 'On a repeating interval',
    blurb: 'Every so many minutes or hours, while Backstage is open.'
  },
  {
    id: 'file.changed',
    group: 'Workspace',
    label: 'A file changes',
    blurb: 'Anything created, edited or deleted in the project folder.'
  },
  {
    id: 'file.created',
    group: 'Workspace',
    label: 'A file is created',
    blurb: 'A new file appears in the project folder.'
  },
  {
    id: 'file.deleted',
    group: 'Workspace',
    label: 'A file is deleted',
    blurb: 'A file disappears from the project folder.'
  },
  {
    id: 'git.changed',
    group: 'Git',
    label: 'Git state changes',
    blurb: 'A commit, a branch change, or the working tree moving.'
  },
  {
    id: 'agent.task.completed',
    group: 'Agents',
    label: 'An agent finishes a task',
    blurb: 'The obvious pairing: one agent works, another reviews.',
    needsSource: true
  },
  {
    id: 'agent.error',
    group: 'Agents',
    label: 'An agent fails',
    blurb: 'Something went wrong and somebody should look at it.',
    needsSource: true
  },
  {
    id: 'agent.idle',
    group: 'Agents',
    label: 'An agent becomes idle',
    blurb: 'They have finished everything on their queue.',
    needsSource: true
  },
  {
    id: 'manual',
    group: 'Manual',
    label: 'Only when I run it',
    blurb: 'Nothing fires it. You press Run now.'
  }
]

const ACTIONS: { id: TriggerActionType; label: string; blurb: string }[] = [
  {
    id: 'create.task',
    label: 'Give them a task',
    blurb: 'Real work on their own queue. Costs a provider call.'
  },
  {
    id: 'request.review',
    label: 'Ask them to review it',
    blurb: 'A task, with whatever triggered it attached as context.'
  },
  {
    id: 'send.message',
    label: 'Send them a note',
    blurb: 'Context only. Waits in their session and starts nothing.'
  },
  {
    id: 'notify.user',
    label: 'Just tell me',
    blurb: 'No agent is asked to do anything.'
  }
]

const field =
  'w-full border-[3px] border-ink bg-cream px-3 py-2 font-ui text-sm text-ink outline-none focus:border-brand-deep'
const label =
  'font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3'

export function AutomationBuilder({
  initial,
  agents,
  settings,
  busy,
  onSave,
  onCancel
}: Props) {
  const [draft, setDraft] = useState<Partial<Trigger>>(() => ({
    name: '',
    enabled: true,
    event: 'schedule.daily',
    schedule: { ...DEFAULT_SCHEDULE },
    sourceAgentId: null,
    condition: null,
    action: 'create.task',
    agentIds: [],
    message: '',
    permissionMode: 'inherit',
    maxChainDepth: settings.maxChainDepth,
    cooldownMs: settings.defaultCooldownMs,
    ...initial
  }))
  const [step, setStep] = useState(0)

  const set = <K extends keyof Trigger>(key: K, value: Trigger[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const event = draft.event ?? 'schedule.daily'
  const trigger = TRIGGERS.find((t) => t.id === event)
  const action = draft.action ?? 'create.task'
  const needsAgents = action !== 'notify.user'
  const chosen = draft.agentIds ?? []
  const schedule = draft.schedule ?? DEFAULT_SCHEDULE

  const setSchedule = (patch: Partial<TriggerSchedule>) =>
    set('schedule', { ...schedule, ...patch })

  const toggleAgent = (id: string) =>
    set(
      'agentIds',
      chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]
    )

  /** Everything that has to be true before this can be saved. */
  const problems: string[] = []
  if (!draft.name?.trim()) problems.push('Give it a name.')
  if (needsAgents && chosen.length === 0) problems.push('Choose at least one agent.')
  if (needsAgents && !draft.message?.trim()) problems.push('Say what they should do.')
  if (!needsAgents && !draft.message?.trim()) {
    problems.push('Write the note you want to see.')
  }

  /*
   * An automation must not be a way around the relationship graph. If the
   * source may not contact a target the run will be refused at the moment it
   * fires — better to say so while it is being written than to leave somebody
   * wondering why an enabled automation never does anything.
   */
  const source = agents.find((a) => a.id === draft.sourceAgentId)
  const permissionGaps = source
    ? chosen
        .map((id) => agents.find((a) => a.id === id))
        .filter((a): a is AgentConfig => !!a && !source.canTalkTo.includes(a.id))
        .map((a) => a.name)
    : []

  const unspawned = chosen
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is AgentConfig => !!a && (!a.enabled || !a.spawned))

  const stepValid = (index: number): boolean => {
    if (index === 1) return !needsAgents || chosen.length > 0
    if (index === 2) return !!draft.message?.trim()
    return true
  }

  const last = step === STEPS.length - 1

  return (
    <div className="max-w-[720px]">
      {/* -------------------------------------------------------- stepper -- */}
      <ol className="mb-5 flex flex-wrap gap-1">
        {STEPS.map((s, i) => {
          const on = i === step
          const done = i < step
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={on ? 'step' : undefined}
                className={[
                  'border-2 px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                  on
                    ? 'border-ink bg-brand text-on-brand'
                    : done
                      ? 'border-ink bg-cream text-ink'
                      : 'border-rule text-ink-3 hover:border-ink hover:text-ink'
                ].join(' ')}
              >
                {i + 1}. {s.label}
              </button>
            </li>
          )
        })}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (problems.length === 0) void onSave(draft)
        }}
        className="border-[3px] border-ink bg-paper p-5 shadow-[4px_4px_0_0_var(--color-shadow)]"
      >
        <h2 className="font-pixel text-lg font-bold uppercase tracking-[0.04em] text-ink">
          {STEPS[step].question}
        </h2>

        {/* ----------------------------------------------------- 1. WHEN -- */}
        {step === 0 && (
          <div className="mt-4">
            <div className="flex flex-col gap-4">
              {[...new Set(TRIGGERS.map((t) => t.group))].map((group) => (
                <div key={group}>
                  <h3 className={label}>{group}</h3>
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    {TRIGGERS.filter((t) => t.group === group).map((t) => {
                      const on = t.id === event
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            set('event', t.id)
                            if (isScheduleEvent(t.id) && !draft.schedule) {
                              set('schedule', { ...DEFAULT_SCHEDULE })
                            }
                          }}
                          aria-pressed={on}
                          className={[
                            'border-2 px-2.5 py-1.5 text-left transition-colors',
                            on
                              ? 'border-ink bg-brand-pale'
                              : 'border-rule bg-cream hover:border-ink'
                          ].join(' ')}
                        >
                          <span className="block font-pixel text-[11px] font-bold uppercase tracking-[0.04em] text-ink">
                            {t.label}
                          </span>
                          <span className="mt-0.5 block font-ui text-[11px] leading-snug text-ink-3">
                            {t.blurb}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Time triggers need a time. */}
            {isScheduleEvent(event) && (
              <fieldset className="mt-5 border-2 border-rule p-3">
                <legend className="px-1 font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
                  {describeSchedule(event, schedule)}
                </legend>

                {event === 'schedule.interval' ? (
                  <label className="block">
                    <span className={label}>Every N minutes</span>
                    <input
                      type="number"
                      min={5}
                      max={10080}
                      value={schedule.everyMinutes}
                      onChange={(e) =>
                        setSchedule({ everyMinutes: Number(e.target.value) })
                      }
                      className={`mt-1.5 ${field} font-mono`}
                    />
                    <span className="mt-1 block font-ui text-xs text-ink-3">
                      Interval automations only run while Backstage is open. A
                      missed window fires once when it reopens, not once for
                      every hour it was closed.
                    </span>
                  </label>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={label}>Time</span>
                      <input
                        type="time"
                        value={clockLabel(schedule.minuteOfDay)}
                        onChange={(e) => {
                          const [h, m] = e.target.value.split(':').map(Number)
                          if (Number.isFinite(h) && Number.isFinite(m)) {
                            setSchedule({ minuteOfDay: h * 60 + m })
                          }
                        }}
                        className={`mt-1.5 ${field} font-mono`}
                      />
                      <span className="mt-1 block font-ui text-xs text-ink-3">
                        Your local time.
                      </span>
                    </label>

                    <div>
                      <span className={label}>
                        {event === 'schedule.weekly' ? 'Days' : 'Only on'}
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {DAY_NAMES.map((day, index) => {
                          const on = schedule.days.includes(index)
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() =>
                                setSchedule({
                                  days: on
                                    ? schedule.days.filter((d) => d !== index)
                                    : [...schedule.days, index].sort()
                                })
                              }
                              aria-pressed={on}
                              className={[
                                'border-2 px-1.5 py-0.5 font-pixel text-[10px] font-semibold uppercase transition-colors',
                                on
                                  ? 'border-ink bg-brand text-on-brand'
                                  : 'border-rule text-ink-3 hover:border-ink hover:text-ink'
                              ].join(' ')}
                            >
                              {day}
                            </button>
                          )
                        })}
                        <button
                          type="button"
                          onClick={() => setSchedule({ days: [...WEEKDAYS] })}
                          className="border-2 border-rule px-1.5 py-0.5 font-pixel text-[10px] font-semibold uppercase text-ink-3 transition-colors hover:border-ink hover:text-ink"
                        >
                          Weekdays
                        </button>
                      </div>
                      {event === 'schedule.daily' && (
                        <span className="mt-1 block font-ui text-xs text-ink-3">
                          Leave empty for every day.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </fieldset>
            )}

            {/* Agent-sourced triggers can be narrowed to one agent. */}
            {trigger?.needsSource && (
              <div className="mt-5">
                <label className={label} htmlFor="builder-source">
                  Which agent triggers it
                </label>
                <select
                  id="builder-source"
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

            {/* Workspace and git triggers earn a filter more than the rest. */}
            {(event === 'file.changed' ||
              event === 'file.created' ||
              event === 'file.deleted' ||
              event === 'git.changed' ||
              trigger?.needsSource) && (
              <div className="mt-4">
                <label className={label} htmlFor="builder-condition">
                  Only if it mentions (optional)
                </label>
                <input
                  id="builder-condition"
                  className={`mt-1.5 ${field} font-mono text-xs`}
                  value={draft.condition ?? ''}
                  onChange={(e) => set('condition', e.target.value || null)}
                  placeholder="package.json"
                />
                <p className="mt-1.5 font-ui text-xs text-ink-3">
                  Matched against the file path and whatever text the event
                  carried. Leave blank to run every time.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------ 2. WHO -- */}
        {step === 1 && (
          <div className="mt-4">
            {!needsAgents ? (
              <p className="border-2 border-rule bg-cream px-3 py-2 font-ui text-[13px] leading-snug text-ink-3">
                This automation only notifies you, so it does not need an agent.
                Change the action in the next step if you want somebody to do
                something.
              </p>
            ) : agents.length === 0 ? (
              <p className="border-2 border-rule bg-cream px-3 py-2 font-ui text-[13px] leading-snug text-ink-3">
                This project has no agents yet. Add one on the Agents page
                first.
              </p>
            ) : (
              <>
                <p className="font-ui text-[13px] leading-snug text-ink-3">
                  Only this project&rsquo;s agents are listed, and only this
                  project&rsquo;s agents can ever be run — an automation is tied
                  to the project it was written in.
                </p>
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {agents.map((agent) => {
                    const on = chosen.includes(agent.id)
                    return (
                      <li key={agent.id}>
                        <button
                          type="button"
                          onClick={() => toggleAgent(agent.id)}
                          aria-pressed={on}
                          className={[
                            'w-full border-2 px-2.5 py-1.5 text-left transition-colors',
                            on
                              ? 'border-ink bg-brand-pale'
                              : 'border-rule bg-cream hover:border-ink'
                          ].join(' ')}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-pixel text-[11px] font-bold uppercase tracking-[0.04em] text-ink">
                              {agent.name}
                            </span>
                            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
                              {agent.spawned && agent.enabled ? 'in office' : 'not spawned'}
                            </span>
                          </span>
                          <span className="mt-0.5 block font-ui text-[11px] leading-snug text-ink-3">
                            {agent.role}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>

                {chosen.length > 1 && (
                  <p className="mt-3 border-2 border-ink bg-brand-pale px-3 py-2 font-ui text-[12px] leading-snug text-ink">
                    Running on {chosen.length} agents. If they are connected to
                    each other, the run appears as their team chat on Home
                    rather than as separate private conversations.
                  </p>
                )}

                {unspawned.length > 0 && (
                  <p className="mt-2 border-2 border-rule bg-cream px-3 py-2 font-ui text-[12px] leading-snug text-ink-3">
                    {unspawned.map((a) => a.name).join(', ')}{' '}
                    {unspawned.length === 1 ? 'is' : 'are'} not in the workspace.
                    An automation can only reach a spawned agent, so it will be
                    skipped until you spawn {unspawned.length === 1 ? 'it' : 'them'}.
                  </p>
                )}

                {permissionGaps.length > 0 && (
                  <p className="mt-2 border-2 border-ink bg-brand-pale px-3 py-2 font-ui text-[12px] leading-snug text-ink">
                    {source?.name} is not connected to{' '}
                    {permissionGaps.join(', ')}, so this automation would be
                    refused when it fires. Connect them, or pick a different
                    source agent.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ----------------------------------------------------- 3. WHAT -- */}
        {step === 2 && (
          <div className="mt-4">
            <label className={label} htmlFor="builder-message">
              {needsAgents ? 'The instruction they receive' : 'What to tell you'}
            </label>
            <textarea
              id="builder-message"
              rows={5}
              className={`mt-1.5 ${field} resize-y leading-[1.5]`}
              value={draft.message ?? ''}
              onChange={(e) => set('message', e.target.value)}
              placeholder={
                needsAgents
                  ? "Review today's changes and summarise anything suspicious."
                  : 'The nightly review finished.'
              }
            />
            <p className="mt-1.5 font-ui text-xs text-ink-3">
              {needsAgents
                ? 'Whatever triggered it — the file, the error, the task that finished — is attached automatically, so you do not have to describe it here.'
                : 'Shown as a notification. No agent is involved.'}
            </p>

            <div className="mt-5">
              <span className={label}>What kind of thing is this?</span>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {ACTIONS.map((a) => {
                  const on = a.id === action
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => set('action', a.id)}
                      aria-pressed={on}
                      className={[
                        'border-2 px-2.5 py-1.5 text-left transition-colors',
                        on
                          ? 'border-ink bg-brand-pale'
                          : 'border-rule bg-cream hover:border-ink'
                      ].join(' ')}
                    >
                      <span className="block font-pixel text-[11px] font-bold uppercase tracking-[0.04em] text-ink">
                        {a.label}
                      </span>
                      <span className="mt-0.5 block font-ui text-[11px] leading-snug text-ink-3">
                        {a.blurb}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------- 4. RESULT -- */}
        {step === 3 && (
          <div className="mt-4 flex flex-col gap-5">
            <div>
              <label className={label} htmlFor="builder-name">
                Name
              </label>
              <input
                id="builder-name"
                className={`mt-1.5 ${field}`}
                value={draft.name ?? ''}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Daily code review"
              />
            </div>

            {/* The whole thing, as a sentence. */}
            <Review draft={draft} agents={agents} />

            <fieldset className="border-2 border-rule p-3">
              <legend className="px-1 font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
                Permissions
              </legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {(
                  [
                    {
                      id: 'inherit' as const,
                      label: 'Same as you',
                      blurb:
                        "Obeys this project's permission rules exactly as a request from you would."
                    },
                    {
                      id: 'strict' as const,
                      label: 'Ask me every time',
                      blurb:
                        'Anything that changes or costs something waits for approval, whatever the rules say.'
                    }
                  ]
                ).map((mode) => {
                  const on = (draft.permissionMode ?? 'inherit') === mode.id
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => set('permissionMode', mode.id)}
                      aria-pressed={on}
                      className={[
                        'border-2 px-2.5 py-1.5 text-left transition-colors',
                        on
                          ? 'border-ink bg-brand-pale'
                          : 'border-rule bg-cream hover:border-ink'
                      ].join(' ')}
                    >
                      <span className="block font-pixel text-[11px] font-bold uppercase tracking-[0.04em] text-ink">
                        {mode.label}
                      </span>
                      <span className="mt-0.5 block font-ui text-[11px] leading-snug text-ink-3">
                        {mode.blurb}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 font-ui text-xs leading-snug text-ink-3">
                Neither mode can widen anything. An automation never gets past a
                category you set to Deny, and Auto Allow does not make it able
                to.
              </p>
            </fieldset>

            <fieldset className="border-2 border-rule p-3">
              <legend className="px-1 font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
                Safety
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={label}>Max chain depth</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className={`mt-1.5 ${field} font-mono`}
                    value={draft.maxChainDepth ?? settings.maxChainDepth}
                    onChange={(e) => set('maxChainDepth', Number(e.target.value))}
                  />
                </label>
                <label className="block">
                  <span className={label}>Cooldown (seconds)</span>
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    className={`mt-1.5 ${field} font-mono`}
                    value={Math.round(
                      (draft.cooldownMs ?? settings.defaultCooldownMs) / 1000
                    )}
                    onChange={(e) => set('cooldownMs', Number(e.target.value) * 1000)}
                  />
                </label>
              </div>
              <p className="mt-2 font-ui text-xs leading-snug text-ink-3">
                The workspace limit is {settings.maxChainDepth} deep, and
                whichever is stricter wins. A message identical to one already
                sent in the same chain is refused regardless.
              </p>
            </fieldset>
          </div>
        )}

        {/* ---------------------------------------------------- navigation -- */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t-2 border-rule pt-4">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="border-2 border-rule px-3 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
            >
              Back
            </button>
          )}

          {!last ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!stepValid(step)}
              className="border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 enabled:hover:-translate-y-px disabled:cursor-default disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy !== null || problems.length > 0}
              title={problems.join('\n') || undefined}
              className="border-[3px] border-ink bg-brand px-5 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 enabled:hover:-translate-y-px enabled:hover:bg-brand-lite disabled:cursor-default disabled:opacity-40"
            >
              {initial.id ? 'Save automation' : 'Create automation'}
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="border-2 border-rule px-3 py-2 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
          >
            Cancel
          </button>
        </div>

        {last && problems.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1">
            {problems.map((problem) => (
              <li key={problem} className="font-ui text-[12px] text-ink-3">
                — {problem}
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  )
}

/**
 * The automation, as a sentence.
 *
 * The last thing before saving, because a stepper hides the shape of what you
 * built: four screens each answered correctly can still add up to something
 * you did not mean. Reading it back in one paragraph is the check.
 */
export function Review({
  draft,
  agents
}: {
  draft: Partial<Trigger>
  agents: AgentConfig[]
}) {
  const event = draft.event ?? 'manual'
  const names = (draft.agentIds ?? [])
    .map((id) => agents.find((a) => a.id === id)?.name ?? id)
    .join(', ')

  const when = isScheduleEvent(event)
    ? describeSchedule(event, draft.schedule ?? null)
    : (TRIGGERS.find((t) => t.id === event)?.label ?? event)

  return (
    <div className="border-2 border-ink bg-cream px-3 py-2.5">
      <Line label="When" value={when} />
      {draft.condition && <Line label="If" value={`it mentions “${draft.condition}”`} />}
      <Line
        label="Who"
        value={draft.action === 'notify.user' ? 'Nobody — it just tells you' : names || '—'}
      />
      <Line
        label="Do"
        value={ACTIONS.find((a) => a.id === draft.action)?.label ?? draft.action ?? '—'}
      />
      <Line label="Saying" value={draft.message?.trim() || '—'} wrap />
    </div>
  )
}

function Line({
  label: name,
  value,
  wrap = false
}: {
  label: string
  value: string
  wrap?: boolean
}) {
  return (
    <p className="flex gap-2 border-b-2 border-rule py-1 last:border-b-0">
      <span className="w-[52px] shrink-0 font-pixel text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {name}
      </span>
      <span
        className={`min-w-0 flex-1 font-ui text-[12px] leading-snug text-ink ${
          wrap ? '' : 'truncate'
        }`}
      >
        {value}
      </span>
    </p>
  )
}
