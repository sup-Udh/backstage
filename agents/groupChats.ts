import type { ChatMessage, GroupChatSummary, GroupStatus } from './agent.types'
import { getAgent, groupOf, listAgents, threadIdFor } from './agentStore'
import { agentRegistry } from './AgentRegistry'
import { conversationStore } from './conversationStore'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import { getActiveProjectId } from '../projects/projectStore'
import { readJson, writeJson } from './persist'

/**
 * Group conversations, as something the user can see from the front page.
 *
 * A group already existed: it is the set of agents reachable through
 * connections, `groupOf`, and it already had a shared transcript keyed by a
 * thread id derived from its members. What it did not have was any existence
 * outside the pixel world — the only way to find one was to click a character,
 * notice it had a connection, and open the conversation from there. Two agents
 * could be mid-collaboration and the user would have no way to know.
 *
 * So nothing here creates a group. A connection *is* a group chat, which is
 * why there is no "create group" anywhere in the product: this module only
 * stores the two things a derivation cannot know — the name the user gave it,
 * and how much of it they have read — and assembles the rest on demand from
 * the roster, the runtime states and the transcript.
 *
 * Everything is scoped to the open project, in both directions: a record is
 * stamped with the project it was made in, and a read only ever walks that
 * project's roster. Project A's groups cannot appear in Project B because
 * Project B's roster contains none of their members.
 */

const FILE = 'groupChats.json'

/** The part that has to be stored, because it cannot be worked out. */
interface StoredGroup {
  projectId: string
  threadId: string
  name: string
  customName: boolean
  /** Messages at or before this are read. */
  lastReadAt: number
  /** The automation that runs on this group, if one does. */
  automationId: string | null
  automationName: string | null
  createdAt: number
  updatedAt: number
}

type Stored = Record<string, StoredGroup>

let cache: Stored | null = null

function key(projectId: string, threadId: string): string {
  return `${projectId}::${threadId}`
}

function load(): Stored {
  if (cache) return cache
  const raw = readJson<Record<string, unknown>>(FILE, {})
  const out: Stored = {}
  for (const [k, value] of Object.entries(raw ?? {})) {
    if (!value || typeof value !== 'object') continue
    const g = value as Partial<StoredGroup>
    if (typeof g.projectId !== 'string' || typeof g.threadId !== 'string') continue
    out[k] = {
      projectId: g.projectId,
      threadId: g.threadId,
      name: typeof g.name === 'string' ? g.name : '',
      customName: g.customName === true,
      lastReadAt: Number.isFinite(g.lastReadAt) ? Number(g.lastReadAt) : 0,
      automationId: typeof g.automationId === 'string' ? g.automationId : null,
      automationName: typeof g.automationName === 'string' ? g.automationName : null,
      createdAt: Number.isFinite(g.createdAt) ? Number(g.createdAt) : Date.now(),
      updatedAt: Number.isFinite(g.updatedAt) ? Number(g.updatedAt) : Date.now()
    }
  }
  cache = out
  return cache
}

function persist(): void {
  writeJson(FILE, cache ?? {})
}

function record(projectId: string, threadId: string): StoredGroup {
  const store = load()
  const k = key(projectId, threadId)
  if (!store[k]) {
    store[k] = {
      projectId,
      threadId,
      name: '',
      customName: false,
      lastReadAt: 0,
      automationId: null,
      automationName: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    persist()
  }
  return store[k]
}

/* ------------------------------------------------------------- deriving -- */

function workspaceId(): string {
  return getWorkspaceRoot() ?? 'no-workspace'
}

/**
 * The default name for a group.
 *
 * `Walter × Jesse × Mike`, in the members' own order. Deliberately not derived
 * from whatever task happens to be running: a name that changes every time the
 * team is asked something is not a name, it is a status — and the card shows
 * the current task on its own line anyway. A group an automation owns is named
 * after the automation instead, because there the task really is the identity.
 */
export function defaultGroupName(names: string[]): string {
  return names.join(' × ')
}

/**
 * What the group is doing, from its members' live state.
 *
 * Derived on every read rather than stored, so it cannot claim a group is
 * working after a restart — runtime state is never persisted anywhere in this
 * application, and a group is not the place to start.
 */
function statusOf(memberIds: string[], hasMessages: boolean): {
  status: GroupStatus
  working: number
  thinking: number
  task: string | null
} {
  let working = 0
  let thinking = 0
  let waiting = 0
  let stopping = 0
  let errored = 0
  let task: string | null = null

  for (const id of memberIds) {
    const state = agentRegistry.get(id)
    if (state.task && !task) task = state.task
    switch (state.status) {
      case 'working':
        working++
        break
      case 'thinking':
      case 'queued':
        thinking++
        break
      case 'talking':
        working++
        break
      case 'waiting':
        waiting++
        break
      case 'stopping':
        stopping++
        break
      case 'error':
        errored++
        break
      default:
        break
    }
  }

  // Ordered by what the user most needs to see first. An error outranks
  // activity: a group with one agent broken and one still working is a group
  // that needs looking at, not one that is fine.
  let status: GroupStatus = 'active'
  if (errored > 0) status = 'error'
  else if (stopping > 0) status = 'stopped'
  else if (working > 0) status = 'working'
  else if (thinking > 0) status = 'thinking'
  else if (waiting > 0) status = 'waiting'
  else if (hasMessages) status = 'completed'

  return { status, working, thinking, task: status === 'active' ? null : task }
}

function lastLine(messages: ChatMessage[]): GroupChatSummary['lastMessage'] {
  const last = messages[messages.length - 1]
  if (!last) return null
  const fromName =
    last.fromName ??
    (last.kind === 'user' ? 'You' : (getAgent(last.agentId)?.name ?? 'Someone'))
  return { fromName, text: last.text, at: last.at }
}

function unreadIn(messages: ChatMessage[], lastReadAt: number): number {
  // The user's own messages are never unread — they wrote them.
  return messages.filter((m) => m.at > lastReadAt && m.kind !== 'user').length
}

/**
 * Every group conversation in the open project.
 *
 * Walks the roster and collects the distinct groups it belongs to, so a group
 * appears exactly once however many of its members are enumerated. A group of
 * one is not a group and is skipped — that is an agent with no connections,
 * and it already has a private conversation.
 */
export function listGroupChats(): GroupChatSummary[] {
  const projectId = getActiveProjectId()
  if (!projectId) return []

  const seen = new Set<string>()
  const out: GroupChatSummary[] = []
  const ws = workspaceId()

  for (const agent of listAgents()) {
    const members = groupOf(agent.id)
    if (members.length < 2) continue

    const threadId = threadIdFor(members)
    if (seen.has(threadId)) continue
    seen.add(threadId)

    const stored = record(projectId, threadId)
    const names = members.map((id) => getAgent(id)?.name ?? id)
    const messages = conversationStore.load(ws, threadId)
    const { status, working, thinking, task } = statusOf(members, messages.length > 0)

    out.push({
      id: threadId,
      projectId,
      memberIds: members,
      memberNames: names,
      name:
        (stored.customName && stored.name) ||
        stored.automationName ||
        defaultGroupName(names),
      customName: stored.customName,
      status,
      task,
      participants: members.length,
      working,
      thinking,
      lastMessage: lastLine(messages),
      unread: unreadIn(messages, stored.lastReadAt),
      automationId: stored.automationId,
      automationName: stored.automationName,
      createdAt: stored.createdAt,
      updatedAt: Math.max(stored.updatedAt, messages[messages.length - 1]?.at ?? 0)
    })
  }

  /*
   * Busy first, then unread, then most recently active. A user opening the app
   * to three groups should be looking at the one that is doing something.
   */
  const rank: Record<GroupStatus, number> = {
    working: 0,
    thinking: 1,
    waiting: 2,
    error: 3,
    stopped: 4,
    completed: 5,
    active: 6
  }
  return out.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      b.unread - a.unread ||
      b.updatedAt - a.updatedAt
  )
}

