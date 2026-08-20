import { useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import { PagePlaceholder } from '../shell/PagePlaceholder'
import { TriggerEditor } from './TriggerEditor'
import type { Trigger } from '../../shared/providerApi'

const EVENT_LABELS: Record<string, string> = {
  'agent.task.completed': 'completes a task',
  'agent.task.started': 'starts a task',
  'agent.error': 'errors',
  'agent.message.received': 'receives a message',
  'task.created': 'a task is created',
  'task.completed': 'any task completes',
  'file.changed': 'a file changes',
  'git.changed': 'git changes'
}

const ACTION_LABELS: Record<string, string> = {
  'send.message': 'is sent a message',
  'create.task': 'is given a task',
  'request.review': 'reviews it',
  'notify.user': 'you are notified'
}

/**
 * The orchestration layer, made visible.
 *
 * Two things live here and they are deliberately not the same switch: the
 * automations themselves, which the user writes, and AUTO, which decides
 * whether any of them may run. Writing a trigger is cheap and reversible;
 * letting triggers fire spends money on every hop. Keeping them separate means
 * a user can build the workflow they want and still be the one who decides
 * when it starts running.
 */
export function Automations() {
  const agents = useTeam((s) => s.agents)
  const triggers = useTeam((s) => s.triggers)
  const settings = useTeam((s) => s.settings)
  const busy = useTeam((s) => s.busy)
  const saveTrigger = useTeam((s) => s.saveTrigger)
  const removeTrigger = useTeam((s) => s.removeTrigger)
  const updateSettings = useTeam((s) => s.updateSettings)
  const stopAll = useTeam((s) => s.stopAll)

  const collaboration = useBackstage((s) => s.collaboration)
  const agentStates = useBackstage((s) => s.agentStates)

  const [editing, setEditing] = useState<Partial<Trigger> | null>(null)

  const nameFor = (id: string | null) =>
    id ? (agents.find((a) => a.id === id)?.name ?? id) : 'Any agent'

  const busyCount = Object.values(agentStates).filter(
    (s) => s.executionId !== null
  ).length

  if (editing) {
    return (
      <PagePlaceholder
        title="Automation"
        lead="When something happens, ask an agent to do something about it."
      >
        <TriggerEditor
          trigger={editing}
          agents={agents}
          settings={settings}
          busy={busy}
          onSave={async (draft) => {
            await saveTrigger(draft)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      </PagePlaceholder>
    )
  }

  return (
    <PagePlaceholder
      title="Agent automations"
      lead="Rules that let your team react to each other without you in the loop — and the limits that stop them running away with it."
    >
      {/* ---------------------------------------------------- AUTO switch -- */}
      <section className="mb-8 max-w-[680px] border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-ink px-4 py-3">
          <div>
            <h2 className="font-pixel text-base font-bold uppercase tracking-[0.04em] text-ink">
              Auto collaboration
            </h2>
            <p className="mt-1 font-ui text-[13px] leading-snug text-ink-3">
              {settings.autoCollaboration
                ? 'Automations may fire. Agents can start work on each other without you asking.'
                : 'Off. Agents work only when you or another agent explicitly asks them to.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void updateSettings({ autoCollaboration: !settings.autoCollaboration })
            }
            aria-pressed={settings.autoCollaboration}
            className={`shrink-0 border-[3px] border-ink px-4 py-2 font-pixel text-sm font-bold uppercase tracking-[0.06em] shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-y-px ${
              settings.autoCollaboration
                ? 'bg-brand text-ink'
                : 'bg-cream text-ink-3'
            }`}
          >
            {settings.autoCollaboration ? '● Auto on' : '○ Auto off'}
          </button>
        </div>

        <div className="grid gap-4 px-4 py-3 sm:grid-cols-3">
          <label className="block">
            <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
              Max chain depth
            </span>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.maxChainDepth}
              onChange={(e) =>
                void updateSettings({ maxChainDepth: Number(e.target.value) })
              }
              className="mt-1.5 w-full border-2 border-ink bg-cream px-2 py-1 font-mono text-sm text-ink outline-none focus:border-brand-deep"
            />
          </label>

          <label className="block">
            <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
              Default cooldown (s)
            </span>
            <input
              type="number"
              min={0}
              max={3600}
              value={Math.round(settings.defaultCooldownMs / 1000)}
              onChange={(e) =>
                void updateSettings({ defaultCooldownMs: Number(e.target.value) * 1000 })
              }
              className="mt-1.5 w-full border-2 border-ink bg-cream px-2 py-1 font-mono text-sm text-ink outline-none focus:border-brand-deep"
            />
          </label>

          <label className="block">
            <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
              Max tasks per chain
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.maxMessagesPerChain}
              onChange={(e) =>
                void updateSettings({ maxMessagesPerChain: Number(e.target.value) })
              }
              className="mt-1.5 w-full border-2 border-ink bg-cream px-2 py-1 font-mono text-sm text-ink outline-none focus:border-brand-deep"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t-2 border-rule px-4 py-2.5">
          <p className="font-ui text-[12px] leading-snug text-ink-3">
            Four protections run together: the switch above, a per-trigger
            cooldown, the chain depth, and a refusal to send the same message
            twice in one chain.
          </p>
          <button
            type="button"
            onClick={() => void stopAll()}
            disabled={busyCount === 0}
            className="ml-auto shrink-0 border-2 border-ink bg-cream px-3 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors enabled:hover:bg-rust enabled:hover:text-cream disabled:opacity-40"
          >
            Stop all ({busyCount})
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------- triggers -- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          Triggers
        </h2>
        <button
          type="button"
          onClick={() => setEditing({})}
          disabled={agents.length === 0}
          className="border-2 border-ink bg-brand px-3 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform duration-75 enabled:hover:-translate-y-px disabled:opacity-40"
        >
          + Create trigger
        </button>
      </div>

      {triggers.length === 0 ? (
        <div className="max-w-[520px] border-[3px] border-dashed border-rule bg-paper/60 p-6">
          <p className="font-ui text-sm leading-[1.6] text-ink-3">
            No automations yet. A common first one: when Jane finishes a task,
            ask Michael to review it.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {triggers.map((trigger) => {
            const dormant = !settings.autoCollaboration && trigger.enabled
            return (
              <li
                key={trigger.id}
                className={`border-[3px] border-ink shadow-[4px_4px_0_0_var(--color-ink)] ${
                  trigger.enabled ? 'bg-paper' : 'bg-paper/50'
                }`}
              >
                <header className="flex items-center justify-between gap-2 border-b-2 border-ink px-3 py-1.5">
                  <span
                    className={`font-pixel text-[10px] font-bold uppercase tracking-[0.1em] ${
                      trigger.enabled ? 'text-ink' : 'text-ink-3'
                    }`}
                  >
                    {trigger.enabled ? '✓ Enabled' : '○ Disabled'}
                  </span>
                  {dormant && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
                      auto is off
                    </span>
                  )}
                </header>

                <div className="px-3 py-2.5">
                  <h3 className="font-pixel text-sm font-bold uppercase leading-tight tracking-[0.04em] text-ink">
                    {trigger.name}
                  </h3>

                  {/* The rule, readable as a sentence rather than a schema. */}
                  <p className="mt-2 font-pixel text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.04em] text-ink-3">
                    {nameFor(trigger.sourceAgentId)}{' '}
                    <span className="text-ink">
                      {EVENT_LABELS[trigger.event] ?? trigger.event}
                    </span>
                  </p>
                  {trigger.condition && (
                    <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                      if it mentions &quot;{trigger.condition}&quot;
                    </p>
                  )}
                  <p aria-hidden className="my-0.5 font-mono text-[12px] text-brand-deep">
                    ↓
                  </p>
                  <p className="font-pixel text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.04em] text-ink-3">
                    {trigger.action === 'notify.user'
                      ? 'You are notified'
                      : `${nameFor(trigger.targetAgentId)} `}
                    {trigger.action !== 'notify.user' && (
                      <span className="text-ink">
                        {ACTION_LABELS[trigger.action] ?? trigger.action}
                      </span>
                    )}
                  </p>

                  <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                    Max chain: {trigger.maxChainDepth}
                    <span className="mx-1.5 text-rule">·</span>
                    Cooldown: {Math.round(trigger.cooldownMs / 1000)}s
                    {trigger.fireCount > 0 && (
                      <>
                        <span className="mx-1.5 text-rule">·</span>
                        Fired {trigger.fireCount}×
                      </>
                    )}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(trigger)}
                      className="border-2 border-ink bg-cream px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void saveTrigger({ id: trigger.id, enabled: !trigger.enabled })
                      }
                      className="border-2 border-rule px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink"
                    >
                      {trigger.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeTrigger(trigger.id)}
                      className="ml-auto border-2 border-rule px-2 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-rust hover:text-rust"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* -------------------------------------------------- what happened -- */}
      <section className="mt-10">
        <h2 className="mb-3 font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          Collaboration log
        </h2>
        <div className="max-w-[760px] border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
          {collaboration.length === 0 ? (
            <p className="font-ui text-[13px] leading-[1.6] text-ink-3">
              Nothing yet. When one agent hands work to another it is recorded
              here, whether you asked for it or an automation did.
            </p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {collaboration
                .slice(-20)
                .reverse()
                .map((message) => (
                  <li key={message.id} className="border-l-2 border-brand pl-2.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-brand-deep">
                      {message.senderName} → {message.receiverName}
                      <span className="ml-2 text-ink-3">
                        {message.kind}
                        {message.depth > 0 ? ` · depth ${message.depth}` : ''}
                      </span>
                      <span className="ml-2 text-ink-3">
                        {new Date(message.at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </p>
                    <p className="mt-0.5 line-clamp-3 font-ui text-[12px] leading-snug text-ink-3">
                      {message.message}
                    </p>
                  </li>
                ))}
            </ol>
          )}
        </div>
      </section>
    </PagePlaceholder>
  )
}
