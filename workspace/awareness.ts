import { execFile } from 'node:child_process'
import type { AwarenessSnapshot } from '../src/shared/agents'
import { getWorkspace, getWorkspaceRoot } from './WorkspaceManager'
import { agentRegistry } from '../agents/AgentRegistry'
import { getAgent, listAgents } from '../agents/agentStore'
import { activeTasks, listTasks } from '../agents/taskStore'
import { listCollaboration } from '../agents/collaborationStore'
import { systemBus } from '../agents/EventBus'
import { getSettings } from '../agents/settingsStore'

/**
 * Shared world awareness.
 *
 * Agents need to know what the team is doing — that Jane is on authentication
 * and Michael is reviewing the API — but that has to come from structured
 * state, never from handing one agent another's private conversation. Those
 * are different things: a shared workspace and a private memory.
 *
 * Everything here is bounded on purpose. The failure mode of a context layer
 * is not missing information, it is dumping the entire workspace into every
 * prompt and paying for it on every turn.
 */

/* ------------------------------------------------------------------ git -- */

interface GitState {
  branch: string | null
  dirty: number
  at: number
}

let gitCache: GitState = { branch: null, dirty: 0, at: 0 }
const GIT_TTL_MS = 4_000

function run(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, timeout: 4_000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err ? '' : stdout)
    )
  })
}

/**
 * Refresh the cached git state.
 *
 * Cached because this is read on every prompt build and every awareness
 * request, and shelling out to git on each of those would cost more than the
 * information is worth.
 */
export async function refreshGit(): Promise<GitState> {
  const root = getWorkspaceRoot()
  if (!root) {
    gitCache = { branch: null, dirty: 0, at: Date.now() }
    return gitCache
  }
  if (Date.now() - gitCache.at < GIT_TTL_MS) return gitCache

  const [branch, status] = await Promise.all([
    run(['branch', '--show-current'], root),
    run(['status', '--porcelain'], root)
  ])

  gitCache = {
    branch: branch.trim() || null,
    dirty: status.split('\n').filter((l) => l.trim() !== '').length,
    at: Date.now()
  }
  return gitCache
}

export function gitState(): GitState {
  return gitCache
}

/* ------------------------------------------------------------- snapshot -- */

/** The whole picture, for the awareness panel and for IPC. */
export function awarenessSnapshot(): AwarenessSnapshot {
  const workspace = getWorkspace()
  return {
    workspace: {
      root: workspace.root,
      name: workspace.name,
      exists: workspace.exists
    },
    git: { branch: gitCache.branch, dirty: gitCache.dirty },
    agents: agentRegistry.list(),
    tasks: listTasks(30),
    recentEvents: systemBus.recent(40),
    recentMessages: listCollaboration(30),
    settings: getSettings()
  }
}

/* ---------------------------------------------------------- for a prompt -- */

/**
 * The awareness block for one agent's system prompt.
 *
 * Written from that agent's point of view and deliberately short. It answers
 * three questions and no others: where am I, who else is here and what are
 * they doing, and has anyone sent me anything.
 */
export function awarenessFor(agentId: string): string {
  const lines: string[] = []
  const me = getAgent(agentId)

  if (gitCache.branch) {
    const dirty =
      gitCache.dirty === 0
        ? 'working tree clean'
        : `${gitCache.dirty} uncommitted change${gitCache.dirty === 1 ? '' : 's'}`
    lines.push(`Git: on branch ${gitCache.branch}, ${dirty}.`)
  }

  /*
   * Only agents that are actually in the world. A configured but unspawned
   * agent is not a colleague the model can rely on, and listing one would
   * invite it to delegate into a void.
   */
  const others = listAgents().filter((a) => a.id !== agentId && a.spawned && a.enabled)
  if (others.length > 0) {
    lines.push('Your team right now:')
    for (const other of others) {
      const state = agentRegistry.get(other.id)
      const doing = state.action ? ` — ${state.action}` : ''
      const may = me?.canTalkTo.includes(other.id) ? '' : ' (you may not contact them)'
      lines.push(`  ${other.id} (${other.name}, ${other.role}): ${state.status}${doing}${may}`)
    }
  }

  const running = activeTasks().filter((t) => t.agentId !== agentId)
  if (running.length > 0) {
    lines.push('Work in progress elsewhere:')
    for (const task of running.slice(0, 5)) {
      const owner = getAgent(task.agentId)
      lines.push(`  ${owner?.name ?? task.agentId}: ${task.title}`)
    }
  }

  /*
   * Messages addressed to this agent. The sender's own conversation is never
   * included — only what they chose to send here.
   */
  const inbox = listCollaboration(8, agentId).filter((m) => m.receiverAgentId === agentId)
  if (inbox.length > 0) {
    lines.push('Recent messages to you:')
    for (const m of inbox.slice(-4)) {
      lines.push(`  ${m.senderName}: ${m.message.slice(0, 200)}`)
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No other agents are active right now.'
}
