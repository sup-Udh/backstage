import { useEffect, useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useTeam } from '../../stores/teamStore'
import type {
  AutomationRun,
  GroupChatSummary,
  GroupStatus
} from '../../shared/providerApi'

/**
 * Collaboration, on the front page.
 *
 * The thing this exists to fix: two agents could be mid-hand-off and the only
 * way to find out was to click a character in the pixel world, notice it had a
 * connection, and open the conversation from there. Collaboration was the
 * product's whole point and it was the one thing you had to go looking for.
 *
 * So it sits directly under the team header, above the conversation, in the
 * panel the user is already looking at. Three questions, in the order somebody
 * walking in actually asks them:
 *
 *   who is talking to whom     TEAM CHATS
 *   who reports to whom        TEAM STRUCTURE
 *   what is running unattended AUTOMATIONS
 *
 * Compact on purpose. This is a strip above a conversation, not a dashboard —
 * it shows the three most relevant rows of each and hands the rest to the page
 * that owns them. It also collapses, because on a short window the
 * conversation matters more than the summary of it.
 */

const STATUS_TEXT: Record<GroupStatus, string> = {
  active: 'READY',
  thinking: 'THINKING',
  working: 'WORKING',
  waiting: 'WAITING',
  completed: 'COMPLETED',
  stopped: 'STOPPED',
  error: 'ERROR'
}

const STATUS_GLYPH: Record<GroupStatus, string> = {
  active: '◇',
  thinking: '◐',
  working: '✦',
  waiting: '◒',
  completed: '✓',
  stopped: '◍',
  error: '✕'
}

/** Which statuses pulse. Only the ones where something is genuinely happening. */
const LIVE: GroupStatus[] = ['working', 'thinking', 'waiting']

function statusColour(status: GroupStatus): string {
  if (status === 'error') return 'text-rust'
  if (status === 'completed') return 'text-sage'
  if (LIVE.includes(status)) return 'text-brand-deep'
  return 'text-ink-3'
}

function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

interface Props {
  /** Open a group conversation. Goes straight there; nothing else opens. */
  onOpenGroup: (group: GroupChatSummary) => void
}

