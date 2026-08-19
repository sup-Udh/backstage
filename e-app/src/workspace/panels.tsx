import { useCallback, useEffect, useState } from 'react'
import type {
  DirEntry,
  ProjectCommand,
  TextResult
} from '../shared/providerApi'
import { useBackstage } from '../stores/backstageStore'

/**
 * The workspace drawers: files, git, commands and tasks.
 *
 * All four read through the same IPC the agents use, so what the user sees is
 * what an agent would see. Everything is fetched on open rather than watched,
 * which keeps a drawer that nobody has opened from costing anything.
 */

const mono = 'font-mono text-[11px] leading-[1.55] text-cream-2'
const heading =
  'font-pixel text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3'

function Pre({ text }: { text: string }) {
  return (
    <pre className={`${mono} whitespace-pre-wrap break-words text-ink-3`}>
      {text}
    </pre>
  )
}

/* ----------------------------------------------------------------- files -- */

export function FilesPanel({ onOpen }: { onOpen: (path: string) => void }) {
  const [dir, setDir] = useState('.')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<TextResult | null>(null)

  const load = useCallback(async (path: string) => {
    setResult(null)
    setDir(path)
    setEntries(await window.backstage.files.list(path))
  }, [])

  useEffect(() => {
    void load('.')
  }, [load])

  const up = () => {
    if (dir === '.') return
    const parts = dir.split('/').filter(Boolean)
    parts.pop()
    void load(parts.length ? parts.join('/') : '.')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!query.trim()) return
          setResult(await window.backstage.files.search(query.trim()))
        }}
        className="flex shrink-0 items-center gap-2 border-b-2 border-rule px-3 py-2"
      >
        <button
          type="button"
          onClick={up}
          disabled={dir === '.'}
          className="border-2 border-ink px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase text-ink-3 transition-colors enabled:hover:bg-brand-pale enabled:hover:text-ink disabled:opacity-40"
        >
          ↑
        </button>
        <span className="truncate font-mono text-[11px] text-ink">{dir}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contents…"
          className="ml-auto w-40 border-2 border-ink bg-cream px-2 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-brand-deep"
        />
      </form>

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
            {entries.map((e) => (
              <li key={e.path}>
                <button
                  type="button"
                  onClick={() => (e.kind === 'dir' ? void load(e.path) : onOpen(e.path))}
                  className="flex w-full items-baseline gap-2 py-0.5 text-left font-mono text-[11px] text-ink-3 transition-colors hover:text-ink"
                >
                  <span aria-hidden className={e.kind === 'dir' ? 'text-brand-deep' : 'text-rule'}>
                    {e.kind === 'dir' ? '▸' : '·'}
                  </span>
                  <span className={e.kind === 'dir' ? 'text-ink' : ''}>{e.name}</span>
                  {e.size !== undefined && (
                    <span className="ml-auto text-[10px] text-rule">{e.size}</span>
                  )}
                </button>
              </li>
            ))}
            {entries.length === 0 && (
              <p className="font-ui text-xs text-ink-3">Nothing here.</p>
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
    void window.backstage.files.read(path).then(setResult)
  }, [path])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b-2 border-rule px-3 py-2">
        <span className="truncate font-mono text-[11px] text-ink">{path}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto border-2 border-ink px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase text-ink-3 hover:bg-brand-pale hover:text-ink"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <Pre text={result?.content ?? result?.error ?? 'Loading…'} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- git -- */

export function GitPanel() {
  const [tab, setTab] = useState<'status' | 'diff' | 'log'>('status')
  const [branch, setBranch] = useState<string | null>(null)
  const [result, setResult] = useState<TextResult | null>(null)

  useEffect(() => {
    void window.backstage.git.branch().then((b) => setBranch(b.branch))
  }, [])

  useEffect(() => {
    setResult(null)
    const call =
      tab === 'status'
        ? window.backstage.git.status()
        : tab === 'diff'
          ? window.backstage.git.diff()
          : window.backstage.git.log()
    void call.then(setResult)
  }, [tab])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-rule px-3 py-2">
        {(['status', 'diff', 'log'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`border-2 px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors ${
              tab === t
                ? 'border-ink bg-brand text-ink'
                : 'border-rule text-ink-3 hover:border-ink hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
        {branch && (
          <span className="ml-auto font-mono text-[11px] text-ink-3">
            branch <span className="text-ink">{branch}</span>
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <Pre text={result?.output ?? result?.error ?? 'Loading…'} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- commands -- */

export function CommandsPanel({ onRun }: { onRun: (command: string) => void }) {
  const [commands, setCommands] = useState<ProjectCommand[]>([])

  useEffect(() => {
    void window.backstage.commands.list().then(setCommands)
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <p className={`mb-2 ${heading}`}>Detected from the project manifest</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {commands.map((c) => (
          <li key={c.command}>
            <button
              type="button"
              onClick={() => onRun(c.command)}
              className="w-full border-2 border-rule bg-paper px-2.5 py-1.5 text-left transition-colors hover:border-ink hover:bg-brand-pale"
            >
              <span className="block font-mono text-[11px] text-ink">{c.command}</span>
              <span className="block font-ui text-[10px] text-ink-3">{c.source}</span>
            </button>
          </li>
        ))}
      </ul>
      {commands.length === 0 && (
        <p className="font-ui text-xs text-ink-3">
          No commands found. Open a project with a package manifest.
        </p>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- tasks -- */

export function TasksPanel() {
  const task = useBackstage((s) => s.task)
  const sessions = useBackstage((s) => s.agentSessions)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <p className={`mb-2 ${heading}`}>Backstage tasks</p>
      {task ? (
        <div className="mb-4 border-2 border-ink bg-paper px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
            {task.status}
          </p>
          <p className="mt-1 font-ui text-sm text-ink">{task.title}</p>
          {task.result && (
            <p className="mt-1 font-ui text-xs leading-snug text-ink-3">
              {task.result}
            </p>
          )}
        </div>
      ) : (
        <p className="mb-4 font-ui text-xs text-ink-3">No task running.</p>
      )}

      <p className={`mb-2 ${heading}`}>External CLI sessions</p>
      {sessions.length === 0 ? (
        <p className="font-ui text-xs text-ink-3">
          None. Run <span className="font-mono text-ink">claude</span> or{' '}
          <span className="font-mono text-ink">codex</span> in the terminal.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="border-2 border-rule bg-paper px-2.5 py-1.5"
            >
              <p className="flex items-baseline gap-2">
                <span className="font-pixel text-[11px] font-semibold uppercase text-ink">
                  {s.provider}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                  {s.status}
                </span>
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-ink-3">
                {s.terminalSessionId} · {s.cwd}
              </p>
              {s.lastOutput && (
                <p className="mt-0.5 truncate font-ui text-[11px] text-ink-3">
                  {s.lastOutput}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
