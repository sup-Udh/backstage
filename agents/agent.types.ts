/**
 * Agent types, main process.
 *
 * The domain itself lives in src/shared/agents.ts and is imported by both
 * processes, so there is one definition of an agent rather than one per side.
 * This file re-exports it under the path the main process already uses, and
 * adds the few things only the runtime needs.
 */

export type {
  AgentConfig,
  AgentLifecycle,
  AgentRuntimeState,
  AgentTask,
  AgentValidation,
  AwarenessSnapshot,
  CapabilityId,
  CapabilityInfo,
  ChatMessage,
  CollaborationKind,
  CollaborationMessage,
  ExecutionProfile,
  OrchestrationSettings,
  RuntimeEvent,
  RuntimeEventType,
  TaskStatus,
  Trigger,
  TriggerActionType,
  TriggerEventType
} from '../../src/shared/agents'

export { BUSY_STATUSES } from '../../src/shared/agents'

/**
 * How a task got here.
 *
 * The runtime treats all three identically once running — the difference
 * matters for loop protection and for what the user is shown, not for
 * execution.
 */
export type TaskOrigin = 'user' | 'agent' | 'trigger'

/** Everything needed to start one execution, resolved before it is queued. */
export interface TaskRequest {
  agentId: string
  prompt: string
  title?: string
  origin: TaskOrigin
  originAgentId?: string | null
  correlationId?: string
  depth?: number
  parentTaskId?: string | null
  /**
   * The investigation this belongs to.
   *
   * Omitted for ordinary work, which joins the case its chain already opened.
   * Supplied only when the user started from an existing case and the chain
   * would otherwise open a new one.
   */
  caseId?: string | null
  /** Prior turns to seed the model with. Trimmed again before the request. */
  history?: import('../providers/provider.types').Turn[]
  /**
   * What this task's answer will be, if it is not simply an answer.
   *
   * Carried through to the recorded message so the interface can lead with the
   * team's final answer instead of leaving the user to work out which of five
   * replies it was.
   */
  part?: import('../../src/shared/agents').MessagePart
}