export function CollaborationRail({ onOpenGroup }: Props) {
  const groups = useTeam((s) => s.groups)
  const runs = useTeam((s) => s.runs)
  const agents = useTeam((s) => s.agents)
  const triggers = useTeam((s) => s.triggers)
  const setPage = useBackstage((s) => s.setPage)

  const [open, setOpen] = useState(true)
  const [showStructure, setShowStructure] = useState(false)

  /*
   * A relative timestamp has to be recomputed, or "just now" stays on screen
   * for an hour. One timer for the whole rail rather than one per row.
   */
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  const unread = groups.reduce((n, g) => n + g.unread, 0)
  const live = groups.filter((g) => LIVE.includes(g.status)).length
  const running = runs.filter((r) => r.status === 'running').length

  return (
    <section className="shrink-0 border-b-[3px] border-ink bg-cream-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-brand-pale"
      >
        <span className="font-pixel text-[10px] font-bold uppercase tracking-[0.12em] text-ink">
          Collaboration
        </span>

        {/* The summary the collapsed state has to carry on its own. */}
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
          {groups.length === 0 && runs.length === 0
            ? 'nothing yet'
            : [
                groups.length > 0 &&
                  `${groups.length} chat${groups.length === 1 ? '' : 's'}`,
                live > 0 && `${live} live`,
                running > 0 && `${running} automation${running === 1 ? '' : 's'} running`
              ]
                .filter(Boolean)
                .join(' · ')}
        </span>

        {unread > 0 && (
          <span className="shrink-0 border-2 border-ink bg-brand px-1.5 font-pixel text-[10px] font-bold text-on-brand">
            {unread}
          </span>
        )}
        <span aria-hidden className="shrink-0 font-pixel text-[11px] text-ink-3">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="border-t-2 border-rule px-3 py-2">
          {/* ------------------------------------------------ team chats -- */}
          <Heading
            label="Team chats"
            action={groups.length > 0 ? 'Configure team' : undefined}
            onAction={() => setPage('agents')}
          />

          {groups.length === 0 ? (
            <Empty
              title="No team chats yet"
              blurb="Connect two agents and their conversation appears here."
              cta="Configure team"
              onCta={() => setPage('agents')}
            />
          ) : (
            <ul className="mt-1 flex flex-col gap-1.5">
              {groups.slice(0, 3).map((group) => (
                <GroupRow
                  key={group.id}
                  group={group}
                  onOpen={() => onOpenGroup(group)}
                />
              ))}
            </ul>
          )}

          {/* -------------------------------------------- team structure -- */}
          {groups.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowStructure((v) => !v)}
                aria-expanded={showStructure}
                className="mt-2.5 flex w-full items-center gap-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-ink"
              >
                <span aria-hidden>{showStructure ? '▾' : '▸'}</span>
                Team structure
              </button>
              {showStructure && (
                <ul className="mt-1.5 flex flex-col gap-2">
                  {groups.map((group) => (
                    <li key={group.id} className="border-l-2 border-rule pl-2">
                      <Structure group={group} agents={agents} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* ------------------------------------------ automation activity -- */}
          <div className="mt-3 border-t-2 border-rule pt-2">
            <Heading
              label="Automations"
              action={triggers.length > 0 ? 'All automations' : undefined}
              onAction={() => setPage('automations')}
            />

            {runs.length === 0 ? (
              <Empty
                title={triggers.length === 0 ? 'No automations' : 'Nothing has run yet'}
                blurb={
                  triggers.length === 0
                    ? 'Let Backstage handle repetitive work for you.'
                    : 'Runs appear here as soon as one fires.'
                }
                cta={triggers.length === 0 ? '+ Create automation' : 'Open automations'}
                onCta={() => setPage('automations')}
              />
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {runs.slice(0, 3).map((run) => (
                  <RunRow key={run.id} run={run} onOpen={() => setPage('automations')} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------ fragments -- */

function Heading({
  label,
  action,
  onAction
}: {
  label: string
  action?: string
  onAction: () => void
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {label}
      </h2>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3 underline decoration-rule underline-offset-2 transition-colors hover:text-ink"
        >
          {action}
        </button>
      )}
    </div>
  )
}

function Empty({
  title,
  blurb,
  cta,
  onCta
}: {
  title: string
  blurb: string
  cta: string
  onCta: () => void
}) {
  return (
    <div className="mt-1 border-2 border-dashed border-rule bg-paper/60 px-2.5 py-2">
      <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.08em] text-ink">
        {title}
      </p>
      <p className="mt-0.5 font-ui text-[11px] leading-snug text-ink-3">{blurb}</p>
      <button
        type="button"
        onClick={onCta}
        className="mt-1.5 border-2 border-ink bg-brand px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-on-brand shadow-[2px_2px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-y-px"
      >
        {cta}
      </button>
    </div>
  )
}

/**
 * One group chat.
 *
 * Everything the brief asks a card to carry — participants, name, task, state,
 * last message, unread, count — in four lines, because this sits above a
 * conversation rather than replacing it. Clicking opens the conversation
 * directly: no character menu, no second modal, no re-picking the agents.
 */
function GroupRow({ group, onOpen }: { group: GroupChatSummary; onOpen: () => void }) {
  const isLive = LIVE.includes(group.status)

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full border-2 border-ink bg-paper px-2 py-1.5 text-left shadow-[2px_2px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-y-px hover:bg-brand-pale"
      >
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-pixel text-[11px] font-bold uppercase tracking-[0.04em] text-ink">
            {group.name}
          </span>
          {group.unread > 0 && (
            <span className="shrink-0 border border-ink bg-brand px-1 font-pixel text-[9px] font-bold leading-tight text-on-brand">
              {group.unread}
            </span>
          )}
        </div>

        {group.task && (
          <p className="mt-0.5 truncate font-ui text-[11px] leading-snug text-ink-3">
            {group.task}
          </p>
        )}

        {group.lastMessage && (
          <p className="mt-0.5 truncate font-ui text-[11px] leading-snug text-ink-3">
            <span className="text-ink">{group.lastMessage.fromName}:</span>{' '}
            {group.lastMessage.text}
          </p>
        )}

        <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
          <span className={`flex items-center gap-1 ${statusColour(group.status)}`}>
            <span aria-hidden className={isLive ? 'blink' : ''}>
              {STATUS_GLYPH[group.status]}
            </span>
            {STATUS_TEXT[group.status]}
          </span>
          <span className="text-rule">·</span>
          <span>
            {group.participants} agent{group.participants === 1 ? '' : 's'}
          </span>
          {group.working > 0 && (
            <>
              <span className="text-rule">·</span>
              <span className="text-brand-deep">{group.working} working</span>
            </>
          )}
          {group.thinking > 0 && (
            <>
              <span className="text-rule">·</span>
              <span className="text-brand-deep">{group.thinking} thinking</span>
            </>
          )}
          {group.automationName && (
            <>
              <span className="text-rule">·</span>
              <span>auto</span>
            </>
          )}
        </p>
      </button>
    </li>
  )
}

/**
 * Who leads whom, inside one group.
 *
 * Read from the roster's own `leads` list rather than from a role name, so it
 * shows the direction the user actually drew. A group with no direction is
 * shown as peers, which is what it is — inventing a leader for it would put an
 * authority on screen that nothing in the runtime honours.
 */
function Structure({
  group,
  agents
}: {
  group: GroupChatSummary
  agents: { id: string; name: string; role: string; leads: string[] }[]
}) {
  const members = group.memberIds
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is (typeof agents)[number] => a !== undefined)

  const leaderFirst = [...members].sort(
    (a, b) =>
      b.leads.filter((id) => group.memberIds.includes(id)).length -
      a.leads.filter((id) => group.memberIds.includes(id)).length
  )

  const anyDirection = members.some((m) =>
    m.leads.some((id) => group.memberIds.includes(id))
  )

  return (
    <ol className="flex flex-col gap-0.5">
      {leaderFirst.map((member, i) => (
        <li key={member.id}>
          {i > 0 && anyDirection && (
            <p aria-hidden className="font-mono text-[10px] leading-none text-brand-deep">
              ↓
            </p>
          )}
          <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink">
            {member.name}
            <span className="ml-1.5 font-mono text-[9px] normal-case tracking-normal text-ink-3">
              {member.role}
              {i === 0 && anyDirection ? ' · leads' : ''}
            </span>
          </p>
        </li>
      ))}
    </ol>
  )
}

function RunRow({ run, onOpen }: { run: AutomationRun; onOpen: () => void }) {
  const glyph =
    run.status === 'running'
      ? '●'
      : run.status === 'completed'
        ? '✓'
        : run.status === 'blocked'
          ? '◍'
          : '!'
  const colour =
    run.status === 'running'
      ? 'text-brand-deep'
      : run.status === 'completed'
        ? 'text-sage'
        : 'text-rust'

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-baseline gap-2 px-1 py-0.5 text-left transition-colors hover:bg-brand-pale"
      >
        <span
          aria-hidden
          className={`shrink-0 font-pixel text-[11px] ${colour} ${
            run.status === 'running' ? 'blink' : ''
          }`}
        >
          {glyph}
        </span>
        <span className="min-w-0 flex-1 truncate font-ui text-[11px] font-semibold text-ink">
          {run.triggerName}
        </span>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
          {run.agentNames[0] ?? 'system'}
          {run.agentNames.length > 1 ? ` +${run.agentNames.length - 1}` : ''}
          <span className="mx-1 text-rule">·</span>
          {run.status === 'running' ? 'running' : ago(run.endedAt ?? run.startedAt)}
        </span>
      </button>
    </li>
  )
}
