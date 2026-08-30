import { useEffect, useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import type { AgentConfig, AutomationRun, Trigger } from '../../shared/providerApi'
import { describeSchedule, isScheduleEvent } from '../../shared/schedule'

/**
 * One automation, and what it has actually done.
 *
 * The run history is the point of this page. An automation you cannot inspect
 * afterwards is one you have to take on trust, and nobody sensibly leaves
 * something running unattended against their own repository on trust. Every
 * run here is a real record written when it happened: which agents, which
 * tasks, how long, what came back.
 *
 * Opening a run opens the conversation those tasks wrote into — the group
 * chat when the automation ran on a team, the agent's own session when it ran
 * on one. There is no separate "automation result" view, because there is no
 * separate result: the answer is in the conversation the agents had.
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
  manual: 'Only when you run it'
}

const ACTION_TEXT: Record<string, string> = {
  'create.task': 'Given a task',
  'request.review': 'Asked to review it',
  'send.message': 'Sent a note',
  'notify.user': 'You are notified'
}

interface Props {
  trigger: Trigger
  agents: AgentConfig[]
  /** A run to scroll to and expand, from a notification. */
  focusRunId?: string | null
  onEdit: () => void
  onDuplicate: () => void
  onBack: () => void
}

export function AutomationDetail({
  trigger,
  agents,
  focusRunId,
  onEdit,
  onDuplicate,
  onBack
}: Props) {
  const busy = useTeam((s) => s.busy)
  const runs = useTeam((s) => s.runs)
  const saveTrigger = useTeam((s) => s.saveTrigger)
  const removeTrigger = useTeam((s) => s.removeTrigger)
  const runAutomation = useTeam((s) => s.runAutomation)
  const refreshRuns = useTeam((s) => s.refreshRuns)
  const settings = useTeam((s) => s.settings)
  const groups = useTeam((s) => s.groups)

  const setThreadTarget = useBackstage((s) => s.setThreadTarget)
  const setChatTarget = useBackstage((s) => s.setChatTarget)
  const setPage = useBackstage((s) => s.setPage)
  const setTab = useBackstage((s) => s.setTab)

  const [notice, setNotice] = useState<string | null>(null)
  const [openRun, setOpenRun] = useState<string | null>(focusRunId ?? null)

  useEffect(() => {
    void refreshRuns()
  }, [refreshRuns, trigger.id])

  useEffect(() => {
    if (focusRunId) setOpenRun(focusRunId)
  }, [focusRunId])

  const mine = runs.filter((r) => r.triggerId === trigger.id)
  const targets = trigger.agentIds
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is AgentConfig => a !== undefined)

  const when = isScheduleEvent(trigger.event)
    ? describeSchedule(trigger.event, trigger.schedule)
    : (EVENT_TEXT[trigger.event] ?? trigger.event)

  const dormant = !settings.autoCollaboration && trigger.enabled

  /**
   * Open the conversation a run produced.
   *
   * The group thread if it had one, otherwise the first agent's own session.
   * Either way it lands in the command centre on Home, which is where every
   * conversation in Backstage is read.
   */
  const openConversation = (run: AutomationRun) => {
    const entry = run.threadId
      ? (groups.find((g) => g.id === run.threadId)?.memberIds[0] ?? null)
      : null
    if (entry) {
      void setThreadTarget(entry)
    } else if (run.agentIds[0]) {
      setChatTarget(run.agentIds[0])
    } else {
      return
    }
    setTab('messages')
    setPage('home')
  }

  return (
    <div className="max-w-[820px]">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 font-pixel text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 transition-colors hover:text-ink"
      >
        ‹ All automations
      </button>

      {/* --------------------------------------------------------- header -- */}
      <div className="border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-shadow)]">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-ink px-4 py-3">
          <div className="min-w-0">
            <h1 className="font-pixel text-lg font-bold uppercase leading-tight tracking-[0.03em] text-ink">
              {trigger.name}
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              {trigger.enabled ? '● Active' : '○ Paused'}
              {dormant && (
                <span className="ml-2 text-rust">auto collaboration is off</span>
              )}
              <span className="mx-1.5 text-rule">·</span>
              ran {trigger.fireCount}×
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={async () => {
                setNotice(null)
                const error = await runAutomation(trigger.id)
                setNotice(error ?? 'Started. Watch the team chat on Home.')
              }}
              disabled={busy !== null || !trigger.enabled}
              className="border-[3px] border-ink bg-brand px-3 py-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-on-brand shadow-[3px_3px_0_0_var(--color-shadow)] transition-transform duration-75 enabled:hover:-translate-y-px disabled:opacity-40"
            >
              Run now
            </button>
            <button
              type="button"
              onClick={() => void saveTrigger({ id: trigger.id, enabled: !trigger.enabled })}
              className="border-2 border-ink bg-cream px-2.5 py-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
            >
              {trigger.enabled ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="border-2 border-ink bg-cream px-2.5 py-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDuplicate}
              className="border-2 border-rule px-2.5 py-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={async () => {
                await removeTrigger(trigger.id)
                onBack()
              }}
              className="border-2 border-rule px-2.5 py-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-rust hover:text-rust"
            >
              Delete
            </button>
          </div>
        </header>

        {notice && (
          <p className="border-b-2 border-rule bg-brand-pale px-4 py-2 font-ui text-[13px] leading-snug text-ink">
            {notice}
          </p>
        )}

        <dl className="grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2">
          <Fact label="When" value={when} />
          <Fact
            label="If"
            value={trigger.condition ? `it mentions “${trigger.condition}”` : 'always'}
          />
          <Fact
            label="Who"
            value={
              trigger.action === 'notify.user'
                ? 'Nobody — it notifies you'
                : targets.length > 0
                  ? targets.map((a) => `${a.name} (${a.role})`).join(', ')
                  : 'no agent is set'
            }
          />
          <Fact label="Do" value={ACTION_TEXT[trigger.action] ?? trigger.action} />
          <Fact
            label="Permissions"
            value={
              trigger.permissionMode === 'strict'
                ? 'Asks before anything impactful'
                : "Follows this project's rules"
            }
          />
          <Fact
            label="Limits"
            value={`chain ${trigger.maxChainDepth} · cooldown ${Math.round(
              trigger.cooldownMs / 1000
            )}s`}
          />
          <Fact
            label="Last run"
            value={trigger.lastRunAt ? new Date(trigger.lastRunAt).toLocaleString() : 'never'}
          />
          <Fact
            label="Next run"
            value={
              trigger.nextRunAt
                ? new Date(trigger.nextRunAt).toLocaleString()
                : isScheduleEvent(trigger.event)
                  ? 'not scheduled'
                  : 'when it is triggered'
            }
          />
        </dl>

        <div className="border-t-2 border-rule px-4 py-3">
          <h2 className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            The instruction
          </h2>
          <p className="mt-1 whitespace-pre-wrap font-ui text-[13px] leading-[1.6] text-ink">
            {trigger.message || '—'}
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------- run history -- */}
      <h2 className="mb-3 mt-8 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        Runs
      </h2>

      {mine.length === 0 ? (
        <div className="border-[3px] border-dashed border-rule bg-paper/60 p-5">
          <p className="font-ui text-sm leading-[1.6] text-ink-3">
            It has not run yet. Press Run now to try it — a manual run takes the
            same path a scheduled one does, so it is a real test rather than a
            rehearsal.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {mine.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              open={openRun === run.id}
              onToggle={() => setOpenRun(openRun === run.id ? null : run.id)}
              onOpenConversation={() => openConversation(run)}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {label}
      </dt>
      <dd className="mt-0.5 font-ui text-[13px] leading-snug text-ink">{value}</dd>
    </div>
  )
}

function RunCard({
  run,
  open,
  onToggle,
  onOpenConversation
}: {
  run: AutomationRun
  open: boolean
  onToggle: () => void
  onOpenConversation: () => void
}) {
  const duration =
    run.endedAt !== null
      ? `${Math.max(1, Math.round((run.endedAt - run.startedAt) / 1000))}s`
      : 'running'

  const tone =
    run.status === 'completed'
      ? 'text-sage'
      : run.status === 'running'
        ? 'text-brand-deep'
        : 'text-rust'

  const glyph =
    run.status === 'completed'
      ? '✓'
      : run.status === 'running'
        ? '●'
        : run.status === 'blocked'
          ? '◍'
          : '!'

  return (
    <li className="border-[3px] border-ink bg-paper shadow-[3px_3px_0_0_var(--color-shadow)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-brand-pale"
      >
        <span
          aria-hidden
          className={`font-pixel text-[13px] ${tone} ${run.status === 'running' ? 'blink' : ''}`}
        >
          {glyph}
        </span>
        <span className="font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-ink">
          {new Date(run.startedAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
          {run.origin}
          <span className="mx-1.5 text-rule">·</span>
          {run.agentNames.join(', ') || 'no agent'}
          <span className="mx-1.5 text-rule">·</span>
          {run.taskIds.length} task{run.taskIds.length === 1 ? '' : 's'}
          <span className="mx-1.5 text-rule">·</span>
          {duration}
        </span>
        <span aria-hidden className="ml-auto font-pixel text-[11px] text-ink-3">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="border-t-2 border-rule px-3 py-2.5">
          {run.error && (
            <div className="mb-2 border-2 border-rust bg-cream px-2.5 py-1.5">
              <p className="font-pixel text-[10px] font-bold uppercase tracking-[0.1em] text-rust">
                {run.status === 'blocked' ? 'Automation blocked' : 'Automation failed'}
              </p>
              {/*
                The actual reason, never "something went wrong". A failure the
                user cannot diagnose is one they will disable rather than fix.
              */}
              <p className="mt-0.5 font-ui text-[12px] leading-snug text-ink">
                {run.error}
              </p>
            </div>
          )}

          {run.summary ? (
            <p className="max-h-[220px] overflow-y-auto whitespace-pre-wrap font-ui text-[12px] leading-[1.6] text-ink-3">
              {run.summary}
            </p>
          ) : (
            <p className="font-ui text-[12px] leading-snug text-ink-3">
              {run.status === 'running'
                ? 'Still working. The conversation updates live.'
                : 'Nothing came back.'}
            </p>
          )}

          {(run.threadId || run.agentIds.length > 0) && (
            <button
              type="button"
              onClick={onOpenConversation}
              className="mt-2.5 border-2 border-ink bg-cream px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
            >
              {run.threadId ? 'Open team chat →' : 'Open conversation →'}
            </button>
          )}
        </div>
      )}
    </li>
  )
}
