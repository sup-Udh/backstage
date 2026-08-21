import type { AgentStatus } from '../agents/agent.types'
import type { ToolGroup } from '../agents/toolActivity'
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
 *
 * `seated` is likewise the world's to decide. The runtime knows an agent is
 * thinking; only the office knows whether the body doing the thinking is in a
 * chair. This is what stopped a model call — which happens between every pair
 * of tool calls — from sending somebody walking to the corkboard and back.
 */
export function characterStateForAgent(
  status: AgentStatus,
  seated = false,
  activity: ToolGroup | null = null
): CharacterState {
  switch (status) {
    case 'working':
      if (!seated) return 'working'
      /*
       * What the tool actually is changes the pose, because it changes what a
       * person would be doing. Reading a file or a diff is done with the
       * hands off the keys; running a command or a search is typing. The
       * runtime already reports which tool started, so this is reading real
       * activity rather than inventing a rhythm.
       */
      return activity === 'files' || activity === 'git' ? 'sitReading' : 'sitWorking'
    case 'thinking':
      return seated ? 'sitThinking' : 'thinking'
    case 'talking':
      return seated ? 'sitTalking' : 'talking'
    case 'waiting':
      // Blocked on a person or another agent: standing about, not typing.
      return seated ? 'sitWaiting' : 'waiting'
    case 'queued':
      return seated ? 'sitWaiting' : 'waiting'
    case 'stopping':
      /*
       * Still winding down, so still at the desk — but no longer typing. The
       * pose has to differ from `working`, or clicking Stop would appear to
       * have done nothing until the execution finally unwound.
       */
      return seated ? 'sitWaiting' : 'waiting'
    case 'success':
      // Celebrated in the chair if that is where the work happened. Standing
      // up to cheer and sitting down again reads as a glitch, not a finish.
      return seated ? 'sitTalking' : 'success'
    case 'error':
      return seated ? 'sitError' : 'error'
    case 'idle':
    case 'ready':
    case 'offline':
    default:
      return seated ? 'sitting' : 'idle'
  }
}

/* ---------------------------------------------------------------- clips -- */

/**
 * One animation clip.
 *
 * Frames carry their own duration rather than sharing an fps, because equal
 * frame lengths are exactly what makes a pixel character look mechanical. A
 * typing loop that holds the neutral pose for 300ms and then fires two key
 * strikes 180ms apart reads as somebody working; the same six frames at a
 * flat 5fps read as a metronome.
 *
 * Durations are in seconds and are absolute, so a clip's total length is a
 * property of the clip and not of the frame rate the world happens to run at.
 */
export interface AnimationClip {
  /** Duration of each frame, in seconds. Length is the frame count. */
  frames: number[]
  /** Total length, cached so the frame lookup is not a running sum. */
  readonly length: number
  /**
   * True when the clip should not be phase-offset per character.
   *
   * A celebration is a punctuation mark and has to start at its first frame;
   * everything else is a loop that has been running since before the viewer
   * looked, and starting the whole cast on frame zero is what makes six
   * people blink in unison.
   */
  anchored?: boolean
}

function clip(frames: number[], anchored = false): AnimationClip {
  return {
    frames,
    length: frames.reduce((a, b) => a + b, 0),
    anchored
  }
}

/**
 * How each semantic state animates.
 *
 * Every clip is authored as a sequence of *held poses*, not as a smooth
 * interpolation, which is what pixel animation is. The uneven durations are
 * deliberate everywhere they appear — see each entry.
 */
