import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Theme } from '../../themes/types'
import type { WorldEngine } from '../../world/engine/WorldEngine'
import { teamRuntime } from '../../agents/team'
import { useBackstage, type TabId } from '../../stores/backstageStore'
import { PromptBox } from './PromptBox'
import { TeamHeader } from './TeamHeader'
import { MessagesPanel } from './MessagesPanel'
import { TerminalPanel } from '../../workspace/TerminalPanel'
import {
  CommandsPanel,
  FilesPanel,
  FileView,
  GitPanel,
  TasksPanel
} from '../../workspace/panels'
import { useProviders } from '../../providers/useProviders'
import { useAgentConfigs } from '../../agents/useAgentConfigs'
import { useRuntimeEvents } from '../../agents/useRuntimeEvents'
import type { GenerationTurn } from '../../shared/providerApi'

interface Props {
  theme: Theme
  engine: WorldEngine
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'files', label: 'Files' },
  { id: 'git', label: 'Git' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'commands', label: 'Commands' }
]

/**
 * The command centre.
 *
 * Everything the user does to the workspace happens here: talking to the team,
 * reading their files, watching their sessions, running their commands. The
 * world next door tells the story; this is where the work is done.
 *
 * The shape is fixed on purpose — team, tabs, one surface, one input — and only
 * the surface in the middle scrolls. An input that scrolls away is an input the
 * user has to go looking for, and a live session must always be one keystroke
 * from a reply.
 *
 * It renders from the store and the engine's published views, never from the
 * world's per-frame state, so a busy office does not re-render the panel.
 */
