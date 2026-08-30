import type { AgentStatus } from '../agents/agent.types'
import type { ActivityType } from '../shared/activity'
import type { CharacterState } from './character.types'

/**
 * Which pose an activity is drawn as, when the character is at a desk.
 *
 * The bridge between the normalised activity vocabulary and the animation
 * table — and the reason the office can say what somebody is doing without a
 * word of text. It is deliberately many-to-few: twenty-four activities become
 * seven seated poses, because a person watching can tell reading from typing
 * from waiting and cannot tell `searching_files` from `searching_code`. The
 * badge carries the precision; the body carries the gist.
 *
 * Absent from this table means "no opinion", and the status decides instead.
 */
const SEATED_FOR_ACTIVITY: Partial<Record<ActivityType, CharacterState>> = {
  /* hands off the keys, eyes on the screen */
  reading_file: 'sitReading',
  inspecting_project: 'sitReading',
  analyzing: 'sitReading',

  /* restless, scanning */
  searching_files: 'sitSearching',
  searching_code: 'sitSearching',
  web_search: 'sitSearching',

  /* hands on the keys */
  writing_file: 'sitWorking',
  creating_file: 'sitWorking',
  deleting_file: 'sitWorking',

  /* a keystroke, then watching something happen */
  running_command: 'sitTerminal',
  terminal_output: 'sitTerminal',
  testing: 'sitTerminal',
  building: 'sitTerminal',
  installing_dependency: 'sitTerminal',
  git_operation: 'sitTerminal',

  /* turned away from the screen */
  reporting: 'sitTalking',
  delegating: 'sitTalking',
  talking_to_agent: 'sitTalking',

  /* still, and visibly not working */
  receiving_task: 'sitWaiting',
  waiting_for_agent: 'sitWaiting',
  waiting_for_permission: 'sitWaiting',
  waiting_for_user: 'sitWaiting',

  thinking: 'sitThinking',
  planning: 'sitThinking',

  error: 'sitError',
  stopped: 'sitting',
  idle: 'sitting'
}

/**
 * The standing equivalent.
 *
 * Sparser on purpose: a character on their feet has nowhere to type and no
 * screen to read, so most work collapses to the one standing work pose. What
 * has to survive the collapse is the distinction between doing something,
 * thinking about something, talking to somebody and waiting — which is
 * exactly what a person across a room can tell.
 */
const STANDING_FOR_ACTIVITY: Partial<Record<ActivityType, CharacterState>> = {
  thinking: 'thinking',
  planning: 'thinking',
  analyzing: 'thinking',
  reporting: 'talking',
  delegating: 'talking',
  talking_to_agent: 'talking',
  receiving_task: 'waiting',
  waiting_for_agent: 'waiting',
  waiting_for_permission: 'waiting',
  waiting_for_user: 'waiting',
  completed: 'success',
  error: 'error',
  stopped: 'idle',
  idle: 'idle'
}

/**
 * What to draw for an agent.
 *
 * The activity leads and the status is the fallback. That order matters: the
 * activity is the specific fact — "running npm test" — and the status is the
 * generalisation of it, so deriving the pose from the status would throw away
 * the very thing this system exists to show. An agent with no activity is
 * still drawn correctly, which is what keeps the world working for anything
 * that has not been taught to report one.
 */
export function characterStateForAgent(
  status: AgentStatus,
  seated = false,
  activity: ActivityType | null = null
): CharacterState {
  if (activity) {
    /*
     * The celebration outranks the activity it followed. `success` is a
     * two-second flourish the world plays over the top of whatever the agent
     * last did, and letting `completed` resolve to a resting pose would mean
     * the finish were never visible.
     */
    if (status === 'success') return seated ? 'sitTalking' : 'success'
    const pose = seated
      ? SEATED_FOR_ACTIVITY[activity]
      : STANDING_FOR_ACTIVITY[activity]
    if (pose) return pose
    // A busy activity with no pose of its own is still work being done.
    if (activity !== 'completed') return seated ? 'sitWorking' : 'working'
  }

  switch (status) {
    case 'working':
      return seated ? 'sitWorking' : 'working'
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
   * A command running. A keystroke or two, then a long hunched hold watching
   * the output — which is what running `npm test` actually looks like, and
   * why it must not share a clip with writing a file. The two short frames at
   * the front and the 1.1s hold in the middle are the whole read.
   */
  sitTerminal: clip([0.16, 0.14, 0.9, 0.7, 1.1, 0.4]),

  /*
   * Reading the screen. Hands off the keys, the head tracks down the page,
   * and every so often one hand comes up to scroll. Long holds: reading is
   * the one work pose where stillness is the truthful thing to draw.
   */
  sitReading: clip([0.85, 1.15, 0.4, 1.3, 0.5, 0.95]),

  /*
   * Scanning. Even, quick frames with the head moving side to side — the
   * opposite rhythm to reading, which is what stops "searching src/" and
   * "reading App.tsx" looking like the same person doing the same thing.
   */
  sitSearching: clip([0.28, 0.22, 0.3, 0.24, 0.34, 0.26]),

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
