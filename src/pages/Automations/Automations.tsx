import { useEffect, useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import { AutomationBuilder, Review } from './AutomationBuilder'
import { AutomationDetail } from './AutomationDetail'
import { AUTOMATION_TEMPLATES } from './templates'
import type { AutomationDraft, Trigger } from '../../shared/providerApi'
import { describeSchedule, isScheduleEvent } from '../../shared/schedule'

/**
 * Automations.
 *
 * Three things live here and they are deliberately not the same switch: the
 * automations themselves, which the user writes; AUTO collaboration, which
 * decides whether any of them may fire on their own; and the record of what
 * they have done. Writing an automation is cheap and reversible; letting one
 * fire spends money on every hop. Keeping them separate means somebody can
 * build the workflow they want and still be the one who decides when it starts
 * running.
 *
 * The page is a small router over three views — the list, the builder and one
 * automation's detail — rather than three pages, because they share every
 * piece of state they read and the transitions between them are the flow
 * itself: create, run, look at what happened, edit.
 */

const EVENT_TEXT: Record<string, string> = {
  'agent.task.completed': 'An agent finishes a task',
  'agent.task.started': 'An agent starts a task',
  'agent.error': 'An agent fails',
  'agent.idle': 'An agent becomes idle',
  'agent.message.received': 'An agent receives a message',
  'file.changed': 'A file changes',
  'file.created': 'A file is created',
  'file.deleted': 'A file is deleted',
  'git.changed': 'Git state changes',
  'task.created': 'A task is created',
  'task.completed': 'A task completes',
  manual: 'Run by hand'
}

type View =
  | { kind: 'list' }
  | { kind: 'builder'; draft: Partial<Trigger> }
  | { kind: 'detail'; triggerId: string; focusRunId?: string | null }

export function Automations() {
  const agents = useTeam((s) => s.agents)
  const triggers = useTeam((s) => s.triggers)
  const runs = useTeam((s) => s.runs)
  const settings = useTeam((s) => s.settings)
  const busy = useTeam((s) => s.busy)
  const saveTrigger = useTeam((s) => s.saveTrigger)
  const updateSettings = useTeam((s) => s.updateSettings)
  const runAutomation = useTeam((s) => s.runAutomation)
  const stopAll = useTeam((s) => s.stopAll)
  const refreshRuns = useTeam((s) => s.refreshRuns)

  const agentStates = useBackstage((s) => s.agentStates)
  const pendingRunId = useBackstage((s) => s.pendingAutomationRunId)
  const openAutomationRun = useBackstage((s) => s.openAutomationRun)

  const [view, setView] = useState<View>({ kind: 'list' })

  useEffect(() => {
    void refreshRuns()
  }, [refreshRuns])

  /*
   * A notification asked for one run. Consumed once and cleared, so coming
   * back to this page later does not reopen something read days ago.
   */
  useEffect(() => {
    if (!pendingRunId) return
    const run = runs.find((r) => r.id === pendingRunId)
    if (!run) return
    setView({ kind: 'detail', triggerId: run.triggerId, focusRunId: run.id })
    openAutomationRun(null)
  }, [pendingRunId, runs, openAutomationRun])

  const busyCount = Object.values(agentStates).filter(
    (s) => s.executionId !== null
  ).length

  /* ------------------------------------------------------------- builder -- */

  if (view.kind === 'builder') {
    return (
      <PagePlaceholder
        title={view.draft.id ? 'Edit automation' : 'New automation'}
        lead="Four questions: when it runs, who does it, what they do, and what you get back."
      >
        <AutomationBuilder
          initial={view.draft}
          agents={agents}
          settings={settings}
          busy={busy}
          onCancel={() => setView({ kind: 'list' })}
          onSave={async (draft) => {
            const saved = await saveTrigger(draft)
            // Straight to the automation that was just made, which is where
            // Run now lives — the first thing anybody wants to do next.
            setView(saved ? { kind: 'detail', triggerId: saved.id } : { kind: 'list' })
          }}
        />
      </PagePlaceholder>
    )
  }

  /* -------------------------------------------------------------- detail -- */

  if (view.kind === 'detail') {
    const trigger = triggers.find((t) => t.id === view.triggerId)
    if (!trigger) {
      // Deleted from under us — the list is the honest place to land.
      return (
        <PagePlaceholder title="Automations" lead="That automation no longer exists.">
          <button
            type="button"
            onClick={() => setView({ kind: 'list' })}
            className="border-[3px] border-ink bg-brand px-4 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)]"
          >
            Back to automations
          </button>
        </PagePlaceholder>
      )
    }
    return (
      <PagePlaceholder title="Automation" lead="What it does, and what it has done.">
        <AutomationDetail
          trigger={trigger}
          agents={agents}
          focusRunId={view.focusRunId ?? null}
          onBack={() => setView({ kind: 'list' })}
          onEdit={() => setView({ kind: 'builder', draft: trigger })}
          onDuplicate={() =>
            setView({
              kind: 'builder',
              draft: {
                ...trigger,
                id: undefined,
                name: `${trigger.name} (copy)`,
                fireCount: 0,
                lastRunAt: null,
                lastFiredAt: null
              }
            })
          }
        />
      </PagePlaceholder>
    )
  }

  /* ---------------------------------------------------------------- list -- */

  return (
    <PagePlaceholder
      title="Automations"
      lead="Work that happens without you asking — and the limits that stop it running away."
    >
      {/* ---------------------------------------------------- AUTO switch -- */}
      <section className="mb-8 max-w-[720px] border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-ink px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-pixel text-base font-bold uppercase tracking-[0.04em] text-ink">
              Auto collaboration
            </h2>
            <p className="mt-1 max-w-[440px] font-ui text-[13px] leading-snug text-ink-3">
              {settings.autoCollaboration
                ? 'Automations fire on their own, and agents can start work on each other without you asking.'
                : 'Off. Nothing fires by itself — automations only run when you press Run now.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void updateSettings({ autoCollaboration: !settings.autoCollaboration })
            }
            aria-pressed={settings.autoCollaboration}
            className={`shrink-0 border-[3px] border-ink px-4 py-2 font-pixel text-sm font-bold uppercase tracking-[0.06em] shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-y-px ${
              settings.autoCollaboration ? 'bg-brand text-on-brand' : 'bg-cream text-ink-3'
            }`}
          >
            {settings.autoCollaboration ? '● Auto on' : '○ Auto off'}
          </button>
        </div>

        <div className="grid gap-4 px-4 py-3 sm:grid-cols-3">
          <NumberField
            label="Max chain depth"
            value={settings.maxChainDepth}
            min={1}
            max={10}
            onChange={(n) => void updateSettings({ maxChainDepth: n })}
          />
          <NumberField
            label="Default cooldown (s)"
            value={Math.round(settings.defaultCooldownMs / 1000)}
            min={0}
            max={3600}
            onChange={(n) => void updateSettings({ defaultCooldownMs: n * 1000 })}
          />
          <NumberField
            label="Max tasks per chain"
            value={settings.maxMessagesPerChain}
            min={1}
            max={100}
            onChange={(n) => void updateSettings({ maxMessagesPerChain: n })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t-2 border-rule px-4 py-2.5">
          <p className="max-w-[520px] font-ui text-[12px] leading-snug text-ink-3">
            Four protections run together: the switch above, a per-automation
            cooldown, the chain depth, and a refusal to send the same message
            twice in one chain. Permissions are separate and stricter — an
            automation never gets past a category you set to Deny.
          </p>
          <button
            type="button"
            onClick={() => void stopAll()}
            disabled={busyCount === 0}
            className="ml-auto shrink-0 border-2 border-ink bg-cream px-3 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors enabled:hover:bg-rust enabled:hover:text-on-slate disabled:opacity-40"
          >
            Stop all ({busyCount})
          </button>
        </div>
      </section>

      {/* -------------------------------------------------- quick creation -- */}
      <QuickCreate
        disabled={agents.length === 0}
        onDraft={(draft) => setView({ kind: 'builder', draft })}
      />

      {/* ----------------------------------------------------------- list -- */}
      <div className="mb-4 mt-10 flex flex-wrap items-center gap-3">
        <h2 className="font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          Your automations
        </h2>
        <button
          type="button"
          onClick={() => setView({ kind: 'builder', draft: {} })}
          disabled={agents.length === 0}
          className="border-2 border-ink bg-brand px-3 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-on-brand shadow-[2px_2px_0_0_var(--color-shadow)] transition-transform duration-75 enabled:hover:-translate-y-px disabled:opacity-40"
        >
          + New automation
        </button>
      </div>

      {triggers.length === 0 ? (
        <div className="max-w-[560px] border-[3px] border-dashed border-rule bg-paper/60 p-6">
          <p className="font-pixel text-sm font-bold uppercase tracking-[0.06em] text-ink">
            No automations
          </p>
          <p className="mt-1.5 font-ui text-sm leading-[1.6] text-ink-3">
            Let Backstage handle repetitive work for you. Start from a template
            below, describe one in a sentence above, or build one from scratch.
          </p>
          <button
            type="button"
            onClick={() => setView({ kind: 'builder', draft: {} })}
            disabled={agents.length === 0}
            className="mt-3 border-[3px] border-ink bg-brand px-4 py-2 font-pixel text-sm font-bold uppercase tracking-[0.04em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 enabled:hover:-translate-y-px disabled:opacity-40"
          >
            + Create automation
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {triggers.map((trigger) => {
            const lastRun = runs.find((r) => r.triggerId === trigger.id)
            const running = lastRun?.status === 'running'
            const dormant = !settings.autoCollaboration && trigger.event !== 'manual'

            return (
              <li
                key={trigger.id}
                className={`border-[3px] border-ink shadow-[4px_4px_0_0_var(--color-shadow)] ${
                  trigger.enabled ? 'bg-paper' : 'bg-paper/50'
                }`}
              >
                <header className="flex items-center justify-between gap-2 border-b-2 border-ink px-3 py-1.5">
                  <span
                    className={`font-pixel text-[10px] font-bold uppercase tracking-[0.1em] ${
                      running
                        ? 'text-brand-deep'
                        : trigger.enabled
                          ? 'text-ink'
                          : 'text-ink-3'
                    }`}
                  >
                    <span aria-hidden className={running ? 'blink' : ''}>
                      {running ? '● ' : trigger.enabled ? '✓ ' : '○ '}
                    </span>
                    {running ? 'Running' : trigger.enabled ? 'Active' : 'Paused'}
                  </span>
                  {dormant && trigger.enabled && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
                      auto is off
                    </span>
                  )}
                </header>

                <button
                  type="button"
                  onClick={() => setView({ kind: 'detail', triggerId: trigger.id })}
                  className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-brand-pale"
                >
                  <h3 className="font-pixel text-sm font-bold uppercase leading-tight tracking-[0.04em] text-ink">
                    {trigger.name}
                  </h3>

                  <p className="mt-1.5 font-pixel text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.04em] text-ink-3">
                    {isScheduleEvent(trigger.event)
                      ? describeSchedule(trigger.event, trigger.schedule)
                      : (EVENT_TEXT[trigger.event] ?? trigger.event)}
                  </p>

                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                    {trigger.action === 'notify.user'
                      ? 'notifies you'
                      : trigger.agentIds
                          .map((id) => agents.find((a) => a.id === id)?.name ?? '?')
                          .join(' · ') || 'no agent'}
                  </p>

                  <p className="mt-2 line-clamp-2 font-ui text-[12px] leading-snug text-ink-3">
                    {trigger.message || '—'}
                  </p>

                  <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                    {trigger.lastRunAt
                      ? `last ${new Date(trigger.lastRunAt).toLocaleDateString()}`
                      : 'never run'}
                    {trigger.nextRunAt && (
                      <>
                        <span className="mx-1.5 text-rule">·</span>
                        next{' '}
                        {new Date(trigger.nextRunAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </>
                    )}
                  </p>
                </button>

                <div className="flex flex-wrap items-center gap-1.5 border-t-2 border-rule px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void runAutomation(trigger.id)}
                    disabled={busy !== null || !trigger.enabled}
                    className="border-2 border-ink bg-brand px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-on-brand transition-transform duration-75 enabled:hover:-translate-y-px disabled:opacity-40"
                  >
                    Run now
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void saveTrigger({ id: trigger.id, enabled: !trigger.enabled })
                    }
                    className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
                  >
                    {trigger.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView({ kind: 'detail', triggerId: trigger.id })}
                    className="ml-auto font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 underline decoration-rule underline-offset-2 transition-colors hover:text-ink"
                  >
                    Details →
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* ------------------------------------------------------- templates -- */}
      <section className="mt-10">
        <h2 className="mb-1 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          Start from a template
        </h2>
        <p className="mb-3 max-w-[620px] font-ui text-[13px] leading-snug text-ink-3">
          Each of these uses a trigger that genuinely fires and an action the
          runtime genuinely performs. You still choose the agents and see the
          whole thing before it is saved.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {AUTOMATION_TEMPLATES.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => setView({ kind: 'builder', draft: { ...template.draft } })}
                disabled={agents.length === 0}
                className="h-full w-full border-2 border-ink bg-paper px-3 py-2.5 text-left shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 enabled:hover:-translate-y-px enabled:hover:bg-brand-pale disabled:opacity-40"
              >
                <p className="font-pixel text-[12px] font-bold uppercase tracking-[0.04em] text-ink">
                  {template.title}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-brand-deep">
                  {template.when}
                </p>
                <p className="mt-1.5 font-ui text-[12px] leading-snug text-ink-3">
                  {template.blurb}
                </p>
                {template.wants === 'team' && (
                  <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
                    reads best with a connected team
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </PagePlaceholder>
  )
}

/* ------------------------------------------------------------ fragments -- */

function NumberField({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <label className="block">
      <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full border-2 border-ink bg-cream px-2 py-1 font-mono text-sm text-ink outline-none focus:border-brand-deep"
      />
    </label>
  )
}

/**
 * "Every morning ask Walter to review the latest git changes."
 *
 * The fast path, and the honest one: the sentence is parsed in the main
 * process against this project's roster, the result is shown as a
 * configuration, and nothing is saved until the user has looked at it and
 * pressed a button. A parser that guessed and saved would be a worse feature
 * than no parser, because the thing it guesses wrong runs unattended.
 */
function QuickCreate({
  disabled,
  onDraft
}: {
  disabled: boolean
  onDraft: (draft: Partial<Trigger>) => void
}) {
  const agents = useTeam((s) => s.agents)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<AutomationDraft | null>(null)
  const [thinking, setThinking] = useState(false)

  const parse = async () => {
    if (!text.trim()) return
    setThinking(true)
    try {
      setParsed(await window.backstage.automation.parse(text))
    } finally {
      setThinking(false)
    }
  }

  return (
    <section className="max-w-[720px] border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]">
      <div className="border-b-2 border-ink px-4 py-2">
        <h2 className="font-pixel text-[12px] font-bold uppercase tracking-[0.08em] text-ink">
          Describe it in a sentence
        </h2>
      </div>

      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void parse()
              }
            }}
            disabled={disabled}
            placeholder="Every evening ask Walter to review my git changes"
            className="min-w-[220px] flex-1 border-[3px] border-ink bg-cream px-3 py-2 font-ui text-sm text-ink outline-none focus:border-brand-deep disabled:opacity-40"
          />
          <button
            type="button"
            onClick={() => void parse()}
            disabled={disabled || thinking || !text.trim()}
            className="border-[3px] border-ink bg-brand px-4 py-2 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 enabled:hover:-translate-y-px disabled:opacity-40"
          >
            {thinking ? 'Reading…' : 'Read it'}
          </button>
        </div>

        {parsed && (
          <div className="mt-4">
            <p className="mb-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
              Here is what that means
            </p>

            <Review draft={parsed as Partial<Trigger>} agents={agents} />

            {/* What it understood, in the user's own words, so the check is real. */}
            {parsed.matched.length > 0 && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                read: {parsed.matched.join('  ·  ')}
              </p>
            )}
            {parsed.missing.length > 0 && (
              <p className="mt-1.5 border-2 border-ink bg-brand-pale px-3 py-1.5 font-ui text-[12px] leading-snug text-ink">
                Still needs {parsed.missing.join(' and ')}. You can set{' '}
                {parsed.missing.length === 1 ? 'it' : 'them'} in the builder.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onDraft({
                    name: parsed.name,
                    event: parsed.event,
                    schedule: parsed.schedule,
                    action: parsed.action,
                    agentIds: parsed.agentIds,
                    message: parsed.message,
                    condition: parsed.condition
                  })
                  setParsed(null)
                  setText('')
                }}
                className="border-[3px] border-ink bg-brand px-4 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-y-px"
              >
                Open in builder
              </button>
              <button
                type="button"
                onClick={() => setParsed(null)}
                className="border-2 border-rule px-3 py-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
