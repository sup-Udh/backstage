import type { PermissionCategory } from '../src/shared/agents'
import { makeId } from './persist'
import { grantForSession, recordPermission } from './permissionStore'

/**
 * Human approval for actions the rules say to ask about.
 *
 * The tool registry used to declare which tools needed permission and nothing
 * asked for it; then this asked, and nobody could see or change what it asked
 * about. Both halves live in `permissionStore` now — this is only the part
 * that puts a question in front of a person and waits for the answer.
 *
 * The default on every failure path is deny. A timeout denies, a closed window
 * denies, a cancelled execution denies, no listener denies. An approval prompt
 * that fails open is not an approval prompt.
 */

export interface ApprovalRequest {
  id: string
  agentId: string
  agentName: string
  /**
   * Who the agent is acting for, when it is not the user.
   *
   * "Walter wants Jesse to run npm install" is a different sentence from
   * "Jesse wants to run npm install", and the user should never have to work
   * out which one they are being asked.
   */
  requestedByName: string | null
  /** Set when the work came from an automation rather than from a person. */
  automationName: string | null
  taskId: string
  executionId: string
  tool: string
  /** Which permission rule this falls under, so the card can name it. */
  category: PermissionCategory
  /** Human summary of what is about to happen. */
  summary: string
  /** The actual arguments, so the user can see what they are approving. */
  detail: string
  /** The folder it would happen in. */
  workspaceName: string | null
  at: number
}

/** What the user chose. `session` also stops this category asking again today. */
export type ApprovalAnswer = 'allow' | 'session' | 'deny'

type Publisher = (request: ApprovalRequest) => void

interface Pending {
  request: ApprovalRequest
  resolve: (approved: boolean) => void
  timer: NodeJS.Timeout
}

/** Long enough to read a command, short enough not to wedge an agent forever. */
const TIMEOUT_MS = 180_000

const pending = new Map<string, Pending>()
let publish: Publisher | null = null

/** Called once by the IPC layer, which owns the route to the windows. */
export function setApprovalPublisher(fn: Publisher | null): void {
  publish = fn
}

export function pendingApprovals(): ApprovalRequest[] {
  return [...pending.values()].map((p) => p.request)
}

export function requestApproval(
  input: Omit<ApprovalRequest, 'id' | 'at'>
): Promise<boolean> {
  // With nothing listening there is nobody to ask, and "nobody asked" must
  // never mean "granted".
  if (!publish) {
    recordPermission({
      agentId: input.agentId,
      agentName: input.agentName,
      requestedByName: input.requestedByName,
      tool: input.tool,
      category: input.category,
      summary: input.summary,
      outcome: 'denied',
      automationName: input.automationName
    })
    return Promise.resolve(false)
  }

  const request: ApprovalRequest = { ...input, id: makeId('appr'), at: Date.now() }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(request.id)
      recordPermission({
        agentId: request.agentId,
        agentName: request.agentName,
        requestedByName: request.requestedByName,
        tool: request.tool,
        category: request.category,
        summary: request.summary,
        outcome: 'denied',
        automationName: request.automationName
      })
      resolve(false)
    }, TIMEOUT_MS)
    // Do not hold the app open just because a prompt is unanswered.
    timer.unref?.()

    pending.set(request.id, { request, resolve, timer })
    publish?.(request)
  })
}

/**
 * Answer an outstanding request.
 *
 * `session` allows this one *and* stops the same category asking again until
 * the app is closed or the project changes. It is a convenience, not a
 * widening: `evaluateToolCall` still refuses a category the rules deny, so a
 * grant given here cannot outlive a rule that contradicts it.
 */
export function resolveApproval(id: string, answer: ApprovalAnswer): boolean {
  const entry = pending.get(id)
  if (!entry) return false

  clearTimeout(entry.timer)
  pending.delete(id)

  const approved = answer !== 'deny'
  if (answer === 'session') grantForSession(entry.request.category)

  recordPermission({
    agentId: entry.request.agentId,
    agentName: entry.request.agentName,
    requestedByName: entry.request.requestedByName,
    tool: entry.request.tool,
    category: entry.request.category,
    summary: entry.request.summary,
    outcome: answer === 'deny' ? 'denied' : answer === 'session' ? 'session' : 'allowed',
    automationName: entry.request.automationName
  })

  entry.resolve(approved)
  return true
}

/** Deny everything an execution is waiting on. Used when it is cancelled. */
export function denyForExecution(executionId: string): void {
  for (const [id, entry] of [...pending.entries()]) {
    if (entry.request.executionId !== executionId) continue
    clearTimeout(entry.timer)
    pending.delete(id)
    entry.resolve(false)
  }
}
