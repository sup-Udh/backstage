import type { AgentLifecycle } from './agents'

/**
 * What an agent is actually doing, in one vocabulary.
 *
 * The problem this exists to solve: the runtime already knew that Jane was
 * running `filesystem_read` on `package.json`, and the interface showed
 * "WORKING". Every fact needed to say "READING package.json" was present and
 * thrown away one layer below the screen.
 *
 * The rule that makes this worth having is that it is *normalised*. There is
 * exactly one vocabulary, and every provider maps into it: an OpenAI
 * `filesystem_read`, a Gemini `filesystem_read` and a Claude Code `Read(...)`
 * banner all become `reading_file`. Nothing above this line — not the pixel
 * world, not the chat, not the timeline — ever asks which provider produced
 * an activity, and adding a fourth provider means writing one mapping
 * function, not touching any of them.
 *
 * Types and pure tables only, so both processes import it without either
 * pulling the other's runtime in. Nothing here decides anything; it names
 * things and formats them.
 */

/* --------------------------------------------------------- the vocabulary -- */

/**
 * The activities a user can be shown.
 *
 * Deliberately coarser than the runtime's own events. Every tool call, every
 * model turn and every PTY line does not deserve its own visual state — the
 * point is a user glancing at the office for five seconds, and twenty-four
 * things is already at the edge of what a glance can distinguish. Anything
 * finer lives in the detail line and the timeline.
 */
export type ActivityType =
  /* nothing happening */
  | 'idle'
  /* the model is reasoning; never its contents */
  | 'thinking'
  | 'planning'
  | 'analyzing'
  /* the workspace */
  | 'inspecting_project'
  | 'reading_file'
  | 'writing_file'
  | 'creating_file'
  | 'deleting_file'
  | 'searching_files'
  | 'searching_code'
  /* execution */
  | 'running_command'
  | 'terminal_output'
  | 'testing'
  | 'building'
  | 'installing_dependency'
  | 'git_operation'
  | 'web_search'
  /* the team */
  /**
   * Saying something to the user, mid-run.
   *
   * A real, visible state rather than an internal one: a model that produces
   * prose alongside its tool calls is talking to the person watching, and the
   * office should show somebody turned away from their screen. It exists so
   * that this moment goes through the activity store like everything else —
   * it was the one remaining place that wrote a status directly, which is how
   * a badge and a roster end up disagreeing.
   */
  | 'reporting'
  | 'delegating'
  | 'talking_to_agent'
  | 'receiving_task'
  /* blocked */
  | 'waiting_for_agent'
  | 'waiting_for_permission'
  | 'waiting_for_user'
  /* terminal states */
  | 'completed'
  | 'error'
  | 'stopped'

/**
 * One thing an agent is doing, or was doing.
 *
 * `detail` and `detailFull` are separate on purpose: the world badge has room
 * for `App.tsx` and the activity panel wants `src/components/App.tsx`, and a
 * single field would force one of the two surfaces to be wrong. Both are
 * nullable, because §36 of the brief is the important one — when the runtime
 * does not know the file or the command, the honest answer is "WRITING FILE"
 * with no detail, never a plausible-looking invention.
 */
export interface AgentActivity {
  /** The agent or CLI session this belongs to. */
  agentId: string
  /**
   * The project it belongs to.
   *
   * Carried on the activity itself rather than inferred from whichever
   * project happens to be open when it is read, so a stale activity from
   * another project is recognisable as such rather than adopted.
   */
  projectId: string
  type: ActivityType
  /** Uppercase, for a badge. Derived from `type` unless overridden. */
  label: string
  /** Compact detail for the world: `App.tsx`, `npm test`. */
  detail: string | null
  /** The whole thing, for panels: `src/components/App.tsx`. */
  detailFull: string | null
  /** When this activity began. Used for elapsed time and for ordering. */
  startedAt: number
  /** The lifecycle status this activity implies. */
  status: AgentLifecycle
  /** The registry tool name, when a tool produced it. */
  toolName?: string | null
  targetAgentId?: string | null
  targetAgentName?: string | null
  filePath?: string | null
  command?: string | null
  /**
   * Real progress, when the runtime genuinely reports it.
   *
   * Never synthesised. A test runner that does not say how many tests there
   * are gets no progress, and "TESTING" is a complete answer.
   */
  progress?: { done: number; total: number } | null
}

/** One line in the activity timeline. A record, not a live state. */
export interface ActivityEvent {
  id: string
  agentId: string
  agentName: string
  projectId: string
  type: ActivityType
  label: string
  detail: string | null
  detailFull: string | null
  at: number
  toolName?: string | null
  targetAgentName?: string | null
}

/* ------------------------------------------------------------- vocabulary -- */

