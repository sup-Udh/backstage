import { useEffect, useRef } from 'react'
import { teamRuntime } from '../agents/team'
import { useBackstage, localId } from '../stores/backstageStore'
import type { AgentSession } from '../shared/providerApi'
import type { AgentStatus } from '../agents/agent.types'

/**
 * Real workspace events into the world and the session surfaces.
 *
 * This is the piece that makes an external CLI agent a first-class inhabitant.
 * When `claude` runs in a Backstage terminal, the process is real, the PTY is
 * real, and the file edits it makes are seen by the watcher — so the character
 * that appears is reporting work that is genuinely happening, not miming it.
 *
 * Character state follows the process, never the other way round: a session
 * that has exited can never leave a character showing WORKING.
 *
 * Every subscription lives here rather than inside a panel, so the session
 * lists survive the command centre switching tabs — a terminal that is not on
 * screen is still a running process, and the world must keep saying so.
 */

/** Where CLI sessions are cast from, past the configured team's slots. */
const CLI_SLOT_BASE = 4

export function useWorkspaceEvents(): void {
  const ingestEvent = useBackstage((s) => s.ingestEvent)
  const setAgentSessions = useBackstage((s) => s.setAgentSessions)
  const setTerminalSessions = useBackstage((s) => s.setTerminalSessions)
  const known = useRef(new Map<string, string>())

  /* Mirror live PTY sessions, so every surface sees the same session list. */
  useEffect(() => {
    if (!window.backstage?.terminal) return
    void window.backstage.terminal.list().then(setTerminalSessions)
    return window.backstage.terminal.onSessions(setTerminalSessions)
  }, [setTerminalSessions])

  /* Mirror external CLI sessions for the tasks and session surfaces. */
  useEffect(() => {
    if (!window.backstage?.sessions) return
    void window.backstage.sessions.list().then(setAgentSessions)
    return window.backstage.sessions.onChanged(setAgentSessions)
  }, [setAgentSessions])

  /* External CLI sessions become characters in the world. */
  useEffect(() => {
    if (!window.backstage?.sessions) return

    return window.backstage.sessions.onChanged((sessions: AgentSession[]) => {
      for (const session of sessions) {
        const agentId = `cli-${session.terminalSessionId}`
        const name = (session.provider ?? 'cli').replace(/^./, (c) => c.toUpperCase())

        if (!known.current.has(session.id)) {
          known.current.set(session.id, session.status)
          teamRuntime.registerExternal({
            id: agentId,
            name,
            role: 'CLI session',
            model: `${session.provider ?? 'cli'} cli`,
            slot: CLI_SLOT_BASE + known.current.size
          })
          ingestEvent({
            id: localId('cli'),
            type: 'agent.activated',
            at: Date.now(),
            agentId,
            agentName: name,
            activity: `started a ${name} session in ${session.cwd.split(/[\\/]/).pop()}.`
          })
        }

        const previous = known.current.get(session.id)
        if (previous === session.status) continue
        known.current.set(session.id, session.status)

        /*
         * The mapping is deliberately literal. A CLI session is working, or
         * waiting for input, or over — there is no inference here that could
         * leave a character animating for a process that has exited.
         */
        const status: AgentStatus =
          session.status === 'working'
            ? 'working'
            : session.status === 'waiting'
              ? 'waiting'
              : session.status === 'error'
                ? 'error'
                : session.status === 'starting'
                  ? 'thinking'
                  : 'idle'

        teamRuntime.setExternalStatus(
          agentId,
          status,
          session.status === 'waiting'
            ? 'Waiting for you'
            : session.status === 'working'
              ? (session.lastOutput ?? 'Working')
              : session.status === 'exited'
                ? null
                : 'Session ended'
        )

        if (session.status === 'exited' || session.status === 'error') {
          ingestEvent({
            id: localId('cli'),
            type: 'agent.completed',
            at: Date.now(),
            agentId,
            agentName: name,
            activity:
              session.status === 'error'
                ? 'session ended with an error.'
                : 'session ended.'
          })
        }
      }
    })
  }, [ingestEvent])

  /*
   * File changes made outside the app — including by an external CLI. These
   * are workspace events with no agent behind them, so they land in the file
   * surfaces and the bus, never in somebody's conversation.
   */
  useEffect(() => {
    if (!window.backstage?.files) return

    return window.backstage.files.onChanges(({ changes, total }) => {
      const shown = changes.slice(0, 4)
      for (const change of shown) {
        ingestEvent({
          id: localId('file'),
          type: `file.${change.kind}` as const,
          at: change.at,
          activity: `${change.kind} ${change.path}`
        })
      }
      if (total > shown.length) {
        ingestEvent({
          id: localId('file'),
          type: 'file.modified',
          at: Date.now(),
          activity: `and ${total - shown.length} more files changed`
        })
      }
    })
  }, [ingestEvent])
}
