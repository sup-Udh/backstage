import { useEffect, useMemo, useRef, useState } from 'react'
import type { CharacterDef } from '../../characters/character.types'
import { CharacterSprite } from '../../world/CharacterSprite'
import {
  STATUS_GLYPH,
  STATUS_LABEL,
  characterStateForAgent
} from '../../characters/character.states'
import { ACTIVITY_GLYPH } from '../../shared/activity'
import { elapsedLabel } from '../../components/Activity/ActivityBadge'
import { ActivityTimeline } from '../../components/Activity/ActivityTimeline'
import { MAX_CONNECTIONS, type Worker } from '../../agents/workers'

interface Props {
  worker: Worker
  character: CharacterDef
  /** The active theme's cast, for recasting a session. */
  cast: CharacterDef[]
  /** Every other worker, for the connect picker. */
  others: Worker[]
  /** Resolved names for this worker's existing connections. */
  connections: Worker[]
  onClose: () => void
  onOpenChat: () => void
  onOpenThread: () => void
  onViewTask: () => void
  onStop: () => void
  onConnect: (otherId: string) => void
  onDisconnect: (otherId: string) => void
  onRename: (name: string) => void
  /** Open this agent's full configuration. Absent for CLI sessions. */
  onSettings: (() => void) | null
  onRecast: (slot: number) => void
}

const ACTIVE = ['working', 'thinking', 'talking', 'success']

/**
 * The panel for a character the user has clicked.
 *
 * Unlike the hover card this sticks around, so it carries the things the user
 * actually wants to do to an agent: see what it is working on, talk to it,
 * connect it to a teammate, and stop it. Every control acts on the real
 * runtime — Stop cancels the execution or interrupts the session, and Connect
 * writes a relationship the main process has to accept.
 */