/** The badge label. Uppercase because every status label in Backstage is. */
export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  idle: 'IDLE',
  thinking: 'THINKING',
  planning: 'PLANNING',
  analyzing: 'ANALYZING',
  inspecting_project: 'INSPECTING PROJECT',
  reading_file: 'READING',
  writing_file: 'WRITING',
  creating_file: 'CREATING',
  deleting_file: 'DELETING',
  searching_files: 'SEARCHING FILES',
  searching_code: 'SEARCHING CODE',
  running_command: 'RUNNING COMMAND',
  terminal_output: 'WORKING',
  testing: 'TESTING',
  building: 'BUILDING',
  installing_dependency: 'INSTALLING',
  git_operation: 'GIT',
  web_search: 'RESEARCHING WEB',
  reporting: 'REPORTING BACK',
  delegating: 'DELEGATING',
  talking_to_agent: 'TALKING TO',
  receiving_task: 'RECEIVING TASK',
  waiting_for_agent: 'WAITING FOR',
  waiting_for_permission: 'WAITING FOR APPROVAL',
  waiting_for_user: 'WAITING FOR YOU',
  completed: 'COMPLETE',
  error: 'ERROR',
  stopped: 'STOPPED'
}

/**
 * The same thing, shortened for the world at small scale.
 *
 * §25: with eight characters on screen a label has to give way before it
 * overlaps somebody. Falling back to a shorter *word* is better than
 * truncating mid-word, so the short forms are written rather than computed.
 */
export const ACTIVITY_SHORT: Record<ActivityType, string> = {
  idle: 'IDLE',
  thinking: 'THINKING',
  planning: 'PLANNING',
  analyzing: 'ANALYZING',
  inspecting_project: 'INSPECTING',
  reading_file: 'READING',
  writing_file: 'WRITING',
  creating_file: 'CREATING',
  deleting_file: 'DELETING',
  searching_files: 'SEARCHING',
  searching_code: 'SEARCHING',
  running_command: 'TERMINAL',
  terminal_output: 'WORKING',
  testing: 'TESTING',
  building: 'BUILDING',
  installing_dependency: 'INSTALLING',
  git_operation: 'GIT',
  web_search: 'WEB',
  reporting: 'REPORTING',
  delegating: 'DELEGATING',
  talking_to_agent: 'TALKING',
  receiving_task: 'RECEIVING',
  waiting_for_agent: 'WAITING',
  waiting_for_permission: 'APPROVAL',
  waiting_for_user: 'WAITING',
  completed: 'DONE',
  error: 'ERROR',
  stopped: 'STOPPED'
}

/**
 * A small mark per activity, in the product's existing status language.
 *
 * ASCII-adjacent and single width, because these are set in Pixelify Sans at
 * nine pixels over a pixel-art room — anything with a complex outline turns
 * into a smudge at that size.
 */
export const ACTIVITY_GLYPH: Record<ActivityType, string> = {
  idle: '○',
  thinking: '◐',
  planning: '◑',
  analyzing: '◒',
  inspecting_project: '◈',
  reading_file: '▤',
  writing_file: '✎',
  creating_file: '✚',
  deleting_file: '✕',
  searching_files: '◆',
  searching_code: '◆',
  running_command: '▸',
  terminal_output: '▸',
  testing: '✓',
  building: '▣',
  installing_dependency: '↧',
  git_operation: '⑂',
  web_search: '⌖',
  reporting: '◑',
  delegating: '→',
  talking_to_agent: '⇄',
  receiving_task: '←',
  waiting_for_agent: '◔',
  waiting_for_permission: '!',
  waiting_for_user: '!',
  completed: '✓',
  error: '✕',
  stopped: '◍'
}

/**
 * The lifecycle status each activity implies.
 *
 * One direction only: an activity determines a status, never the reverse.
 * That is what stops the two disagreeing — the previous arrangement had the
 * status set in one place and the action string in another, so an agent could
 * report WORKING while its action line said it was waiting for approval.
 */
const STATUS_FOR: Record<ActivityType, AgentLifecycle> = {
  idle: 'idle',
  thinking: 'thinking',
  planning: 'thinking',
  analyzing: 'thinking',
  inspecting_project: 'working',
  reading_file: 'working',
  writing_file: 'working',
  creating_file: 'working',
  deleting_file: 'working',
  searching_files: 'working',
  searching_code: 'working',
  running_command: 'working',
  terminal_output: 'working',
  testing: 'working',
  building: 'working',
  installing_dependency: 'working',
  git_operation: 'working',
  web_search: 'working',
  reporting: 'talking',
  delegating: 'talking',
  talking_to_agent: 'talking',
  receiving_task: 'waiting',
  waiting_for_agent: 'waiting',
  waiting_for_permission: 'waiting',
  waiting_for_user: 'waiting',
  completed: 'idle',
  error: 'error',
  stopped: 'idle'
}

