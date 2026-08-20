import type {
  AgentConfig,
  AgentLifecycle,
  AgentRuntimeState,
  AgentSession,
  AgentSessionStatus,
  ProviderStatus
} from '../shared/providerApi'
import type { Theme } from '../themes/types'
import { BUSY_STATUSES } from '../shared/agents'

/**
 * One projection of everything that can do work.
 *
 * Backstage has two kinds of worker and no reason to treat them differently
 * above the runtime: an API agent the app drives through a provider, and an
 * external CLI session the user started in a terminal. Both occupy a desk,
 * both have a status, both can be talked to and stopped. The selector, the
 * world, the chat header and the inspector were all deriving that overlap
 * separately and disagreeing about it — one listed CLI sessions, another did
 * not; one called a session "Claude", another "cli-terminal-01".
 *
 * So the projection happens once, here. Every surface reads `Worker`, and a
 * third kind of worker becomes one function rather than five components.
 *
 * This is a *view*, not state. Nothing is stored: it is recomputed from the
 * roster, the runtime states and the live session list, all of which are
 * mirrored from the main process. There is no possibility of it drifting out
 * of step with them, because there is nothing to drift.
 */

export type WorkerKind = 'agent' | 'cli'

/**
 * How many teammates one agent may be connected to.
 *
 * Mirrors the main process's own limit, which is the one that is actually
 * enforced. Restated here so a button can grey out and say why before the
 * user clicks it, rather than the request failing after the fact — but the
 * check that matters is the one behind the IPC boundary.
 */
export const MAX_CONNECTIONS = 2

export interface Worker {
  /** Agent id, or `cli-<terminalSessionId>` for a session. */
  id: string
  kind: WorkerKind
  /** What to call it: the character's name, or the session's. */
  name: string
  role: string
  /** "OpenAI", "Gemini", "Claude Code" — what is actually behind it. */
  provider: string
  model: string
  status: AgentLifecycle
  /** Present-tense description of the current step, when there is one. */
  action: string | null
  task: string | null
  busy: boolean
  /** Whether stopping it would do anything right now. */
  canStop: boolean
  characterSlot: number
  /** Agents this one is connected to. Always agent ids. */
  connections: string[]
  /** CLI only: the session and the PTY behind it. */
  sessionId?: string
  terminalSessionId?: string
}

/**
 * How a CLI session's status reads as an agent lifecycle.
 *
 * `waiting` becomes `idle` rather than the lifecycle's own `waiting`, which
 * means "blocked on another agent or on approval". A CLI sitting at its
 * prompt is not blocked on anything — it is done and available, which is
 * exactly what idle means. Exported so the world and the selector cannot
 * describe the same session differently.
 */
export function lifecycleForSession(status: AgentSessionStatus): AgentLifecycle {
  switch (status) {
    case 'working':
      return 'working'
    case 'starting':
      return 'thinking'
    case 'error':
      return 'error'
    case 'exited':
      return 'offline'
    case 'waiting':
    default:
      return 'idle'
  }
}

/** How a CLI names its product, for the provider badge. */
const CLI_PROVIDER: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI'
}

/** The id a CLI session takes as a worker, and as a character in the world. */
export function workerIdFor(session: AgentSession): string {
  return `cli-${session.terminalSessionId}`
}

/**
 * Which character each CLI session wears.
 *
 * Decided here because it needs the theme: slots wrap around the active cast,
 * so "a free character" is only answerable once you know how many there are
 * and who is already at a desk. The main process, which creates sessions, has
 * neither fact — it used to offset them past the configured team and hope,
 * which put the first Claude session on slot 8 of an eight-character cast,
 * wrapping it straight back onto the first agent's face.
 *
 * A slot the user picked deliberately is never reassigned. If every character
 * is taken the cast wraps, because refusing to show a running session is
 * worse than showing two people who look alike.
 */
export function sessionSlots(
  agents: AgentConfig[],
  sessions: AgentSession[],
  castSize: number
): Map<string, number> {
  const wrap = (n: number) => ((n % castSize) + castSize) % castSize

  const taken = new Set<number>()
  for (const agent of agents) {
    if (agent.enabled && agent.spawned) taken.add(wrap(agent.characterSlot))
  }

  const out = new Map<string, number>()
  // Deliberate choices first, so they claim their character before the
  // automatic ones start looking for a free one.
  for (const session of sessions) {
    if (session.status === 'exited' || !session.characterChosen) continue
    const slot = wrap(session.characterSlot)
    out.set(session.id, slot)
    taken.add(slot)
  }

  let next = 0
  for (const session of sessions) {
    if (session.status === 'exited' || out.has(session.id)) continue
    let slot = -1
    for (let i = 0; i < castSize; i++) {
      const candidate = wrap(next + i)
      if (taken.has(candidate)) continue
      slot = candidate
      next = candidate + 1
      break
    }
    if (slot === -1) {
      // Everybody is in use; wrap rather than leave the session bodiless.
      slot = wrap(next++)
    }
    out.set(session.id, slot)
    taken.add(slot)
  }

  return out
}