export function AgentInspector({
  worker,
  character,
  cast,
  others,
  connections,
  onClose,
  onOpenChat,
  onOpenThread,
  onViewTask,
  onStop,
  onConnect,
  onDisconnect,
  onRename,
  onSettings,
  onRecast
}: Props) {
  const active = ACTIVE.includes(worker.status)
  const activity = worker.activity

  /*
   * A ticking clock, and only while something is running. Nothing else on this
   * panel changes during a two-minute command, so without it the elapsed
   * figure would read 0s for the whole two minutes.
   */
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!activity) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [activity])
  const [connecting, setConnecting] = useState(false)
  const [recasting, setRecasting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(worker.name)
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(worker.name), [worker.name])
  useEffect(() => {
    if (renaming) renameRef.current?.select()
  }, [renaming])

  const atLimit = connections.length >= MAX_CONNECTIONS

  /**
   * Who this worker could still be connected to.
   *
   * Like connects to like. An agent's relationships are persisted
   * configuration and a session's are a property of two running processes, so
   * there is no store that could hold a link between one of each — offering
   * it would be offering something that could not be honoured.
   */
  const candidates = useMemo(
    () =>
      others.filter(
        (o) =>
          o.kind === worker.kind &&
          o.id !== worker.id &&
          !connections.some((c) => c.id === o.id) &&
          o.connections.length < MAX_CONNECTIONS
      ),
    [others, worker.id, worker.kind, connections]
  )

  const commitRename = () => {
    const next = draft.trim()
    setRenaming(false)
    if (next && next !== worker.name) onRename(next)
    else setDraft(worker.name)
  }

  return (
    <aside className="absolute bottom-4 left-4 z-20 w-[280px] border-[3px] border-brand bg-slate shadow-[4px_4px_0_0_rgba(27,27,42,0.5)]">
      <header className="flex items-start gap-3 border-b-2 border-slate-rule p-3">
        <div className="shrink-0 border-2 border-slate-rule bg-slate-2 p-1">
          <CharacterSprite
            appearance={character.appearance}
            state={characterStateForAgent(worker.status, true, activity?.type ?? null)}
            scale={2}
          />
        </div>

        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              ref={renameRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') {
                  setDraft(worker.name)
                  setRenaming(false)
                }
              }}
              className="w-full border-2 border-brand bg-slate-2 px-1 py-0.5 font-pixel text-sm font-bold uppercase tracking-[0.06em] text-brand outline-none"
            />
          ) : (
            <p className="flex items-baseline gap-1.5">
              <span className="font-pixel text-base font-bold uppercase leading-none tracking-[0.06em] text-brand">
                {worker.name}
              </span>
              {/*
                Only CLI sessions are renameable here. An agent's name is its
                configuration and belongs in the editor, where the rest of its
                configuration is; a session has no editor to send anyone to.
              */}
              {worker.kind === 'cli' && (
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  title="Rename this session"
                  className="font-mono text-[10px] text-dim transition-colors hover:text-brand"
                >
                  ✎
                </button>
              )}
            </p>
          )}

          <p className="mt-1.5 font-ui text-xs leading-none text-on-slate-2">
            {worker.role}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
            {worker.provider} · {worker.model}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 font-mono text-xs text-dim transition-colors hover:text-on-slate"
        >
          ✕
        </button>
      </header>

      <div className="flex flex-col gap-3 p-3">
        <div>
          <Label>Status</Label>
          <p className="mt-1 flex items-center gap-1.5 font-pixel text-xs font-semibold uppercase tracking-[0.06em]">
            <span aria-hidden className={active ? 'blink text-brand' : 'text-dim'}>
              {activity ? ACTIVITY_GLYPH[activity.type] : STATUS_GLYPH[worker.status]}
            </span>
            <span className={active ? 'text-brand' : 'text-dim'}>
              {activity ? activity.label : STATUS_LABEL[worker.status]}
            </span>
            {activity && (
              <span className="ml-auto font-mono text-[10px] tabular-nums text-dim">
                {elapsedLabel(activity.startedAt, now)}
              </span>
            )}
          </p>

          {/*
            The whole target rather than the shortened one. This panel is
            precisely where the badge above the character defers to — §24 asks
            for a small label in the world and the detail on click, and this is
            the click.
          */}
          {activity?.detailFull && (
            <p className="mt-1 break-all font-mono text-[11px] leading-snug text-brand-lite">
              {activity.detailFull}
            </p>
          )}

          <p className="mt-1 font-ui text-[12px] leading-snug text-on-slate">
            {worker.task ?? worker.action ?? 'Nothing right now.'}
          </p>

          {activity?.toolName && (
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-dim">
              tool {activity.toolName}
            </p>
          )}
          {/*
            Only offered when there is something to look at. A button that
            opens an empty task list teaches the user it is not worth pressing.
          */}
          {(worker.task || worker.busy) && (
            <button
              type="button"
              onClick={onViewTask}
              className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-brand underline-offset-2 transition-colors hover:text-brand-lite hover:underline"
            >
              View task →
            </button>
          )}
        </div>

        {/*
          What led up to it.

          The same record the activity panel shows, scoped to this character —
          §40 asks the inspector to answer "what is this person doing" without
          the user opening anything else, and the last few steps are most of
          that answer.
        */}
        <div>
          <Label>Recent activity</Label>
          <div className="-mx-1 mt-1 border-2 border-slate-rule bg-slate-2">
            <ActivityTimeline agentId={worker.id} limit={6} />
          </div>
        </div>

        {/*
          Recasting, for a session. An agent's character is part of its
          configuration and belongs in the editor with the rest of it; a
          session has no editor, so this is the only place it can be chosen.
        */}
        {recasting && (
          <div>
            <Label>Character</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {cast.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onRecast(i)
                    setRecasting(false)
                  }}
                  className={[
                    'border-2 px-1.5 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors',
                    c.id === character.id
                      ? 'border-brand bg-brand text-on-brand'
                      : 'border-slate-rule bg-slate-2 text-on-slate hover:border-brand hover:text-brand'
                  ].join(' ')}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {
          <div>
            <Label>
              Connections ({connections.length}/{MAX_CONNECTIONS})
            </Label>

            {connections.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1">
                {connections.map((other) => (
                  <li
                    key={other.id}
                    className="flex items-center gap-1.5 border-2 border-slate-rule bg-slate-2 px-1.5 py-0.5"
                  >
                    <span aria-hidden className="font-mono text-[10px] text-brand">
                      ↔
                    </span>
                    <span className="min-w-0 flex-1 truncate font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-on-slate">
                      {other.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDisconnect(other.id)}
                      title={`Remove the connection to ${other.name}`}
                      className="shrink-0 font-mono text-[10px] text-dim transition-colors hover:text-rust-lite"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {atLimit ? (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
                Max connections reached
              </p>
            ) : connecting ? (
              <select
                autoFocus
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) onConnect(e.target.value)
                  setConnecting(false)
                }}
                onBlur={() => setConnecting(false)}
                className="mt-1 w-full border-2 border-brand bg-slate-2 px-1.5 py-1 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-on-slate outline-none"
              >
                <option value="">Connect to…</option>
                {candidates.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={() => setConnecting(true)}
                disabled={candidates.length === 0}
                className="mt-1 w-full border-2 border-slate-rule bg-slate-2 px-2 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-on-slate transition-colors hover:border-brand hover:text-brand disabled:text-dim disabled:hover:border-slate-rule"
              >
                {candidates.length === 0
                  ? 'Nobody to connect to'
                  : worker.kind === 'cli'
                    ? '+ Connect session'
                    : '+ Connect agent'}
              </button>
            )}
          </div>
        }

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onOpenChat}
            className="w-full border-2 border-brand-shadow bg-brand px-2 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-on-brand transition-transform duration-75 hover:-translate-y-px hover:bg-brand-lite"
          >
            Open chat
          </button>

          {connections.length > 0 && (
            <button
              type="button"
              onClick={onOpenThread}
              className="w-full border-2 border-slate-rule bg-slate-2 px-2 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-on-slate transition-colors hover:border-brand hover:text-brand"
            >
              Group chat ({connections.length + 1})
            </button>
          )}

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onStop}
              disabled={!worker.canStop}
              title={
                worker.kind === 'cli'
                  ? 'Interrupt the current turn. The session stays open.'
                  : 'Cancel this execution and clear the queue.'
              }
              className="flex-1 border-2 border-slate-rule bg-slate-2 px-2 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-on-slate transition-colors hover:border-rust hover:text-rust-lite disabled:text-dim disabled:hover:border-slate-rule disabled:hover:text-dim"
            >
              {worker.status === 'stopping' ? 'Stopping…' : 'Stop'}
            </button>
            <button
              type="button"
              onClick={() => (onSettings ? onSettings() : setRecasting((v) => !v))}
              title={
                onSettings
                  ? 'Open this agent’s full configuration'
                  : 'Choose which character stands in for this session'
              }
              className="flex-1 border-2 border-slate-rule bg-slate-2 px-2 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-on-slate transition-colors hover:border-brand hover:text-brand"
            >
              Settings
            </button>
            {/*
              There used to be a "centre the camera" button here. The room is
              laid out to fit the panel now, so every character is already on
              screen and there is nothing for it to do.
            */}
          </div>
        </div>
      </div>
    </aside>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-dim">
      {children}
    </p>
  )
}
