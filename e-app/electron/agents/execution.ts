import type { ExecutionProfile } from './agent.types'

/**
 * The execution budget.
 *
 * Replaces the single hard-coded step cap. A budget has three independent
 * limits because they fail for different reasons: a model can loop cheaply
 * (steps), call tools expensively (tool calls), or block on something slow
 * (duration). Hitting any one of them ends the task cleanly, and — importantly
 * — the runtime asks for a final answer rather than reporting the limit as if
 * it were the model's reply.
 */
export interface ExecutionBudget {
  maxSteps: number
  maxToolCalls: number
  maxDurationMs: number
  /** Identical tool+arguments allowed this many times before it is refused. */
  maxRepeats: number
}

const PROFILES: Record<ExecutionProfile, ExecutionBudget> = {
  quick: {
    maxSteps: 12,
    maxToolCalls: 20,
    maxDurationMs: 90_000,
    maxRepeats: 2
  },
  normal: {
    maxSteps: 32,
    maxToolCalls: 60,
    maxDurationMs: 240_000,
    maxRepeats: 2
  },
  deep: {
    maxSteps: 64,
    maxToolCalls: 140,
    maxDurationMs: 600_000,
    maxRepeats: 3
  }
}

export function budgetFor(profile: ExecutionProfile): ExecutionBudget {
  return PROFILES[profile] ?? PROFILES.normal
}

export const PROFILE_LABELS: Record<ExecutionProfile, string> = {
  quick: 'Quick',
  normal: 'Balanced',
  deep: 'Deep'
}

/**
 * Tracks how the budget is being spent, and notices wasted effort.
 *
 * The repeat check matters as much as the caps: a model that reads the same
 * file four times is not making progress, and telling it so is far more useful
 * than letting it exhaust the budget in silence.
 */
export class BudgetTracker {
  private steps = 0
  private toolCalls = 0
  private readonly startedAt = Date.now()
  private seen = new Map<string, number>()

  constructor(readonly budget: ExecutionBudget) {}

  nextStep(): void {
    this.steps++
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt
  }

  /** Why the loop must stop, or null to continue. */
  exhausted(): string | null {
    if (this.steps >= this.budget.maxSteps) return 'step limit'
    if (this.toolCalls >= this.budget.maxToolCalls) return 'tool-call limit'
    if (this.elapsedMs >= this.budget.maxDurationMs) return 'time limit'
    return null
  }

  /**
   * Record a tool call. Returns a message to hand back instead of running it
   * when the same call has already been made too many times.
   */
  useTool(name: string, args: Record<string, unknown>): string | null {
    this.toolCalls++
    const key = `${name}:${stableStringify(args)}`
    const count = (this.seen.get(key) ?? 0) + 1
    this.seen.set(key, count)

    if (count > this.budget.maxRepeats) {
      return `You have already called ${name} with these exact arguments ${count - 1} times and received the same result. Do not call it again. Use what you already have, try a different tool or different arguments, or give your final answer now.`
    }
    return null
  }

  summary(): string {
    return `${this.steps} steps, ${this.toolCalls} tool calls, ${Math.round(this.elapsedMs / 1000)}s`
  }
}

/** Key-order-independent, so argument order cannot defeat repeat detection. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? ''
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  )
  return `{${entries.map(([k, v]) => `${k}:${stableStringify(v)}`).join(',')}}`
}
