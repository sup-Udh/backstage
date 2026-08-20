import { useEffect, useRef, useState } from 'react'
import type { CharacterDef } from '../../characters/character.types'
import { castNameForSlot } from '../../project/cast'
import type { AgentConfig } from '../../shared/providerApi'
import {
  ALL_AGENTS,
  localId,
  useBackstage,
  type TabId
} from '../../stores/backstageStore'
import { recipientsFor, spawnedAgents, useTeam } from '../../stores/teamStore'
import { PromptBox } from './PromptBox'
import { TeamHeader } from './TeamHeader'
import { ChatIdentity } from './ChatIdentity'
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
import { findWorker, type Worker } from '../../agents/workers'

interface Props {
  /** The project's cast, which is the only set anyone here can be named from. */
  cast: CharacterDef[]
  /** Everything that can do work, projected once for the whole workspace. */
  workers: Worker[]
  onSpawn: () => void
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
 * Switching agents is the operation this panel exists to make cheap. It moves
 * `chatTarget`, reloads that agent's own transcript, and does nothing else â€”
 * no runtime is touched, no execution is paused, nobody else's state changes.
 * That is what lets the user hand Michael a task while Jane is mid-investigation
 * and have both keep going.
 */
export function CommandCenter({ cast, workers, onSpawn }: Props) {
  const target = useBackstage((s) => s.chatTarget)
  const threadTarget = useBackstage((s) => s.threadTarget)
  const thread = useBackstage((s) => s.thread)
  const refreshThread = useBackstage((s) => s.refreshThread)
  const pushMessage = useBackstage((s) => s.pushMessage)
  const pushToMany = useBackstage((s) => s.pushToMany)
  const agentStates = useBackstage((s) => s.agentStates)
  const providers = useBackstage((s) => s.providers)
  const setPage = useBackstage((s) => s.setPage)

  const tab = useBackstage((s) => s.tab)
  const setTab = useBackstage((s) => s.setTab)
  const openFile = useBackstage((s) => s.openFile)
  const setOpenFile = useBackstage((s) => s.setOpenFile)
  const queueCommand = useBackstage((s) => s.queueCommand)
  const requestSession = useBackstage((s) => s.requestSession)
  const selectAgent = useBackstage((s) => s.selectAgent)
  const setThreadTarget = useBackstage((s) => s.setThreadTarget)
  const activeTerminalId = useBackstage((s) => s.activeTerminalId)
  const terminalSessions = useBackstage((s) => s.terminalSessions)
  const agentSessions = useBackstage((s) => s.agentSessions)
  const terminalOpened = useBackstage((s) => s.terminalEverOpened)
  const markTerminalOpened = useBackstage((s) => s.markTerminalOpened)
  const loadConversation = useBackstage((s) => s.loadConversation)

  const agents = useTeam((s) => s.agents)
  const cancel = useTeam((s) => s.cancel)
  const refreshTasks = useTeam((s) => s.refreshTasks)

  const { workspace, anyConnected } = useProviders()

  /** The footer's query, for the surfaces that filter rather than send. */
  const [query, setQuery] = useState('')

  const present = spawnedAgents(agents)
  const recipients = recipientsFor(agents, target)
  const isBroadcast = target === ALL_AGENTS

  /*
   * Which of the three conversations is on screen.
   *
   * A group thread, a CLI session, or an agent's own transcript. They are
   * genuinely different destinations â€” one posts to a shared thread, one
   * writes to a PTY, one queues a task â€” so the send path is chosen here
   * rather than every surface below working it out again.
   */
  const activeWorker = findWorker(workers, target)
  const isSession = activeWorker?.kind === 'cli'
  const inThread = threadTarget !== null && thread !== null

  /* Once opened the terminal stays mounted, or its scrollback dies with it. */
  useEffect(() => {
    if (tab === 'terminal') markTerminalOpened()
  }, [tab, markTerminalOpened])

  /*
   * Load whichever conversations are on screen. Switching to an agent brings
   * back exactly where that conversation was â€” including work they finished
   * while the user was talking to somebody else.
   */
  useEffect(() => {
    const workspaceId = workspace?.root ?? 'no-workspace'
    for (const agent of recipients) {
      void loadConversation(workspaceId, agent.id)
    }
    // Recipient ids rather than the objects: a re-render must not refetch.
  }, [workspace?.root, recipients.map((a) => a.id).join(','), loadConversation])

  /* The tasks surface wants a fresh ledger whenever it comes forward. */
  useEffect(() => {
    if (tab === 'tasks' || tab === 'messages') void refreshTasks()
  }, [tab, refreshTasks])

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
   * And the other direction: choosing a session anywhere â€” in the world, in
   * the selector â€” brings its terminal forward too.
   *
   * The user should never have to work out which Claude they are talking to.
   * Selection is one fact, and the world, the chat header and the terminal
   * are three views of it; any of them showing a different session than the
   * others is the failure this is here to prevent.
   */
  useEffect(() => {
    if (activeWorker?.kind !== 'cli' || !activeWorker.terminalSessionId) return
    if (activeWorker.terminalSessionId === activeTerminalId) return
    lastHighlighted.current = activeWorker.id
    requestSession(activeWorker.terminalSessionId)
  }, [activeWorker, activeTerminalId, requestSession])

  const providerName = (agent: AgentConfig) =>
    providers.find((p) => p.id === agent.providerId)?.name ?? agent.providerId

  const modelName = (agent: AgentConfig) =>
    agent.modelId ??
    providers.find((p) => p.id === agent.providerId)?.selectedModel ??
    'no model'

  const characterName = (agent: AgentConfig) =>
    castNameForSlot(cast, agent.characterSlot)

  const targetName = inThread
    ? thread!.names.join(' â†” ')
    : isBroadcast
      ? `all agents (${workers.length})`
      : (activeWorker?.name ??
        (recipients[0] ? characterName(recipients[0]) : 'nobody'))

  /**
   * Send.
   *
   * The prompt is echoed into every recipient's transcript immediately so the
   * interface never appears to swallow a message, then handed to the main
   * process. Nothing is awaited: the task runs there and reports back as
   * events, which is what lets the world animate while it works.
   */
  const submit = (text: string) => {
    /*
     * A group thread is a different conversation, not a different way of
     * addressing the same one. Posting here goes to every member as a real
     * task and lands in the shared transcript â€” it never touches any
     * member's private session with the user.
     */
    if (inThread && thread) {
      const groupTarget = threadTarget!
      const worker = findWorker(workers, groupTarget)

      /*
       * A group of CLI sessions is not a stored conversation â€” it is two real
       * processes â€” so the message goes to each of their stdin rather than
       * into a transcript the app owns.
       */
      const posting =
        worker?.kind === 'cli' && worker.sessionId
          ? window.backstage.sessions.postGroup(worker.sessionId, text)
          : window.backstage.threads.post(groupTarget, text)

      void posting.then((result) => {
        void refreshThread()
        if (!result.accepted && result.error) {
          pushMessage(groupTarget, {
            id: localId('sys'),
            kind: 'system',
            agentId: groupTarget,
            text: result.error,
            at: Date.now()
          })
        }
      })
      return
    }

    /*
     * A CLI session is a real process. The message goes to the same stdin the
     * keyboard writes to, never through Backstage's own runtime: if the user
     * started Claude Code, they are talking to Claude Code.
     */
    if (isSession && activeWorker?.sessionId) {
      void window.backstage.sessions.send(activeWorker.sessionId, text)
      return
    }

    if (recipients.length === 0) {
      const anyone = present[0]?.id ?? target
      pushMessage(anyone, {
        id: localId('sys'),
        kind: 'system',
        agentId: anyone,
        text: 'No agents are spawned. Spawn one on the Agents page first.',
        at: Date.now()
      })
      return
    }

    if (!anyConnected) {
      // Never make a network call we already know will fail.
      pushToMany(
        recipients.map((a) => a.id),
        (agentId) => ({
          id: localId('sys'),
          kind: 'system',
          agentId,
          text: 'No AI provider is connected. Connect one in Connections to start working.',
          at: Date.now()
        })
      )
      return
    }

    const at = Date.now()
    pushToMany(
      recipients.map((a) => a.id),
      (agentId) => ({ id: localId('user'), kind: 'user', agentId, text, at })
    )

    const runTarget = isBroadcast ? recipients.map(w => w.id) : target
    void window.backstage.agents.run({ prompt: text, target: runTarget }).then((ack) => {
      if (!ack.accepted) {
        pushToMany(
          recipients.map((a) => a.id),
          (agentId) => ({
            id: localId('sys'),
            kind: 'system',
            agentId,
            text: ack.error ?? 'Could not start that task.',
            at: Date.now()
          })
        )
        return
      }
      // Some of a broadcast can be refused while the rest runs; say which.
      for (const refusal of ack.rejected ?? []) {
        pushMessage(refusal.agentId, {
          id: localId('sys'),
          kind: 'system',
          agentId: refusal.agentId,
          text: refusal.error,
          at: Date.now()
        })
      }
    })
  }

  /*
   * Session input goes to the PTY the session surface is showing â€” the same
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
      placeholder: inThread
        ? `Message ${targetName}â€¦`
        : isSession
          ? `Message ${targetName}â€¦`
          : `Ask ${targetName}â€¦`,
      // A session or a thread has its own recipients; only the agent path
      // depends on somebody being spawned.
      disabled: inThread
        ? false
        : isSession
          ? activeWorker?.status === 'offline'
          : recipients.length === 0,
      onSend: submit
    },
    terminal: {
      mode: 'send' as const,
      placeholder: session
        ? `Message ${sessionLabel}â€¦`
        : 'Open a session to send inputâ€¦',
      disabled: !session || session.status === 'exited',
      onSend: sendToSession
    },
    tasks: {
      mode: 'send' as const,
      placeholder: `Create a task for ${targetName}â€¦`,
      disabled: recipients.length === 0,
      onSend: submit
    },
    files: { mode: 'filter' as const, placeholder: 'Search filesâ€¦' },
    git: { mode: 'filter' as const, placeholder: 'Filter changesâ€¦' },
    commands: { mode: 'filter' as const, placeholder: 'Search commandsâ€¦' }
  }[tab]

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col border-l-[3px] border-ink bg-cream">
      <TeamHeader workers={workers} onSpawn={onSpawn} />

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

      {/* Who is listening. Always visible on the conversation surface. */}
      {tab === 'messages' && (
        <ChatIdentity
          cast={cast}
          workers={workers}
          recipients={recipients}
          isBroadcast={isBroadcast}
          states={agentStates}
          thread={inThread ? thread : null}
          providerName={providerName}
          modelName={modelName}
          onStop={(agentId) => {
            if (agentId === 'all') {
              void window.backstage.agents.stopAll()
              return
            }
            const worker = findWorker(workers, agentId)
            if (worker?.kind === 'cli' && worker.sessionId) {
              void window.backstage.sessions.interrupt(worker.sessionId)
            } else {
              void cancel(agentId)
            }
          }}
          onLeaveThread={() => void setThreadTarget(null)}
        />
      )}

      {/* The active surface. Only this scrolls. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'messages' && (
          <MessagesPanel cast={cast} workers={workers} onSubmit={submit} />
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
              cast={cast}
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
        {tab === 'messages' && (!anyConnected || !workspace?.root) && (
          <div className="mb-2 border-2 border-ink bg-brand-pale px-2.5 py-1.5">
            <p className="font-pixel text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
              {!anyConnected ? 'No provider connected' : 'No project open'}
            </p>
            <p className="mt-0.5 font-ui text-[11px] leading-snug text-ink-3">
              {!anyConnected
                ? 'Connect a provider in Connections to start working.'
                : 'Agents can inspect your code once you open a project folder.'}
            </p>
            <button
              type="button"
              onClick={() => setPage('account')}
              className="mt-1.5 border-2 border-ink bg-brand px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform duration-75 hover:-translate-y-px"
            >
              {!anyConnected ? 'Open Connections' : 'Open a folder'}
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
              âŒ•
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
                âœ•
              </button>
            )}
          </label>
        )}
      </div>
    </section>
  )
}