export function getGroupChat(threadId: string): GroupChatSummary | null {
  return listGroupChats().find((g) => g.id === threadId) ?? null
}

/* -------------------------------------------------------------- mutating -- */

/**
 * Whether this thread id names a real group in the open project.
 *
 * Every mutator checks it, because a thread id is derived from its members and
 * is therefore guessable by anyone who knows a pair of agent ids — and these
 * are all reachable over IPC with any string at all. The roster it checks
 * against is already scoped to the open project, which is scoped to the
 * signed-in account, so this inherits both filters rather than restating them.
 */
function isKnownGroup(threadId: string): boolean {
  if (!threadId) return false
  return listAgents().some((agent) => {
    const members = groupOf(agent.id)
    return members.length >= 2 && threadIdFor(members) === threadId
  })
}

export function renameGroupChat(threadId: string, name: string): GroupChatSummary | null {
  const projectId = getActiveProjectId()
  if (!projectId || !isKnownGroup(threadId)) return null

  const trimmed = name.trim().slice(0, 80)
  const stored = record(projectId, threadId)
  stored.name = trimmed
  // An empty name is how the user asks for the generated one back.
  stored.customName = trimmed.length > 0
  stored.updatedAt = Date.now()
  persist()
  return getGroupChat(threadId)
}

/** Everything up to now has been seen. Called when the conversation is opened. */
export function markGroupRead(threadId: string): void {
  const projectId = getActiveProjectId()
  if (!projectId || !isKnownGroup(threadId)) return
  const stored = record(projectId, threadId)
  stored.lastReadAt = Date.now()
  stored.updatedAt = Date.now()
  persist()
}

/**
 * Tie an automation to the group it runs on.
 *
 * Called by the automation runner, not by the user. It is what makes a
 * multi-agent automation show up on Home as a team conversation rather than as
 * three unrelated private sessions, and it is why the group takes the
 * automation's name: there, the task really is the group's identity.
 */
export function attachAutomation(
  threadId: string,
  automationId: string,
  automationName: string
): void {
  const projectId = getActiveProjectId()
  if (!projectId || !isKnownGroup(threadId)) return
  const stored = record(projectId, threadId)
  stored.automationId = automationId
  stored.automationName = automationName
  stored.updatedAt = Date.now()
  persist()
}

/** Forget an automation's claim on its groups, when the automation is deleted. */
export function detachAutomation(automationId: string): void {
  const store = load()
  let changed = false
  for (const group of Object.values(store)) {
    if (group.automationId !== automationId) continue
    group.automationId = null
    group.automationName = null
    group.updatedAt = Date.now()
    changed = true
  }
  if (changed) persist()
}

/**
 * Drop every group record belonging to a project.
 *
 * Same reason the agent, case and trigger stores have one: the scoped
 * mutators resolve against the open project, and a project is deleted with
 * nothing open.
 */
export function removeProjectGroups(projectId: string): number {
  if (!projectId) return 0
  const store = load()
  const doomed = Object.keys(store).filter((k) => store[k].projectId === projectId)
  for (const k of doomed) delete store[k]
  if (doomed.length > 0) persist()
  return doomed.length
}
