import { useState } from 'react'
import { Markdown } from '../../components/Markdown/Markdown'
import {
  clockTime,
  phaseLabel,
  type Finding,
  type Member,
  type TeamRun,
  type TimelineEvent
} from '../../agents/teamRun'

/**
 * A whole-team request, shown as the piece of work it was.
 *
 * The old ALL AGENTS view merged every participant's messages into one
 * time-ordered column. That is a faithful transcript and a useless account:
 * the request, the delegations, four sets of findings and the final answer all
 * arrived as undifferentiated prose, so the user had to read the whole thing
 * to discover which paragraph was the answer to their question.
 *
 * The order here is deliberate and is the opposite of chronological:
 *
 *   the request        — the anchor, one line
 *   the final answer   — what they asked for, read first
 *   who did what       — the evidence behind it, one card per participant
 *   the activity log   — the raw sequence, folded away
 *
 * A team that has not finished has no answer yet, so a run in progress leads
 * with the workflow instead and the answer takes its place when it exists.
 * Nothing is ever shown as complete before it is.
 */

interface Props {
  run: TeamRun
  /** Live partial text, keyed by agent id, for whoever is mid-sentence. */
  streaming: Record<string, string>
}

export function TeamRunView({ run, streaming }: Props) {
  const synthesising = run.members.some((m) => m.isLead && m.phase === 'working')
  const leadStream = run.leadId ? streaming[run.leadId] : undefined

  return (
    <div className="flex flex-col gap-4">
      <Request text={run.request} />

      {run.synthesis ? (
        <FinalAnswer text={run.synthesis.text} name={run.leadName} />
      ) : run.running ? (
        <InProgress
          run={run}
          stream={synthesising ? leadStream : undefined}
        />
      ) : run.failed ? (
        <NoAnswer />
      ) : null}

      <Workflow run={run} streaming={streaming} />

      {run.timeline.length > 1 && <Timeline events={run.timeline} />}
    </div>
  )
}

/**
 * The user's own question, restated at the top.
 *
 * It is easy to lose: by the time a team has finished, the question is four
 * screens above the answer. Restating it costs one line and means the answer
 * is never read without the thing it answers.
 */
function Request({ text }: { text: string }) {
  return (
    <section>
      <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        Your request
      </p>
      <p className="mt-1 border-l-2 border-brand-deep bg-brand-pale/40 py-1.5 pl-2.5 font-ui text-[12.5px] leading-[1.6] text-ink">
        {text}
      </p>
    </section>
  )
}

/** The answer the user actually asked for, given the weight to match. */
function FinalAnswer({ text, name }: { text: string; name: string }) {
  return (
    <section className="border-[3px] border-ink bg-paper shadow-[3px_3px_0_0_var(--color-shadow)]">
      <header className="flex items-baseline gap-2 border-b-[3px] border-ink bg-brand px-2.5 py-1.5">
        <span aria-hidden className="text-[11px]">
          👑
        </span>
        <span className="font-pixel text-[11px] font-bold uppercase tracking-[0.1em] text-on-brand">
          Final team answer
        </span>
        <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-on-brand">
          {name}
        </span>
      </header>
      <div className="px-2.5 py-2">
        <Markdown text={text} />
      </div>
    </section>
  )
}

/**
 * The team is still going.
 *
 * Says which stage it is at in the team's own terms rather than showing a
 * spinner, and streams the lead's final answer as it is written — the one
 * moment where watching text arrive is genuinely the most informative thing
 * on screen.
 */
function InProgress({ run, stream }: { run: TeamRun; stream?: string }) {
  const outstanding = run.members.filter(
    (m) => !m.isLead && (m.phase === 'working' || m.phase === 'waiting')
  )

  if (stream) {
    return (
      <section className="border-[3px] border-brand-deep bg-paper">
        <header className="flex items-baseline gap-2 border-b-2 border-brand-deep bg-brand-pale px-2.5 py-1.5">
          <span aria-hidden className="text-[11px]">
            👑
          </span>
          <span className="font-pixel text-[11px] font-bold uppercase tracking-[0.1em] text-ink">
            Final team answer
          </span>
          <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-brand-deep">
            Writing…
          </span>
        </header>
        <div className="px-2.5 py-2">
          <Markdown text={stream} />
          <span aria-hidden className="blink font-mono text-[11px] text-brand-deep">
            ▌
          </span>
        </div>
      </section>
    )
  }

  return (
    <section className="border-2 border-brand-deep bg-brand-pale/40 px-2.5 py-2">
      <p className="flex items-center gap-1.5">
        <span aria-hidden className="blink font-mono text-[10px] text-brand-deep">
          ✦
        </span>
        <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
          {outstanding.length > 0 ? 'Team working' : 'Pulling the findings together'}
        </span>
      </p>
      <p className="mt-1 font-ui text-[12px] leading-snug text-ink-3">
        {outstanding.length > 0
          ? `Waiting on ${outstanding.map((m) => m.name).join(', ')}. The final answer appears here once ${
              outstanding.length === 1 ? 'they have' : 'they have all'
            } reported back.`
          : `${run.leadName} is writing the team's answer.`}
      </p>
    </section>
  )
}

function NoAnswer() {
  return (
    <section className="border-2 border-rust bg-paper px-2.5 py-2">
      <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-rust">
        No team answer
      </p>
      <p className="mt-1 font-ui text-[12px] leading-snug text-ink-3">
        The run ended without the lead producing a final answer. What each agent
        did get to is below.
      </p>
    </section>
  )
}

