import type { AgentStatus } from '../agents/agent.types'
import type { ToolGroup } from '../agents/toolActivity'
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
export type Bubble = 'none' | 'think' | 'talk' | 'spark' | 'wait' | 'alert'

/**
 * Where a body is, as distinct from what its agent is doing.
 *
 * The runtime says "working"; the office says whether the person doing the
 * working has got to their chair yet. Keeping the two apart is the whole
 * reason a model call no longer sends somebody walking across the room: the
 * agent's status changes constantly and the body's `place` only changes when
 * the body actually goes somewhere.
 */
export type Place =
  /** Standing at the destination the director chose. */
  | 'standing'
  /** Crossing the office. */
  | 'walking'
  /** In a chair at a workstation. */
  | 'seated'

/**
 * The mutable per-character state the engine owns. This is deliberately not
 * React state: it changes every frame and must never trigger a re-render.
 */
export interface CharacterRuntime {
  /** Which agent this body belongs to. The definition is only its look. */
  agentId: string
  /** Set when the agent keeps its own name, e.g. an external CLI session. */
  ownName?: string
  def: CharacterDef
  /** Which model drives this character, for the provider badge. */
  model: string
  /** Feet position in scene pixels. */
  x: number
  y: number
  facing: Facing
  /** The facing the body is easing towards, so turns are not instantaneous. */
  turnTo: Facing
  /** Seconds until the body may commit to `turnTo`. */
  turnHold: number
  state: CharacterState
  place: Place
  /** Remaining waypoints; empty means the character has arrived. */
  path: PathNode[]
  /** Where this character is headed, and how it should face on arrival. */
  destFacing: Facing
  /** Whether the current trip ends in a chair. */
  destSeated: boolean
  /** Workstation owned by this agent for the session, if any. */
  station: number | null
  /** Key of the spot reserved by this character, if any. */
  spotKey: string | null
  /** Drives the animation clip. */
  animTime: number
  frame: number
  /** Used to detect an agent status change. */
  lastStatus: AgentStatus | null
  /** Used to restart clips that are meant to have a beginning. */
  lastState: CharacterState | null
  bubble: Bubble
  /** Seconds since arriving, used for small idle flourishes. */
  settled: number
  /** Top walk speed in scene px/sec. Varied slightly per character. */
  speed: number
  /** Current speed, ramped towards `speed` and back down on approach. */
  vel: number
  /**
   * This character's own offset into every animation clip, in seconds.
   *
   * The single thing that stops an office of six people from breathing,
   * blinking and typing on the same frame. Clips used to be restarted from
   * zero on every status change, which actively *synchronised* the cast: three
   * agents given work at the same moment typed in perfect unison from then on.
   */
  phase: number
  /** Who this character is currently exchanging something with. */
  partnerId: string | null
  /** The tool family the agent last started, which colours the work pose. */
  activity: ToolGroup | null
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
