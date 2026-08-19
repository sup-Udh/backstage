import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DirEntry, ProjectCommand, TextResult } from '../shared/providerApi'
import { useBackstage } from '../stores/backstageStore'
import { ActivityRail } from './ActivityRail'

/**
 * The command centre's working surfaces: files, git, commands and tasks.
 *
 * All four read through the same IPC the agents use, so what the user sees is
 * what an agent would see. Everything is fetched when its tab becomes active
 * rather than watched, which keeps a surface nobody has opened from costing
 * anything.
 *
 * Each one takes the footer's query as a prop rather than owning a search box.
 * There is one input in the panel and it belongs to whichever tab is showing,
 * which is what stops the surface sprouting a second row of controls per tab.
 */

const heading =
  'font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3'

function Pre({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-ink-3">
      {text}
    </pre>
  )
}

/** Nothing-to-show copy, in the one place it is styled. */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-ui text-[13px] leading-[1.6] text-ink-3">{children}</p>
}

/* ----------------------------------------------------------------- files -- */

export function FilesPanel({
  query,
  onOpen
}: {
  query: string
  onOpen: (path: string) => void
}) {
  const [dir, setDir] = useState('.')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [result, setResult] = useState<TextResult | null>(null)
  /* Which directory is on screen, readable from a subscription callback. */
  const dirRef = useRef('.')

  const load = useCallback(async (path: string) => {
    setResult(null)
    setDir(path)
    dirRef.current = path
    setEntries(await window.backstage.files.list(path))
  }, [])

  useEffect(() => {
    void load('.')
  }, [load])

  /*
   * Re-read the directory when the watcher sees the workspace change. A file
   * an agent has just written has to appear here without the user going and
   * looking for it — that is the whole point of watching the real folder.
   */
  useEffect(() => {
    if (!window.backstage?.files) return
    return window.backstage.files.onChanges(() => {
      void window.backstage.files.list(dirRef.current).then(setEntries)
    })
  }, [])

  const up = () => {
    if (dir === '.') return
    const parts = dir.split('/').filter(Boolean)
    parts.pop()
    void load(parts.length ? parts.join('/') : '.')
  }

  /* The footer query filters by name; searching contents is a deliberate act. */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.name.toLowerCase().includes(q))
  }, [entries, query])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-rule px-3 py-1.5">
        <button
          type="button"
          onClick={up}
          disabled={dir === '.'}
          title="Up one level"
          className="border-2 border-rule px-1.5 py-0.5 font-pixel text-[10px] font-semibold text-ink-3 transition-colors enabled:hover:border-ink enabled:hover:bg-brand-pale enabled:hover:text-ink disabled:opacity-40"
        >
          ↑
        </button>
        <span className="truncate font-mono text-[11px] text-ink">{dir}</span>

        {query.trim() && (
          <button
            type="button"
            onClick={async () =>
              setResult(await window.backstage.files.search(query.trim()))
            }
            className="ml-auto shrink-0 border-2 border-rule bg-paper px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:bg-brand-pale hover:text-ink"
          >
            Search contents
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {result ? (
          <>
            <button
              type="button"
              onClick={() => setResult(null)}
              className={`mb-2 ${heading} hover:text-ink`}
            >
              ← back to files
            </button>
            <Pre text={result.output ?? result.error ?? 'No matches.'} />
          </>
        ) : (
          <ul>
            {shown.map((e) => (
              <li key={e.path}>
                <button
                  type="button"
                  onClick={() =>
                    e.kind === 'dir' ? void load(e.path) : onOpen(e.path)
                  }
                  className="flex w-full items-baseline gap-2 py-[3px] text-left font-mono text-[11px] text-ink-3 transition-colors hover:text-ink"
                >
                  <span
                    aria-hidden
                    className={e.kind === 'dir' ? 'text-brand-deep' : 'text-rule'}
                  >
                    {e.kind === 'dir' ? '▾' : '·'}
                  </span>
                  <span className={e.kind === 'dir' ? 'text-ink' : ''}>{e.name}</span>
                  {e.size !== undefined && (
                    <span className="ml-auto text-[10px] text-rule">{e.size}</span>
                  )}
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <Empty>
                {entries.length === 0
                  ? 'Nothing here.'
                  : 'Nothing matches that name.'}
              </Empty>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- file view -- */

export function FileView({ path, onClose }: { path: string; onClose: () => void }) {
  const [result, setResult] = useState<TextResult | null>(null)

  useEffect(() => {
    setResult(null)
    void window.backstage.files.read(path).then(setResult)
  }, [path])

  /* Line numbers, because a file without them is not much of a viewer. */
  const lines = (result?.content ?? '').split('\n')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b-2 border-rule px-3 py-1.5">
        <span className="truncate font-mono text-[11px] text-ink" title={path}>
          {path}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto shrink-0 border-2 border-rule px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase text-ink-3 transition-colors hover:border-ink hover:bg-brand-pale hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {result?.content !== undefined ? (
          <ol className="font-mono text-[11px] leading-[1.6]">
            {lines.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 select-none text-right text-[10px] tabular-nums text-rule">
                  {i + 1}
                </span>
                <span className="whitespace-pre-wrap break-words text-ink-3">
                  {line || ' '}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <Empty>{result?.error ?? 'Loading…'}</Empty>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- git -- */

interface Change {
  code: string
  path: string
}

/**
 * Parse `git status --porcelain=v1 -b`.
 *
 * Porcelain is the stable format precisely so it can be read like this; the
 * human-facing output is not promised to keep its shape between versions.
 */
function parseStatus(output: string): { branch: string | null; changes: Change[] } {
  let branch: string | null = null
  const changes: Change[] = []

  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    if (line.startsWith('##')) {
      // "## main...origin/main [ahead 1]" — the local name is what matters.
      branch = line.slice(2).trim().split(/\.{3}|\s/)[0] || null
      continue
    }
    changes.push({ code: line.slice(0, 2).trim() || '?', path: line.slice(3) })
  }

  return { branch, changes }
}

export function GitPanel({ query }: { query: string }) {
  const [view, setView] = useState<'changes' | 'diff' | 'log'>('changes')
  const [branch, setBranch] = useState<string | null>(null)
  const [status, setStatus] = useState<TextResult | null>(null)
  const [result, setResult] = useState<TextResult | null>(null)

  const refresh = useCallback(() => {
    void window.backstage.git.branch().then((b) => setBranch(b.branch))
    void window.backstage.git.status().then(setStatus)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /* An agent editing a file changes the working tree; say so without asking. */
  useEffect(() => {
    if (!window.backstage?.files) return
    return window.backstage.files.onChanges(() => refresh())
  }, [refresh])

  useEffect(() => {
    if (view === 'changes') return
    setResult(null)
    const call =
      view === 'diff' ? window.backstage.git.diff() : window.backstage.git.log()
    void call.then(setResult)
  }, [view])

  const parsed = parseStatus(status?.output ?? '')
  const q = query.trim().toLowerCase()
  const changes = q
    ? parsed.changes.filter((c) => c.path.toLowerCase().includes(q))
    : parsed.changes

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b-2 border-rule px-3 py-1.5">
        {(['changes', 'diff', 'log'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setView(t)}
            aria-pressed={view === t}
            className={`border-2 px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors ${
              view === t
                ? 'border-ink bg-brand text-ink'
                : 'border-rule text-ink-3 hover:border-ink hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}

        <span className="ml-auto flex items-baseline gap-1.5 truncate">
          <span className={heading}>Branch</span>
          <span className="truncate font-mono text-[11px] text-ink">
            {branch ?? parsed.branch ?? '—'}
          </span>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {view === 'changes' ? (
          changes.length > 0 ? (
            <ul className="flex flex-col">
              {changes.map((c) => (
                <li key={c.path}>
                  <button
                    type="button"
                    onClick={() => setView('diff')}
                    title="View the diff"
                    className="flex w-full items-baseline gap-2.5 py-[3px] text-left transition-colors hover:text-ink"
                  >
                    {/*
                      The porcelain code is the honest label — M, A, D, ?? all
                      mean something specific, and translating them to prose
                      would lose that.
                    */}
                    <span className="w-5 shrink-0 border-2 border-rule bg-brand-pale text-center font-mono text-[10px] font-medium text-ink">
                      {c.code}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-3">
                      {c.path}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              {status === null
                ? 'Loading…'
                : status.error
                  ? status.error
                  : parsed.changes.length > 0
                    ? 'Nothing matches that path.'
                    : 'Working tree clean.'}
            </Empty>
          )
        ) : (
          <Pre text={result?.output ?? result?.error ?? 'Loading…'} />
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- commands -- */

export function CommandsPanel({
  query,
  onRun
}: {
  query: string
  onRun: (command: string) => void
}) {
  const [commands, setCommands] = useState<ProjectCommand[]>([])

  useEffect(() => {
    void window.backstage.commands.list().then(setCommands)
  }, [])

  const q = query.trim().toLowerCase()
  const shown = q
    ? commands.filter(
        (c) =>
          c.command.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
      )
    : commands

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <p className={`mb-2 ${heading}`}>Detected from the project manifest</p>

      <ul className="flex flex-col gap-1">
        {shown.map((c) => (
          <li key={c.command}>
            <button
              type="button"
              onClick={() => onRun(c.command)}
              title="Run in a real terminal session"
              className="flex w-full items-baseline gap-2 border-2 border-rule bg-paper px-2.5 py-1.5 text-left transition-colors hover:border-ink hover:bg-brand-pale"
            >
              <span aria-hidden className="font-mono text-[10px] text-brand-deep">
                ▸
              </span>
              <span className="truncate font-mono text-[11px] text-ink">
                {c.command}
              </span>
              <span className="ml-auto shrink-0 font-ui text-[10px] text-ink-3">
                {c.source}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <Empty>
          {commands.length === 0
            ? 'No commands found. Open a project with a package manifest.'
            : 'Nothing matches that.'}
        </Empty>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- tasks -- */

/**
 * Everything the workspace is currently working on, in one list.
 *
 * A Backstage task and a Claude Code session are the same thing from the
 * user's point of view — work in progress with a character doing it — so they
 * belong on the same surface. Selecting one focuses whoever is doing it.
 */
export function TasksPanel({
  onFocus
}: {
  onFocus: (session: { terminalSessionId: string; agentId: string }) => void
}) {
  const chatTarget = useBackstage((s) => s.chatTarget)
  const task = useBackstage((s) => s.agentTasks[chatTarget])
  const sessions = useBackstage((s) => s.agentSessions)

  const running = sessions.filter((s) => s.status !== 'exited' && s.status !== 'error')
  const finished = sessions.filter((s) => s.status === 'exited' || s.status === 'error')

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      {task && (
        <div className="mb-3 border-2 border-ink bg-paper px-2.5 py-2">
          <p className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`font-pixel text-[11px] ${
                task.status === 'running'
                  ? 'blink text-brand-deep'
                  : task.status === 'failed'
                    ? 'text-ink-3'
                    : 'text-brand-deep'
              }`}
            >
              {task.status === 'running' ? '●' : task.status === 'failed' ? '◇' : '◆'}
            </span>
            <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink">
              {task.status === 'running'
                ? 'Working'
                : task.status === 'failed'
                  ? 'Failed'
                  : 'Complete'}
            </span>
          </p>
          <p className="mt-1 font-ui text-[13px] leading-snug text-ink">{task.title}</p>
          {task.result && (
            <p className="mt-1 font-ui text-xs leading-[1.6] text-ink-3">
              {task.result}
            </p>
          )}
        </div>
      )}

      {running.length > 0 && (
        <>
          <p className={`mb-1.5 ${heading}`}>Live sessions</p>
          <ul className="mb-3 flex flex-col gap-1">
            {running.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() =>
                    onFocus({
                      terminalSessionId: s.terminalSessionId,
                      agentId: `cli-${s.terminalSessionId}`
                    })
                  }
                  title="Open this session"
                  className="w-full border-2 border-rule bg-paper px-2.5 py-1.5 text-left transition-colors hover:border-ink hover:bg-brand-pale"
                >
                  <p className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={`font-pixel text-[11px] text-brand-deep ${
                        s.status === 'working' ? 'blink' : ''
                      }`}
                    >
                      {s.status === 'working' ? '✦' : '●'}
                    </span>
                    <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink">
                      {s.status}
                    </span>
                    <span className="font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                      · {s.provider}
                    </span>
                  </p>
                  {s.lastOutput && (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-ink-3">
                      {s.lastOutput}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {finished.length > 0 && (
        <>
          <p className={`mb-1.5 ${heading}`}>Finished</p>
          <ul className="mb-3 flex flex-col gap-1">
            {finished.slice(-4).map((s) => (
              <li
                key={s.id}
                className="flex items-baseline gap-1.5 border-2 border-rule bg-cream px-2.5 py-1"
              >
                <span aria-hidden className="font-pixel text-[11px] text-ink-3">
                  {s.status === 'error' ? '◇' : '○'}
                </span>
                <span className="font-pixel text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                  {s.status}
                </span>
                <span className="font-pixel text-[11px] font-semibold uppercase text-ink-3">
                  · {s.provider}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {!task && sessions.length === 0 && (
        <Empty>
          Nothing running. Give your team a task, or start a CLI session in the
          terminal.
        </Empty>
      )}

      {/* What the work actually consisted of, rather than a separate feed. */}
      <ActivityRail limit={8} label="Recent activity" />
    </div>
  )
}
