import type { Theme } from '../../themes/types'
import { bucketFor, STATUS_GLYPH } from '../../characters/character.states'
import { ALL_AGENTS, useBackstage } from '../../stores/backstageStore'
import { groupWorkers, type Worker } from '../../agents/workers'

interface Props {
  theme: Theme
  workers: Worker[]
  onSpawn: () => void
}

const BUCKETS = ['working', 'thinking', 'talking', 'idle'] as const

/**
 * The top of the command centre: who is on the team, and who you are talking
 * to.
 *
 * Fixed rather than scrolling. This is the answer to "who is working?", and it
 * has to stay on screen while the surfaces below it change — the panel is a
 * tool, and a tool does not hide its own status bar.
 *
 * The list is every *worker*, which now means CLI sessions as well as
 * configured agents. A Claude session the user started is something they can
 * talk to, so it belongs here; leaving it out was the reason the terminal had
 * to be the only way to reach it.
 *
 * Selecting only changes which conversation is shown. It never starts or
 * stops anything.
 */
export function TeamHeader({ theme, workers, onSpawn }: Props) {
  const target = useBackstage((s) => s.chatTarget)
  const setTarget = useBackstage((s) => s.setChatTarget)

  void theme

  const counts: Record<string, number> = {}
  for (const worker of workers) {
    const bucket = bucketFor(worker.status)
    counts[bucket] = (counts[bucket] ?? 0) + 1
  }
  const errored = workers.filter((w) => w.status === 'error').length
  const agentCount = workers.filter((w) => w.kind === 'agent').length

  const groups = groupWorkers(workers)

  return (
    <header className="shrink-0 border-b-[3px] border-ink bg-cream px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-pixel text-sm font-bold uppercase tracking-[0.06em] text-ink">
          Your Team
        </h1>
        {/*
          The roster size, not an activity count. It sat directly above the
          "0 WORKING" tally reading "5 WORKING", which is the same two words
          saying opposite things a line apart.
        */}
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
          <span className="text-ink">{workers.length}</span>{' '}
          {workers.length === 1 ? 'worker' : 'workers'}
        </span>
      </div>

      <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em]">
        {BUCKETS.map((bucket) => {
          const n = counts[bucket] ?? 0
          const on = n > 0
          return (
            <li key={bucket} className="flex items-center gap-1">
              <span aria-hidden className={on ? 'text-brand-deep' : 'text-rule'}>
                {STATUS_GLYPH[bucket === 'idle' ? 'idle' : bucket]}
              </span>
              <span className={on ? 'text-ink' : 'text-ink-3'}>{n}</span>
              <span className="text-ink-3">{bucket}</span>
            </li>
          )
        })}
        {/* An agent whose provider failed is not idle, and must not be
            counted as though it were. */}
        {errored > 0 && (
          <li className="flex items-center gap-1">
            <span aria-hidden className="text-rust">
              {STATUS_GLYPH.error}
            </span>
            <span className="text-rust">{errored}</span>
            <span className="text-ink-3">error</span>
          </li>
        )}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        <label
          htmlFor="chat-target"
          className="shrink-0 font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3"
        >
          Talk to
        </label>
        <select
          id="chat-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="min-w-0 flex-1 border-2 border-ink bg-paper px-2 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink outline-none focus:border-brand-deep"
        >
          {/*
            The count is agents only, because that is who a broadcast reaches.
            CLI sessions are listed below and can be talked to individually,
            but sending one prompt to every running process at once is not
            something to do by accident.
          */}
          <option value={ALL_AGENTS}>
            All agents{agentCount > 0 ? ` (${agentCount})` : ''}
          </option>
          {/*
            Grouped, and only for groups that exist — a user who has never
            opened a terminal should not be shown an empty CLI SESSIONS
            heading explaining a feature to them inside a dropdown.
          */}
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label.toUpperCase()}>
              {group.workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                  {worker.role ? ` — ${worker.role}` : ''}
                  {worker.busy ? ' ●' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <button
          type="button"
          onClick={onSpawn}
          title="Spawn a new agent"
          className="shrink-0 border-2 border-ink bg-brand px-2 py-1 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px hover:bg-brand-lite"
        >
          + Spawn
        </button>
      </div>
    </header>
  )
}
