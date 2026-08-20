import type { AgentStatus } from '../agents/agent.types'
import type { CharacterState } from './character.types'

/**
 * agent state -> character state -> animation.
 *
 * The single mapping from the runtime's lifecycle to something a body can do.
 * Components never decide this for themselves: a chip that invents its own
 * label and a character that invents its own pose are the two halves of the
 * same bug, where the office and the panel disagree about who is working.
 *
 * Locomotion ('walking') is owned by the world, not the agent: an agent is
 * "working" even while its character is still crossing the office to reach a
 * desk. The world overrides the visual state during travel.
 */
export function characterStateForAgent(status: AgentStatus): CharacterState {
  switch (status) {
    case 'working':
      return 'working'
    case 'thinking':
      return 'thinking'
    case 'talking':
      return 'talking'
    case 'waiting':
      // Blocked on a person or another agent: standing about, not typing.
      return 'waiting'
    case 'queued':
      return 'waiting'
    case 'stopping':
      /*
       * Still winding down, so still at the desk — but no longer typing. The
       * pose has to differ from `working`, or clicking Stop would appear to
       * have done nothing until the execution finally unwound.
       */
      return 'waiting'
    case 'success':
      return 'success'
    case 'error':
      return 'error'
    case 'idle':
    case 'ready':
    case 'offline':
    default:
      return 'idle'
  }
}

export interface AnimationClip {
  frames: number
  /** Frames per second. */
  fps: number
}

/** How each semantic state animates. */
export const ANIMATIONS: Record<CharacterState, AnimationClip> = {
  idle: { frames: 2, fps: 1.6 },
  walking: { frames: 4, fps: 7 },
  working: { frames: 2, fps: 5.5 },
  thinking: { frames: 2, fps: 1.1 },
  talking: { frames: 2, fps: 3.4 },
  waiting: { frames: 2, fps: 1.2 },
  success: { frames: 2, fps: 5 },
  error: { frames: 2, fps: 2.4 }
}

/** Status chip glyphs, per the product's status language. */
export const STATUS_GLYPH: Record<AgentStatus, string> = {
  offline: '○',
  ready: '◇',
  idle: '○',
  queued: '◔',
  thinking: '◐',
  working: '✦',
  talking: '◑',
  waiting: '◒',
  stopping: '◍',
  success: '◆',
  error: '✕'
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  offline: 'OFFLINE',
  ready: 'READY',
  idle: 'IDLE',
  queued: 'QUEUED',
  thinking: 'THINKING',
  working: 'WORKING',
  talking: 'TALKING',
  waiting: 'WAITING',
  stopping: 'STOPPING',
  success: 'DONE',
  error: 'ERROR'
}

/** Statuses that mean the agent is actively occupied, for emphasis. */
export const ACTIVE_STATUSES: AgentStatus[] = [
  'queued',
  'thinking',
  'working',
  'talking',
  'waiting',
  'stopping',
  'success'
]

/**
 * The four buckets the team header reports on.
 *
 * Defined once, beside the vocabulary they summarise, so the header and the
 * status strip cannot count the same office differently.
 */
export type StatusBucket = 'working' | 'thinking' | 'talking' | 'idle'

export function bucketFor(status: AgentStatus): StatusBucket {
  if (status === 'working' || status === 'success' || status === 'queued') return 'working'
  if (status === 'thinking') return 'thinking'
  if (status === 'talking') return 'talking'
  return 'idle'
}
