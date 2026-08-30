import type {
  PermissionCategory,
  PermissionDecision,
  PermissionOutcome,
  PermissionRecord,
  ProjectPermissions
} from '../src/shared/agents'
import { makeId, readJson, writeJson } from './persist'
import { getActiveProjectId } from '../projects/projectStore'
import {
  categoriseToolCall,
  defaultRules,
  isImpactful,
  isPermissionCategory,
  isPermissionDecision
} from './permissionRules'

/**
 * What agents may do in this project, and what they had to ask about.
 *
 * Per project rather than per account, deliberately. Permissions are a
 * statement about a folder — "agents may write freely in my scratch repo, and
 * must ask before touching anything in the one that deploys on merge" — and an
 * account-level switch would make the looser of two projects set the rule for
 * the stricter one. It is stored beside the automations for the same reason
 * they are: both are scoped to the work, not to the person.
 *
 * Auto Allow is a convenience layer over these rules and never a way around
 * them. It only ever changes what happens to a category the user already set
 * to ALLOW; ASK still asks and DENY still refuses, whether the caller is a
 * person, an agent or an automation running at three in the morning.
 */

const FILE = 'permissions.json'
const HISTORY_FILE = 'permissionHistory.json'

/** Enough to answer "what did it do while I was out", not an audit log. */
const HISTORY_LIMIT = 250

type Stored = Record<string, ProjectPermissions>

let cache: Stored | null = null
let history: PermissionRecord[] | null = null

/* --------------------------------------------------------------- loading -- */

function normalise(raw: unknown, projectId: string): ProjectPermissions {
  const rules = defaultRules()
  const source = (raw ?? {}) as Record<string, unknown>
  const given = (source.rules ?? {}) as Record<string, unknown>

  for (const [key, value] of Object.entries(given)) {
    if (isPermissionCategory(key) && isPermissionDecision(value)) rules[key] = value
  }

  return {
    projectId,
    autoAllow: source.autoAllow === true,
    rules,
    updatedAt: Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : Date.now()
  }
}

function load(): Stored {
  if (cache) return cache
  const raw = readJson<Record<string, unknown>>(FILE, {})
  const out: Stored = {}
  for (const [projectId, value] of Object.entries(raw ?? {})) {
    if (!projectId) continue
    out[projectId] = normalise(value, projectId)
  }
  cache = out
  return cache
}

function persist(): void {
  writeJson(FILE, cache ?? {})
}

/* ---------------------------------------------------------------- rules -- */

/**
 * This project's permissions, creating the defaults on first read.
 *
 * Returns the defaults for "no project open" too, rather than throwing. The
 * caller is usually a running tool call, and a permission lookup that throws
 * would fail an execution over a question that has a perfectly good safe
 * answer.
 */
export function getPermissions(projectId = getActiveProjectId()): ProjectPermissions {
  if (!projectId) {
    return { projectId: '', autoAllow: false, rules: defaultRules(), updatedAt: 0 }
  }
  const store = load()
  if (!store[projectId]) {
    store[projectId] = normalise({}, projectId)
    persist()
  }
  return store[projectId]
}

export function updatePermissions(patch: {
  autoAllow?: boolean
  rules?: Partial<Record<PermissionCategory, PermissionDecision>>
}): ProjectPermissions {
  const projectId = getActiveProjectId()
  if (!projectId) throw new Error('No project is open.')

  const current = getPermissions(projectId)
  if (patch.autoAllow !== undefined) current.autoAllow = patch.autoAllow === true
  for (const [key, value] of Object.entries(patch.rules ?? {})) {
    if (isPermissionCategory(key) && isPermissionDecision(value)) {
      current.rules[key] = value
    }
  }
  current.updatedAt = Date.now()
  persist()

  /*
   * Tightening a rule takes effect immediately, including on grants the user
   * already gave this session. Otherwise "I've changed my mind about letting
   * it run commands" would not actually stop the next command.
   */
  for (const [key, value] of Object.entries(patch.rules ?? {})) {
    if (isPermissionCategory(key) && value !== 'allow') sessionGrants.delete(key)
  }

  return current
}

/** Forget a project's rules and history, when the project itself is deleted. */
export function removeProjectPermissions(projectId: string): void {
  if (!projectId) return
  const store = load()
  if (store[projectId]) {
    delete store[projectId]
    persist()
  }
  const log = loadHistory()
  const kept = log.filter((r) => r.projectId !== projectId)
  if (kept.length !== log.length) {
    history = kept
    writeJson(HISTORY_FILE, kept)
  }
}

/* -------------------------------------------------------- session grants -- */

