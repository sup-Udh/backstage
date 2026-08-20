import { useEffect, useRef } from 'react'
import { teamRuntime } from '../agents/team'
import { useBackstage, localId } from '../stores/backstageStore'
import type { AgentSession } from '../shared/providerApi'
import { lifecycleForSession, sessionSlots, workerIdFor } from '../agents/workers'
import { useTeam } from '../stores/teamStore'
import { useProject } from '../stores/projectStore'
import { projectCast } from '../project/cast'
import { getTheme } from '../themes'

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

export function useWorkspaceEvents(): void {
  const ingestEvent = useBackstage((s) => s.ingestEvent)
  const setAgentSessions = useBackstage((s) => s.setAgentSessions)
  const setTerminalSessions = useBackstage((s) => s.setTerminalSessions)
  const setSessionLines = useBackstage((s) => s.setSessionLines)
  const pushSessionLine = useBackstage((s) => s.pushSessionLine)
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
      /*
       * The same casting decision the selector makes, from the same function.
       * Working it out separately here is exactly how the world and the
       * dropdown end up showing a session as two different characters.
       */
      const project = useProject.getState().project
      const cast = projectCast(
        getTheme(project?.themeId),
        project?.characterRoster ?? []
      )
      const slots = sessionSlots(
        useTeam.getState().agents,
        sessions,
        cast.length
      )

      for (const session of sessions) {
        const agentId = workerIdFor(session)
        const slot = slots.get(session.id) ?? 0

        if (!known.current.has(session.id)) {
          known.current.set(session.id, session.status)
          teamRuntime.registerExternal({
            id: agentId,
            name: session.name,
            role: 'CLI session',
            model: `${session.provider ?? 'cli'} cli`,
            slot
          })
          ingestEvent({
            id: localId('cli'),
            type: 'agent.activated',
            at: Date.now(),
            agentId,
            agentName: session.name,
            activity: `started in ${session.cwd.split(/[\\/]/).pop()}.`
          })
        }

        /*
         * The name and the character can change while a session runs — the
         * user renames it, or recasts it — and neither is a status change, so
         * both are applied on every update rather than only on arrival.
         */
        teamRuntime.updateExternal(agentId, { name: session.name, slot })

        const previous = known.current.get(session.id)
        if (previous === session.status) continue
        known.current.set(session.id, session.status)

        /*
         * The mapping is shared with the selector rather than written again
         * here, so the world and the dropdown cannot describe the same
         * session differently. It is deliberately literal: a session is
         * working, or at its prompt, or over, and nothing infers a state that
         * could leave a character animating for a process that has exited.
         */
        teamRuntime.setExternalStatus(
          agentId,
          lifecycleForSession(session.status),
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
            agentName: session.name,
            activity:
              session.status === 'error'
                ? 'session ended with an error.'
                : 'session ended.'
          })
          // A finished session leaves the office; its log stays in Tasks.
          teamRuntime.removeExternal(agentId)
        }
      }
    })
  }, [ingestEvent])

  /*
   * The readable transcript of every CLI session.
   *
   * Subscribed here rather than in the chat panel so a session the user is
   * not currently looking at still accumulates its output — switching to
   * Claude 2 and back has to show what Claude 1 did in the meantime, and a
   * subscription that unmounts with a tab would have missed it.
   */
  useEffect(() => {
    if (!window.backstage?.sessions) return
    return window.backstage.sessions.onLine(pushSessionLine)
  }, [pushSessionLine])

  /* Replay what a session printed before this window was listening. */
  const agentSessions = useBackstage((s) => s.agentSessions)
  const replayed = useRef(new Set<string>())
  useEffect(() => {
    if (!window.backstage?.sessions) return
    for (const session of agentSessions) {
      if (replayed.current.has(session.id)) continue
      replayed.current.add(session.id)
      void window.backstage.sessions
        .lines(session.id)
        .then((lines) => setSessionLines(session.id, lines))
    }
  }, [agentSessions, setSessionLines])

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