export function statusForActivity(type: ActivityType): AgentLifecycle {
  return STATUS_FOR[type]
}

/** Activities where something is genuinely happening, for emphasis. */
export function isBusyActivity(type: ActivityType): boolean {
  const status = STATUS_FOR[type]
  return status === 'working' || status === 'thinking' || status === 'talking'
}

/** Activities where the agent is stuck until somebody or something moves. */
export function isWaitingActivity(type: ActivityType): boolean {
  return (
    type === 'waiting_for_agent' ||
    type === 'waiting_for_permission' ||
    type === 'waiting_for_user' ||
    type === 'receiving_task'
  )
}

/**
 * The family an activity belongs to.
 *
 * A coarser grouping than the type, for the two places that need one: the
 * glyph drawn on a character's monitor in the pixel world, and the tool
 * blocks in the transcript. Both are decoration at four or five pixels, and
 * neither can express twenty-four distinctions.
 *
 * Kept as the same six names the transcript already groups by, so the monitor
 * mark and the chat heading agree about what somebody was doing.
 */
export type ActivityFamily = 'files' | 'terminal' | 'git' | 'web' | 'team' | 'other'

const FAMILY: Partial<Record<ActivityType, ActivityFamily>> = {
  inspecting_project: 'files',
  reading_file: 'files',
  writing_file: 'files',
  creating_file: 'files',
  deleting_file: 'files',
  searching_files: 'files',
  searching_code: 'files',
  running_command: 'terminal',
  terminal_output: 'terminal',
  testing: 'terminal',
  building: 'terminal',
  installing_dependency: 'terminal',
  git_operation: 'git',
  web_search: 'web',
  delegating: 'team',
  talking_to_agent: 'team',
  receiving_task: 'team',
  waiting_for_agent: 'team'
}

export function activityFamily(type: ActivityType): ActivityFamily {
  return FAMILY[type] ?? 'other'
}

/* ------------------------------------------------------------ formatting -- */

/**
 * A path, shortened to the part that identifies it.
 *
 * `src/components/AgentPanel.tsx` becomes `AgentPanel.tsx`. The whole path
 * survives in `detailFull`, so nothing is lost — this only decides what fits
 * over somebody's head.
 *
 * A directory keeps its trailing name (`src/` stays `src/`), because a search
 * scoped to a folder is about the folder and the basename alone would say
 * `components` for both a folder and a file inside one.
 */
export function shortPath(path: string): string {
  const trimmed = String(path ?? '').trim()
  if (!trimmed) return ''
  if (trimmed === '.' || trimmed === './') return 'project root'

  const isDir = /[\\/]$/.test(trimmed)
  const parts = trimmed.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
  const last = parts[parts.length - 1] ?? trimmed
  return isDir ? `${last}/` : last
}

/**
 * A command, shortened to something that fits a badge.
 *
 * Keeps the verb and enough of the arguments to be recognisable, and never
 * invents. A command longer than the budget is cut with an ellipsis rather
 * than summarised, because a summarised command is a different command.
 */
export function shortCommand(command: string, max = 28): string {
  const flat = String(command ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1).trimEnd()}…`
}

/**
 * The text of a world badge, given how much room there is.
 *
 * Degrades in one direction and in a fixed order — full label plus detail,
 * then short label plus detail, then short label alone — so a busy office is
 * still readable and a character never loses its badge entirely. §25 asks for
 * exactly this, and the full text remains available on hover and in the
 * inspector.
 */
export function badgeText(
  activity: Pick<AgentActivity, 'type' | 'label' | 'detail'>,
  budget = 26
): string {
  const detail = activity.detail?.trim()
  const full = detail ? `${activity.label} ${detail}` : activity.label
  if (full.length <= budget) return full

  const short = ACTIVITY_SHORT[activity.type]
  const compact = detail ? `${short} ${detail}` : short
  if (compact.length <= budget) return compact

  if (detail && short.length + 2 < budget) {
    // Trimmed, so a cut that lands on a space does not read as `npm …`.
    const room = budget - short.length - 2
    const cut = detail.slice(0, room).trimEnd()
    if (cut) return `${short} ${cut}…`
  }
  return short
}

/**
 * A whole activity as one line of prose, for a chat header or a tooltip.
 *
 * "Reading package.json" rather than "READING_FILE". Used where the badge
 * vocabulary would read as shouting.
 */
export function activitySentence(activity: AgentActivity): string {
  const label = activity.label.toLowerCase()
  const detail = activity.detailFull ?? activity.detail
  const named = detail ? `${label} ${detail}` : label
  return named.charAt(0).toUpperCase() + named.slice(1)
}