/**
 * Categories the user allowed "for this session".
 *
 * In memory and never persisted: a session grant that survived a restart would
 * be a permanent rule the user never wrote down, and the whole point of the
 * option is that it expires without them having to remember to revoke it.
 * Cleared when the project changes, because it was granted about *this* folder.
 */
const sessionGrants = new Set<PermissionCategory>()

export function grantForSession(category: PermissionCategory): void {
  sessionGrants.add(category)
}

export function clearSessionGrants(): void {
  sessionGrants.clear()
}

export function sessionGranted(): PermissionCategory[] {
  return [...sessionGrants]
}

/* ------------------------------------------------------------ evaluation -- */

export type PermissionVerdict =
  /** Run it, nobody needs to be asked. */
  | { kind: 'allow'; category: PermissionCategory | null; reason: PermissionOutcome }
  /** Stop and ask. */
  | { kind: 'ask'; category: PermissionCategory }
  /** Refuse. Nothing is asked and nothing runs. */
  | { kind: 'deny'; category: PermissionCategory }

/**
 * Whether this tool call may proceed.
 *
 * The whole rule, in one place, in the order it has to be applied:
 *
 *   1. an ungated tool runs                    (team tools; see permissionRules)
 *   2. DENY refuses                            — before anything else can grant it
 *   3. strict mode asks about anything impactful
 *   4. ASK asks
 *   5. ALLOW runs, if Auto Allow is on or the action is not impactful
 *   6. a session grant covers the rest
 *   7. otherwise ask
 *
 * Step 2 sitting above everything is what makes "Auto Allow must never bypass
 * DENY" structural rather than a promise: there is no later branch that can
 * reach a DENY category, and no caller — automation included — that gets to
 * skip this function.
 */
export function evaluateToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options: { strict?: boolean } = {}
): PermissionVerdict {
  const category = categoriseToolCall(toolName, args)
  if (category === null) return { kind: 'allow', category: null, reason: 'auto' }

  const { autoAllow, rules } = getPermissions()
  const rule = rules[category] ?? 'ask'

  if (rule === 'deny') return { kind: 'deny', category }

  /*
   * Strict mode is for automations, and it only ever tightens. It cannot make
   * a denied category runnable — that branch has already returned — and it
   * does not touch reads, which nobody wants to be woken up about.
   */
  if (options.strict && isImpactful(category)) return { kind: 'ask', category }

  if (rule === 'ask') {
    return sessionGrants.has(category)
      ? { kind: 'allow', category, reason: 'session' }
      : { kind: 'ask', category }
  }

  // rule === 'allow'
  if (!isImpactful(category) || autoAllow) {
    return { kind: 'allow', category, reason: 'auto' }
  }
  return sessionGrants.has(category)
    ? { kind: 'allow', category, reason: 'session' }
    : { kind: 'ask', category }
}

/* --------------------------------------------------------------- history -- */

function loadHistory(): PermissionRecord[] {
  if (history) return history
  const raw = readJson<unknown[]>(HISTORY_FILE, [])
  history = (Array.isArray(raw) ? raw : [])
    .filter((r): r is PermissionRecord => {
      if (!r || typeof r !== 'object') return false
      const rec = r as Partial<PermissionRecord>
      return typeof rec.id === 'string' && typeof rec.projectId === 'string'
    })
    .slice(-HISTORY_LIMIT)
  return history
}

export function recordPermission(input: {
  agentId: string
  agentName: string
  requestedByName?: string | null
  tool: string
  category: PermissionCategory
  summary: string
  outcome: PermissionOutcome
  automationName?: string | null
}): void {
  const projectId = getActiveProjectId()
  if (!projectId) return

  const log = loadHistory()
  log.push({
    id: makeId('perm'),
    projectId,
    at: Date.now(),
    agentId: input.agentId,
    agentName: input.agentName,
    requestedByName: input.requestedByName ?? null,
    tool: input.tool,
    category: input.category,
    summary: input.summary,
    outcome: input.outcome,
    automationName: input.automationName ?? null
  })
  if (log.length > HISTORY_LIMIT) log.splice(0, log.length - HISTORY_LIMIT)
  writeJson(HISTORY_FILE, log)
}

/** The open project's permission history, newest first. */
export function listPermissionHistory(limit = 60): PermissionRecord[] {
  const projectId = getActiveProjectId()
  if (!projectId) return []
  return loadHistory()
    .filter((r) => r.projectId === projectId)
    .slice(-limit)
    .reverse()
}

export function clearPermissionHistory(): void {
  const projectId = getActiveProjectId()
  if (!projectId) return
  const kept = loadHistory().filter((r) => r.projectId !== projectId)
  history = kept
  writeJson(HISTORY_FILE, kept)
}
