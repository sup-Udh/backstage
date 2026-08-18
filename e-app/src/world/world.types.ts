import type { AgentStatus } from '../agents/agent.types'
import type {
  CharacterDef,
  CharacterState,
  Facing
} from '../characters/character.types'

/** A point the character is walking towards. */
export interface PathNode {
  x: number
  y: number
}

/** Small thought/speech decoration drawn above the head. */
export type Bubble = 'none' | 'think' | 'talk' | 'spark'

/**
 * The mutable per-character state the engine owns. This is deliberately not
 * React state: it changes every frame and must never trigger a re-render.
 */
export interface CharacterRuntime {
  def: CharacterDef
  /** Which model drives this character, for the provider badge. */
  model: string
  /** Feet position in scene pixels. */
  x: number
  y: number
  facing: Facing
  state: CharacterState
  /** Remaining waypoints; empty means the character has arrived. */
  path: PathNode[]
  /** Where this character is headed, and how it should face on arrival. */
  destFacing: Facing
  /** Desk reserved by this character, if any. */
  desk: number | null
  /** Key of the spot reserved by this character, if any. */
  spotKey: string | null
  /** Drives the animation clip. */
  animTime: number
  frame: number
  /** Used to detect an agent status change. */
  lastStatus: AgentStatus | null
  bubble: Bubble
  /** Seconds since arriving, used for small idle flourishes. */
  settled: number
  /** Walk speed in scene px/sec. Varied slightly so the cast is not in lockstep. */
  speed: number
}

/** What the UI layer is told about, at status-change frequency only. */
export interface AgentView {
  characterId: string
  name: string
  role: string
  model: string
  status: AgentStatus
  task: string | null
}