/**
 * Who did what: one card per participant.
 *
 * The lead first, then the workers in the order they were given work, which is
 * the order the delegation actually happened in. Each card is closed to a
 * single line — name, role, state — and opens to that agent's own findings, so
 * the section reads as a summary of the team and expands into the evidence.
 */
function Workflow({
  run,
  streaming
}: {
  run: TeamRun
  streaming: Record<string, string>
}) {
  const findingFor = (agentId: string): Finding | undefined =>
    run.findings.find((f) => f.agentId === agentId)

  const workers = run.members.filter((m) => !m.isLead)

  return (
    <section>
      <div className="flex items-baseline gap-2">
        <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          Team workflow
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
          {workers.length === 0
            ? `${run.leadName} handled it alone`
            : `${run.leadName} → ${workers.length} ${workers.length === 1 ? 'agent' : 'agents'}`}
        </p>
      </div>

      <ul className="mt-1.5 flex flex-col gap-1.5">
        {run.members.map((member) => (
          <li key={member.agentId}>
            <MemberCard
              member={member}
              finding={findingFor(member.agentId)}
              stream={streaming[member.agentId]}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function MemberCard({
  member,
  finding,
  stream
}: {
  member: Member
  finding: Finding | undefined
  stream: string | undefined
}) {
  /*
   * Open while there is something happening, closed once there is not. A
   * finished agent's report is evidence the user can go back to; a running
   * agent's is the thing they are watching.
   */
  const [open, setOpen] = useState(member.phase === 'working')
  const body = finding?.result ?? stream ?? null
  const canOpen = Boolean(body || finding?.error || member.assignment)

  return (
    <div
      className={[
        'border-2 bg-paper',
        member.phase === 'failed'
          ? 'border-rust'
          : member.phase === 'working'
            ? 'border-brand-deep'
            : 'border-rule'
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => canOpen && setOpen((v) => !v)}
        aria-expanded={canOpen ? open : undefined}
        disabled={!canOpen}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors enabled:hover:bg-brand-pale"
      >
        {member.isLead && (
          <span aria-hidden className="text-[10px]">
            👑
          </span>
        )}
        <span className="shrink-0 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
          {member.name}
        </span>
        {member.role && (
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.06em] text-ink-3">
            {member.role}
          </span>
        )}
        <PhaseBadge member={member} />
        {canOpen && (
          <span aria-hidden className="shrink-0 font-mono text-[10px] text-ink-3">
            {open ? '−' : '+'}
          </span>
        )}
      </button>

      {/*
        The assignment stays visible whether or not the card is open. It is the
        one line that explains why this agent is in the list at all, and hiding
        it behind a toggle is what made the old view impossible to skim.
      */}
      {member.assignment && (
        <p className="border-t border-rule/60 px-2 py-1 font-ui text-[11.5px] leading-snug text-ink-3">
          {member.assignment}
        </p>
      )}

      {member.action && (
        <p className="flex items-center gap-1.5 border-t border-rule/60 px-2 py-1">
          <span aria-hidden className="blink font-mono text-[9px] text-brand-deep">
            ✦
          </span>
          <span className="truncate font-ui text-[11px] italic text-ink-3">
            {member.action}
          </span>
        </p>
      )}

      {open && (body || finding?.error) && (
        <div className="border-t-2 border-rule px-2 py-1.5">
          {finding?.error ? (
            <p className="font-ui text-[12px] leading-snug text-rust">{finding.error}</p>
          ) : (
            <>
              <Markdown text={body ?? ''} compact />
              {!finding && stream && (
                <span aria-hidden className="blink font-mono text-[11px] text-brand-deep">
                  ▌
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PhaseBadge({ member }: { member: Member }) {
  const label = phaseLabel(member)
  const tone =
    member.phase === 'failed'
      ? 'border-rust text-rust'
      : member.phase === 'done'
        ? 'border-sage-dark text-sage-dark'
        : member.phase === 'working'
          ? 'border-brand-deep text-brand-deep'
          : 'border-rule text-ink-3'

  return (
    <span
      className={`ml-auto shrink-0 border px-1 py-px font-mono text-[9px] uppercase tracking-[0.08em] ${tone}`}
    >
      {member.phase === 'working' && (
        <span aria-hidden className="blink mr-1">
          ●
        </span>
      )}
      {label}
    </span>
  )
}

/**
 * The raw sequence, folded away.
 *
 * Third in the order and closed by default, because it answers a different
 * question from the rest of the view: not "what did the team find" but "what
 * did the team do, and when". That is worth having and is never the thing to
 * read first.
 */
function Timeline({ events }: { events: TimelineEvent[] }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="border-2 border-rule bg-paper">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-1 text-left transition-colors hover:bg-brand-pale"
      >
        <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
          Team activity
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-3">
          {events.length}
        </span>
        <span aria-hidden className="font-mono text-[10px] text-ink-3">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <ol className="border-t-2 border-rule px-2 py-1">
          {events.map((event) => (
            <li key={event.id} className="flex items-baseline gap-2 py-px">
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-3">
                {clockTime(event.at)}
              </span>
              <span
                className={[
                  'font-mono text-[11px] leading-snug',
                  event.kind === 'failed'
                    ? 'text-rust'
                    : event.kind === 'finished'
                      ? 'text-sage-dark'
                      : 'text-ink-3'
                ].join(' ')}
              >
                {event.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
