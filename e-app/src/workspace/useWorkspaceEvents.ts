import { useEffect, useRef } from 'react'
import { teamRuntime } from '../agents/team'
import { useBackstage } from '../stores/backstageStore'
import type { AgentSession, FileChange } from '../shared/providerApi'

/**
 * Real workspace events into the world, the store and the session surfaces.
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

let nextId = 5_000_000

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
      for (const s of sessions) {
        const agentId = `cli-${s.terminalSessionId}`
        const name = (s.provider ?? 'cli').replace(/^./, (c) => c.toUpperCase())

        if (!known.current.has(s.id)) {
          known.current.set(s.id, s.status)
          // Register and bring in a character for the real session.
          teamRuntime.register({
            id: agentId,
            name,
            role: 'CLI Session',
            model: `${s.provider} cli`,
            slot: 4 + known.current.size,
            useOwnName: true
          })
          teamRuntime.show(agentId)
          ingestEvent({
            id: nextId++,
            type: 'agent.activated',
            at: Date.now(),
            agentId,
            agentName: name,
            activity: `started a ${name} session in ${s.cwd.split(/[\\/]/).pop()}.`
          })
        }

        const previous = known.current.get(s.id)
        if (previous !== s.status) {
          known.current.set(s.id, s.status)

          teamRuntime.applyRuntimeEvent({
            type:
              s.status === 'exited' || s.status === 'error'
                ? 'agent.idle'
                : 'agent.working',
            agentId,
            action:
              s.status === 'waiting'
                ? 'Waiting for you'
                : s.status === 'working'
                  ? (s.lastOutput ?? 'Working')
                  : 'Session ended'
          })

          if (s.status === 'exited' || s.status === 'error') {
            ingestEvent({
              id: nextId++,
              type: 'agent.completed',
              at: Date.now(),
              agentId,
              agentName: name,
              activity:
                s.status === 'error' ? 'session ended with an error.' : 'session ended.'
            })
          }
        }
      }
    })
  }, [ingestEvent])

  /* File changes made outside the app — including by an external CLI. */
  useEffect(() => {
    if (!window.backstage?.files) return

    return window.backstage.files.onChanges(({ changes, total }) => {
      const shown: FileChange[] = changes.slice(0, 4)
      for (const c of shown) {
        ingestEvent({
          id: nextId++,
          type: `file.${c.kind}` as never,
          at: c.at,
          activity: `${c.kind} ${c.path}`
        })
      }
      if (total > shown.length) {
        ingestEvent({
          id: nextId++,
          type: 'file.modified',
          at: Date.now(),
          activity: `and ${total - shown.length} more files changed`
        })
      }
    })
  }, [ingestEvent])
}
