import type { AgentStatus } from '../agents/agent.types'
import type { CharacterState } from './character.types'

/**
 * agent state -> character state -> animation.
 *
 * Locomotion ('walking') is owned by the world, not the agent: an agent is
 * "working" even while its character is still crossing the office to reach
 * a desk. The world overrides the visual state during travel.
 */
export function characterStateForAgent(status: AgentStatus): CharacterState {
  switch (status) {
    case 'idle':
      return 'idle'
    case 'working':
      return 'working'
    case 'thinking':
      return 'thinking'
    case 'talking':
      return 'talking'
    case 'waiting':
      return 'waiting'
    case 'success':
      return 'success'
    case 'error':
      return 'error'
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
  working: '●',
  thinking: '◐',
  talking: '◑',
  idle: '○',
  waiting: '○',
  success: '◆',
  error: '◇'
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  working: 'WORKING',
  thinking: 'THINKING',
  talking: 'TALKING',
  idle: 'IDLE',
  waiting: 'WAITING',
  success: 'DONE',
  error: 'BLOCKED'
}