export const ANIMATIONS: Record<CharacterState, AnimationClip> = {
  /*
   * Breathing with a blink in it. The blink frame is 90ms because that is
   * roughly how long a blink lasts, and anything longer reads as a character
   * who has fallen asleep rather than one who is alive.
   */
  idle: clip([1.1, 0.85, 0.09, 0.95, 1.25, 0.7]),

  /*
   * An eight-frame walk: contact, down, passing, up on each leg. The passing
   * frames are shortest because that is the fastest part of a stride, which
   * is what stops a pixel walk from looking like a march.
   */
  walking: clip([0.115, 0.085, 0.1, 0.13, 0.115, 0.085, 0.1, 0.13]),

  /*
   * Standing work: at a board or a wall, reaching up, reading across, marking
   * something. Slower than typing because the whole arm is involved.
   */
  working: clip([0.42, 0.26, 0.34, 0.5, 0.26, 0.38]),

  /*
   * Standing thought. The long first frame is the pause — the character has
   * just stopped doing something else — then the hand comes up, the head
   * tilts, and it holds. Holding is what makes it read as thought rather than
   * as a fidget.
   */
  thinking: clip([0.9, 0.3, 1.4, 0.45, 1.1, 0.35]),

  /* Speech: mouth and one gesturing hand, on different rhythms. */
  talking: clip([0.16, 0.13, 0.21, 0.14, 0.18, 0.24]),

  /*
   * Waiting. Almost nothing happens, and that is the point: a weight shift
   * every couple of seconds and a glance, so the character is visibly alive
   * and visibly not working.
   */
  waiting: clip([1.6, 0.35, 1.9, 0.3, 1.4, 0.5]),

  /** A short burst. Anchored, because a celebration has a beginning. */
  success: clip([0.14, 0.12, 0.16, 0.12, 0.18, 0.3], true),

  /** Slump, look at the screen, a small shake of the head. */
  error: clip([0.7, 0.22, 0.26, 0.9], true),

  /* ------------------------------------------------------------ seated -- */

  /** Settled in the chair. Breathing, a blink, a small shift. */
  sitting: clip([1.3, 0.95, 0.09, 1.1, 1.4, 0.8]),

  /*
   * Typing. Six frames: neutral, left hand, strike, posture shift, right
   * hand, back to neutral — the sequence asked for, and the timings are
   * uneven for the reason given at the top of this table.
   */
  sitWorking: clip([0.3, 0.18, 0.22, 0.4, 0.18, 0.35]),

  /*
   * Reading the screen. Hands off the keys, the head tracks down the page,
   * and every so often one hand comes up to scroll. Long holds: reading is
   * the one work pose where stillness is the truthful thing to draw.
   */
  sitReading: clip([0.85, 1.15, 0.4, 1.3, 0.5, 0.95]),

  /*
   * Seated thought. Push back from the desk, hand to the chin, look up, hold,
   * come back. The 1.5s hold is the frame that does the communicating.
   */
  sitThinking: clip([0.55, 0.32, 1.5, 0.4, 1.15, 0.45]),

  /** Turned away from the screen, talking. */
  sitTalking: clip([0.18, 0.14, 0.22, 0.15, 0.19, 0.26]),

  /** Seated and blocked: a finger-tap and a glance at the screen. */
  sitWaiting: clip([1.5, 0.22, 0.22, 1.8, 0.3, 1.2]),

  /** Seated slump. */
  sitError: clip([0.8, 0.25, 0.3, 1.0], true)
}

/**
 * Which frame of a clip is showing at `time` seconds.
 *
 * A running scan rather than `floor(t * fps)`, because frames no longer share
 * a duration. Clips are six to eight frames long, so the scan is shorter than
 * the modulo arithmetic it replaces would have been to write.
 */
export function frameAt(state: CharacterState, time: number): number {
  const c = ANIMATIONS[state]
  let t = time % c.length
  if (t < 0) t += c.length
  for (let i = 0; i < c.frames.length; i++) {
    t -= c.frames[i]
    if (t < 0) return i
  }
  return c.frames.length - 1
}

/** How many frames a state's clip has. */
export function frameCount(state: CharacterState): number {
  return ANIMATIONS[state].frames.length
}

/**
 * The longest clip in the table.
 *
 * The sprite sheet is a grid, so every row is baked to this width and short
 * clips repeat across it. Derived rather than written down, so adding a
 * nine-frame clip cannot silently produce a row that is cut off at eight.
 */
export const MAX_CLIP_FRAMES = Object.values(ANIMATIONS).reduce(
  (n, c) => Math.max(n, c.frames.length),
  1
)

/* ------------------------------------------------------------ vocabulary -- */

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
  /*
   * `stopping` counts as working. The execution is still unwinding and still
   * being billed, so counting it as idle would tell the user the office is
   * quieter than it is at exactly the moment they are watching for it to
   * settle.
   */
  if (
    status === 'working' ||
    status === 'success' ||
    status === 'queued' ||
    status === 'stopping'
  ) {
    return 'working'
  }
  if (status === 'thinking') return 'thinking'
  if (status === 'talking') return 'talking'
  return 'idle'
}