export function isCliWorker(id: string): boolean {
  return id.startsWith('cli-')
}

export interface WorkerInputs {
  agents: AgentConfig[]
  states: Record<string, AgentRuntimeState>
  sessions: AgentSession[]
  providers: ProviderStatus[]
  theme: Theme
}

/**
 * Build the worker list.
 *
 * Configured agents first, then live CLI sessions, each in the order they
 * arrived. Stable ordering matters more than it looks: this list drives a
 * dropdown, and a list that reshuffles when a status changes is one where the
 * user clicks the wrong agent.
 */
export function buildWorkers({
  agents,
  states,
  sessions,
  providers,
  theme
}: WorkerInputs): Worker[] {
  const cast = theme.characters
  const characterName = (slot: number) =>
    cast[((slot % cast.length) + cast.length) % cast.length].name

  const workers: Worker[] = []
  const slots = sessionSlots(agents, sessions, cast.length)

  for (const agent of agents) {
    if (!agent.enabled || !agent.spawned) continue
    const state = states[agent.id]
    const provider = providers.find((p) => p.id === agent.providerId)
    const status = state?.status ?? 'offline'

    workers.push({
      id: agent.id,
      kind: 'agent',
      /*
       * The character's name, not the configured one. Switching theme
       * re-casts the team rather than replacing it, so the office and the
       * selector have to agree on who the user is looking at.
       */
      name: characterName(agent.characterSlot),
      role: agent.role,
      provider: provider?.name ?? agent.providerId,
      model: agent.modelId ?? provider?.selectedModel ?? 'no model',
      status,
      action: state?.action ?? null,
      task: state?.task ?? null,
      busy: BUSY_STATUSES.includes(status),
      // Only an execution can be cancelled; queued work counts, because
      // cancelling clears the queue too.
      canStop: state?.executionId !== null || (state?.queued ?? 0) > 0,
      characterSlot: agent.characterSlot,
      connections: agent.canTalkTo
    })
  }

  for (const session of sessions) {
    // A finished session is history, not a worker. It stays in the tasks log.
    if (session.status === 'exited') continue
    const status = lifecycleForSession(session.status)

    workers.push({
      id: workerIdFor(session),
      kind: 'cli',
      /*
       * Sessions keep their own name in every world. Claude is Claude whether
       * the office is a detective bureau or a lab, and renaming one to "Auth
       * review" has to survive a theme change.
       */
      name: session.name,
      role: CLI_PROVIDER[session.provider ?? ''] ?? 'CLI session',
      provider: CLI_PROVIDER[session.provider ?? ''] ?? 'CLI',
      model: `${session.provider ?? 'cli'} cli`,
      status,
      action: session.status === 'working' ? (session.lastOutput ?? null) : null,
      task: session.status === 'working' ? (session.lastOutput ?? null) : null,
      busy: session.status === 'working' || session.status === 'starting',
      // Interrupting a session at its prompt does nothing worth offering.
      canStop: session.status === 'working' || session.status === 'starting',
      characterSlot: slots.get(session.id) ?? 0,
      /*
       * Session links are held as session ids in the main process, but every
       * surface above this line addresses workers. Translated once here so a
       * connection between two Claude sessions and one between two agents are
       * the same shape to everything that draws or edits them.
       */
      connections: session.connections
        .map((id) => sessions.find((s) => s.id === id))
        .filter((s): s is AgentSession => s !== undefined)
        .map(workerIdFor),
      sessionId: session.id,
      terminalSessionId: session.terminalSessionId
    })
  }

  return workers
}

export function findWorker(workers: Worker[], id: string | null): Worker | null {
  if (!id) return null
  return workers.find((w) => w.id === id) ?? null
}

/**
 * The two headings the selector groups under.
 *
 * Only ever returns a group that has members, so a user who has never opened
 * a terminal does not see an empty CLAUDE CODE heading explaining a feature
 * to them in a dropdown.
 */
export function groupWorkers(
  workers: Worker[]
): { label: string; workers: Worker[] }[] {
  const groups = [
    { label: 'Backstage agents', workers: workers.filter((w) => w.kind === 'agent') },
    { label: 'CLI sessions', workers: workers.filter((w) => w.kind === 'cli') }
  ]
  return groups.filter((g) => g.workers.length > 0)
}