export function CommandCenter({ theme, engine }: Props) {
  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)
  const pushUserMessage = useBackstage((s) => s.pushUserMessage)
  const pushSystemMessage = useBackstage((s) => s.pushSystemMessage)
  const messages = useBackstage((s) => s.messages)
  const task = useBackstage((s) => s.task)
  const mode = useBackstage((s) => s.mode)
  const setPage = useBackstage((s) => s.setPage)
  const target = useBackstage((s) => s.chatTarget)

  const tab = useBackstage((s) => s.tab)
  const setTab = useBackstage((s) => s.setTab)
  const openFile = useBackstage((s) => s.openFile)
  const setOpenFile = useBackstage((s) => s.setOpenFile)
  const queueCommand = useBackstage((s) => s.queueCommand)
  const requestSession = useBackstage((s) => s.requestSession)
  const selectAgent = useBackstage((s) => s.selectAgent)
  const activeTerminalId = useBackstage((s) => s.activeTerminalId)
  const terminalSessions = useBackstage((s) => s.terminalSessions)
  const agentSessions = useBackstage((s) => s.agentSessions)
  const terminalOpened = useBackstage((s) => s.terminalEverOpened)
  const markTerminalOpened = useBackstage((s) => s.markTerminalOpened)

  const { statuses, workspace, anyConnected } = useProviders()
  const { agents: configs } = useAgentConfigs()

  /** The footer's query, for the surfaces that filter rather than send. */
  const [query, setQuery] = useState('')

  // Runtime events drive both the world and this panel.
  useRuntimeEvents()

  const connected = anyConnected
  const live = mode === 'real'
  const busy = task?.status === 'running'

  /* Once opened the terminal stays mounted, or its scrollback dies with it. */
  useEffect(() => {
    if (tab === 'terminal') markTerminalOpened()
  }, [tab, markTerminalOpened])

  /* A tab change starts a fresh query; carrying one over only confuses. */
  useEffect(() => {
    setQuery('')
  }, [tab])

  /* Keyboard shortcuts, chosen not to collide with Electron's own. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key === '`') {
        e.preventDefault()
        setTab('terminal')
      } else if (e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault()
        setTab('files')
      } else if (e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setTab('git')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab])

  /*
   * Watching a CLI session highlights the character running it, so the world
   * and the panel are always describing the same piece of work.
   *
   * Only on the way in. A CLI session emits a status change every second or
   * two, and re-selecting on each of them would drag the highlight back off
   * whoever the user had just clicked in the world.
   */
  const lastHighlighted = useRef<string | null>(null)
  useEffect(() => {
    if (tab !== 'terminal' || !activeTerminalId) return
    const session = agentSessions.find(
      (s) => s.terminalSessionId === activeTerminalId && s.status !== 'exited'
    )
    const id = session ? `cli-${session.terminalSessionId}` : null
    if (id && id !== lastHighlighted.current) {
      lastHighlighted.current = id
      selectAgent(id)
    }
  }, [tab, activeTerminalId, agentSessions, selectAgent])

  /*
   * The configured name loses to the character's: this is the user's agent,
   * wearing whichever costume the active world provides.
   */
  const nameFor = (agentId?: string) => {
    const cfg = configs.find((a) => a.id === agentId)
    if (cfg) {
      const cast = theme.characters
      return cast[((cfg.characterSlot % cast.length) + cast.length) % cast.length].name
    }
    return agents.find((v) => v.characterId === agentId)?.name ?? 'Agent'
  }

  const targetName = target === 'all' ? 'the team' : nameFor(target)

  const submit = (text: string) => {
    pushUserMessage(text)

    if (!live) {
      teamRuntime.submitTask(text)
      return
    }

    if (!connected) {
      // Never make a network call we know will fail.
      pushSystemMessage(
        'No AI provider is connected. Connect one in Account to start working.'
      )
      return
    }

    /*
     * Prior turns for continuity. The transcript is the source of truth here;
     * the main process trims it again before it goes out, so a long session
     * cannot quietly grow the request.
     */
    const history: GenerationTurn[] = messages
      .filter((m) => m.kind === 'user' || m.kind === 'agent')
      .slice(-12)
      .map((m) => ({
        role: m.kind === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text
      }))

    /*
     * Fire and forget: the task runs in the main process and reports back as
     * events, which is what lets the world animate while it works rather than
     * freezing until a promise resolves.
     */
    void window.backstage.agents.run({ prompt: text, history, target }).then((ack) => {
      if (!ack.accepted) {
        pushSystemMessage(ack.error ?? 'Could not start that task.')
      }
    })
  }

  /*
   * Session input goes to the PTY the session surface is showing — the same
   * process, the same stdin as the keyboard. It must never become a second
   * request through Backstage's own runtime: if the user started Claude Code,
   * they are talking to Claude Code.
   */
  const sendToSession = (text: string) => {
    if (!activeTerminalId) return
    void window.backstage.terminal.write(
      activeTerminalId,
      text + String.fromCharCode(13)
    )
  }

  const session = terminalSessions.find((s) => s.id === activeTerminalId)
  const sessionAgent = session?.agent
  const sessionLabel = sessionAgent
    ? sessionAgent.replace(/^./, (c) => c.toUpperCase())
    : 'the shell'

  /* What the one input at the bottom is for, on this tab. */
  const footer: {
    mode: 'send' | 'filter'
    placeholder: string
    disabled?: boolean
    onSend?: (text: string) => void
  } = {
    messages: {
      mode: 'send' as const,
      placeholder: busy ? `${targetName} is working…` : `Ask ${targetName}…`,
      disabled: busy,
      onSend: submit
    },
    terminal: {
      mode: 'send' as const,
      placeholder: session
        ? `Message ${sessionLabel}…`
        : 'Open a session to send input…',
      disabled: !session || session.status === 'exited',
      onSend: sendToSession
    },
    tasks: {
      mode: 'send' as const,
      placeholder: 'Create a task…',
      disabled: busy,
      onSend: submit
    },
    files: { mode: 'filter' as const, placeholder: 'Search files…' },
    git: { mode: 'filter' as const, placeholder: 'Filter changes…' },
    commands: { mode: 'filter' as const, placeholder: 'Search commands…' }
  }[tab]

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col border-l-[3px] border-ink bg-cream">
      <TeamHeader theme={theme} agents={agents} configs={configs} />

      {/* One surface at a time, chosen here. */}
      <nav className="flex shrink-0 border-b-[3px] border-ink bg-cream-2">
        {TABS.map((t, i) => {
          const on = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={on}
              className={[
                'min-w-0 flex-1 px-1 py-1.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors',
                i < TABS.length - 1 ? 'border-r-2 border-rule' : '',
                on
                  ? 'bg-brand text-ink'
                  : 'text-ink-3 hover:bg-brand-pale hover:text-ink'
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* The active surface. Only this scrolls. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'messages' && (
          <MessagesPanel
            theme={theme}
            agents={agents}
            configs={configs}
            statuses={statuses}
            onSubmit={submit}
          />
        )}

        {tab === 'files' &&
          (openFile ? (
            <FileView path={openFile} onClose={() => setOpenFile(null)} />
          ) : (
            <FilesPanel query={query} onOpen={setOpenFile} />
          ))}

        {tab === 'git' && <GitPanel query={query} />}

        {tab === 'tasks' && (
          <div className="flex h-full min-h-0 flex-col">
            <TasksPanel
              onFocus={({ terminalSessionId, agentId }) => {
                requestSession(terminalSessionId)
                selectAgent(agentId)
                setTab('terminal')
              }}
            />
          </div>
        )}

        {tab === 'commands' && (
          <div className="flex h-full min-h-0 flex-col">
            <CommandsPanel
              query={query}
              onRun={(command) => {
                // Hand it to the terminal rather than running it blind, so the
                // user sees the real process and can interrupt it.
                queueCommand(command)
                setTab('terminal')
              }}
            />
          </div>
        )}

        {/*
          The terminal keeps its DOM once opened. Unmounting it would dispose
          the xterm instance and lose the scrollback of a session that is still
          running, which is exactly the session the user came back for.
        */}
        <div className={tab === 'terminal' ? 'h-full' : 'hidden'}>
          {terminalOpened && <TerminalPanel />}
        </div>
      </div>

      {/* Always here, always for whatever is on screen. */}
      <div className="shrink-0 border-t-[3px] border-ink bg-cream p-2.5">
        {tab === 'messages' && live && (!connected || !workspace?.root) && (
          <div className="mb-2 border-2 border-ink bg-brand-pale px-2.5 py-1.5">
            <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
              {!connected ? 'No provider connected' : 'No project open'}
            </p>
            <p className="mt-0.5 font-ui text-[11px] leading-snug text-ink-3">
              {!connected
                ? 'Connect a provider in Account to start working.'
                : 'Agents can inspect your code once you open a project folder.'}
            </p>
            <button
              type="button"
              onClick={() => setPage('account')}
              className="mt-1.5 border-2 border-ink bg-brand px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-y-px"
            >
              {!connected ? 'Open Account' : 'Open a folder'}
            </button>
          </div>
        )}

        {footer.mode === 'send' ? (
          <PromptBox
            onSubmit={footer.onSend ?? (() => {})}
            disabled={footer.disabled}
            placeholder={footer.placeholder}
            rows={tab === 'messages' ? 2 : 1}
          />
        ) : (
          <label className="flex items-center gap-2 border-[3px] border-ink bg-paper px-2 py-1.5 focus-within:border-brand-deep">
            <span aria-hidden className="font-pixel text-[11px] text-ink-3">
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={footer.placeholder}
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-ink-3"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear"
                className="shrink-0 font-mono text-[11px] text-ink-3 hover:text-ink"
              >
                ✕
              </button>
            )}
          </label>
        )}
      </div>
    </section>
  )
}
