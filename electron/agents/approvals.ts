import { makeId } from './persist'

/**
 * Human approval for dangerous tools.
 *
 * The tool registry has always declared which tools need permission; nothing
 * asked for it. This is the missing half: a tool marked `requiresApproval`
 * cannot run until the user says yes.
 *
 * The default on every failure path is deny. A timeout denies, a closed window
 * denies, a cancelled execution denies. An approval prompt that fails open is
 * not an approval prompt.
 */

export interface ApprovalRequest {
  id: string
  agentId: string
  agentName: string
  taskId: string
  executionId: string
  tool: string
  /** Human summary of what is about to happen. */
  summary: string
  /** The actual arguments, so the user can see what they are approving. */
  detail: string
  at: number
}

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
  if (!publish) return Promise.resolve(false)

  const request: ApprovalRequest = { ...input, id: makeId('appr'), at: Date.now() }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(request.id)
      resolve(false)
    }, TIMEOUT_MS)
    // Do not hold the app open just because a prompt is unanswered.
    timer.unref?.()

    pending.set(request.id, { request, resolve, timer })
    publish?.(request)
  })
}

export function resolveApproval(id: string, approved: boolean): boolean {
  const entry = pending.get(id)
  if (!entry) return false
  clearTimeout(entry.timer)
  pending.delete(id)
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
