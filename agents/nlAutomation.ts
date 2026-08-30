import type {
  TriggerActionType,
  TriggerEventType,
  TriggerSchedule
} from '../src/shared/agents'
import { DEFAULT_SCHEDULE, WEEKDAYS } from '../src/shared/schedule'

/**
 * "Every morning ask Walter to review the latest git changes."
 *
 * A small, honest parser. It is not a language model and does not pretend to
 * be one: it recognises a fixed vocabulary of time and event phrases, finds
 * agent names in the roster it is given, and hands back a draft the user then
 * confirms or edits. Nothing it produces is ever saved without being shown
 * first, which is what lets it be this simple — the cost of a wrong guess is
 * the user changing a dropdown, not an automation that quietly does the wrong
 * thing at 6am.
 *
 * Pure, so it can be tested without a roster, a store or an application. The
 * caller supplies the agents; this never reaches for them.
 */

export interface NlAgent {
  id: string
  name: string
  role: string
}

export interface NlDraft {
  name: string
  event: TriggerEventType
  schedule: TriggerSchedule | null
  action: TriggerActionType
  agentIds: string[]
  message: string
  condition: string | null
  /**
   * What the parser actually recognised, in the user's words.
   *
   * Shown beside the generated configuration so the confirmation step is a
   * real check rather than a rubber stamp: the user can see that "every
   * morning" became 09:00 and disagree with it.
   */
  matched: string[]
  /** What it could not work out, so the form can highlight those fields. */
  missing: string[]
}

const MINUTE_OF = {
  morning: 9 * 60,
  afternoon: 14 * 60,
  evening: 18 * 60,
  night: 22 * 60
} as const

const DAY_WORDS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
}

/** "6pm", "6 pm", "18:00", "9.30am" → minutes past midnight, or null. */
export function parseClock(text: string): number | null {
  const twelve = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i.exec(text)
  if (twelve) {
    let hour = Number(twelve[1]) % 12
    if (twelve[3].toLowerCase() === 'pm') hour += 12
    return hour * 60 + Number(twelve[2] ?? 0)
  }
  const twentyFour = /\b(\d{1,2}):(\d{2})\b/.exec(text)
  if (twentyFour) {
    const hour = Number(twentyFour[1])
    const minute = Number(twentyFour[2])
    if (hour <= 23 && minute <= 59) return hour * 60 + minute
  }
  return null
}

interface TimeMatch {
  event: TriggerEventType
  schedule: TriggerSchedule
  matched: string
}

function parseTime(text: string): TimeMatch | null {
  const lower = text.toLowerCase()

  const interval = /\bevery\s+(\d+)?\s*(minute|minutes|hour|hours)\b/.exec(lower)
  if (interval) {
    const n = Number(interval[1] ?? 1)
    const minutes = interval[2].startsWith('hour') ? n * 60 : n
    return {
      event: 'schedule.interval',
      schedule: { ...DEFAULT_SCHEDULE, everyMinutes: Math.max(5, minutes) },
      matched: interval[0]
    }
  }

  for (const [word, day] of Object.entries(DAY_WORDS)) {
    const re = new RegExp(`\\bevery\\s+${word}\\b`)
    const hit = re.exec(lower)
    if (!hit) continue
    return {
      event: 'schedule.weekly',
      schedule: {
        ...DEFAULT_SCHEDULE,
        days: [day],
        minuteOfDay: parseClock(lower) ?? MINUTE_OF.morning
      },
      matched: hit[0]
    }
  }

  const weekday = /\bevery\s+(?:week\s?day|working\s+day)\b/.exec(lower)
  if (weekday) {
    return {
      event: 'schedule.daily',
      schedule: {
        ...DEFAULT_SCHEDULE,
        days: [...WEEKDAYS],
        minuteOfDay: parseClock(lower) ?? MINUTE_OF.morning
      },
      matched: weekday[0]
    }
  }

  for (const [word, minute] of Object.entries(MINUTE_OF)) {
    const re = new RegExp(`\\b(?:every|each)\\s+${word}\\b`)
    const hit = re.exec(lower)
    if (!hit) continue
    return {
      event: 'schedule.daily',
      schedule: { ...DEFAULT_SCHEDULE, days: [], minuteOfDay: parseClock(lower) ?? minute },
      matched: hit[0]
    }
  }

  const daily = /\b(?:every\s+day|each\s+day|daily)\b/.exec(lower)
  if (daily) {
    return {
      event: 'schedule.daily',
      schedule: {
        ...DEFAULT_SCHEDULE,
        days: [],
        minuteOfDay: parseClock(lower) ?? MINUTE_OF.morning
      },
      matched: daily[0]
    }
  }

  const weekly = /\b(?:every\s+week|weekly)\b/.exec(lower)
  if (weekly) {
    return {
      event: 'schedule.weekly',
      schedule: {
        ...DEFAULT_SCHEDULE,
        days: [1],
        minuteOfDay: parseClock(lower) ?? MINUTE_OF.morning
      },
      matched: weekly[0]
    }
  }

  return null
}

interface EventMatch {
  event: TriggerEventType
  condition: string | null
  matched: string
}

/** Event phrases, longest and most specific first. */
const EVENT_PHRASES: { re: RegExp; event: TriggerEventType }[] = [
  { re: /\bwhen(?:ever)?\s+(?:a\s+)?(?:new\s+)?file\s+is\s+created\b/, event: 'file.created' },
  { re: /\bwhen(?:ever)?\s+(?:a\s+)?file\s+is\s+deleted\b/, event: 'file.deleted' },
  { re: /\b(?:when(?:ever)?|after|on)\s+(?:a\s+)?commit\b/, event: 'git.changed' },
  { re: /\bwhen(?:ever)?\s+(?:the\s+)?(?:git|branch|working\s+tree)\b[^.]*\bchang/, event: 'git.changed' },
  { re: /\bwhen(?:ever)?\s+[^.]*\bfails?\b/, event: 'agent.error' },
  { re: /\bwhen(?:ever)?\s+[^.]*\b(?:errors?|breaks?)\b/, event: 'agent.error' },
  { re: /\bwhen(?:ever)?\s+[^.]*\b(?:finish|complete)/, event: 'agent.task.completed' },
  { re: /\bwhen(?:ever)?\s+[^.]*\b(?:goes\s+)?idle\b/, event: 'agent.idle' },
  { re: /\bwhen(?:ever)?\s+[^.]*\bchang/, event: 'file.changed' }
]

/** A quoted string or a filename, used as the IF condition. */
function parseCondition(text: string): string | null {
  const quoted = /["“']([^"”']{2,60})["”']/.exec(text)
  if (quoted) return quoted[1]
  const file = /\b([\w.-]+\.(?:json|ts|tsx|js|jsx|yml|yaml|toml|lock|md|env))\b/i.exec(text)
  if (file) return file[1]
  return null
}

function parseEvent(text: string): EventMatch | null {
  const lower = text.toLowerCase()
  for (const { re, event } of EVENT_PHRASES) {
    const hit = re.exec(lower)
    if (!hit) continue
    return { event, condition: parseCondition(text), matched: hit[0].trim() }
  }
  return null
}

function parseAction(text: string): { action: TriggerActionType; matched: string } {
  const lower = text.toLowerCase()
  if (/\breview\b/.test(lower)) return { action: 'request.review', matched: 'review' }
  if (/\b(?:just\s+)?(?:notify|tell|remind|alert|let\s+me\s+know|ping)\s+me\b/.test(lower)) {
    return { action: 'notify.user', matched: 'notify me' }
  }
  if (/\b(?:send|pass|forward)\s+(?:a\s+)?(?:message|note)\b/.test(lower)) {
    return { action: 'send.message', matched: 'send a message' }
  }
  return { action: 'create.task', matched: 'give them a task' }
}

/**
 * Which agents the sentence names.
 *
 * Whole-word, case-insensitive, and only against the roster it is handed —
 * which is already the open project's. There is no path here by which naming
 * an agent from another project could select one, because no such agent is in
 * the list.
 */
function parseAgents(text: string, agents: NlAgent[]): { ids: string[]; names: string[] } {
  const ids: string[] = []
  const names: string[] = []
  for (const agent of agents) {
    const name = agent.name.trim()
    if (!name) continue
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (re.test(text)) {
      ids.push(agent.id)
      names.push(name)
    }
  }
  if (ids.length === 0 && /\b(?:everyone|all\s+agents|the\s+team|whole\s+team)\b/i.test(text)) {
    for (const agent of agents) {
      ids.push(agent.id)
      names.push(agent.name)
    }
  }
  return { ids, names }
}

/**
 * The instruction, with the scaffolding taken off.
 *
 * "Every morning ask Walter to review the latest git changes" becomes "review
 * the latest git changes" — the part that is actually sent to the agent. What
 * is stripped is only what the parser has already turned into structure, so
 * nothing meaningful is silently dropped.
 */
function extractMessage(text: string, agentNames: string[], timeMatched?: string): string {
  let out = text.trim()

  if (timeMatched) out = out.replace(new RegExp(timeMatched, 'i'), ' ')
  out = out
    .replace(/^\s*(?:please\s+)?/i, '')
    .replace(/\b(?:every|each)\s+(?:morning|afternoon|evening|night|day|week|weekday)\b/gi, ' ')
    .replace(/\bat\s+\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\b/gi, ' ')
    .replace(/\b(?:ask|get|have|tell|make)\b/gi, ' ')

  for (const name of agentNames) {
    out = out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ')
  }

  out = out
    .replace(/^[\s,]*to\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;-]+/, '')
    .trim()

  if (!out) return text.trim()
  return out.charAt(0).toUpperCase() + out.slice(1)
}

/** A short, human title for the automation. */
function titleFor(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim()
  if (!flat) return 'Automation'
  const short = flat.length > 42 ? `${flat.slice(0, 41).trimEnd()}…` : flat
  return short.charAt(0).toUpperCase() + short.slice(1)
}

/**
 * Turn a sentence into a draft automation.
 *
 * Always returns something. A sentence it understands nothing of becomes a
 * manual automation with the sentence as its instruction, which is a perfectly
 * usable starting point and far better than an error message — the user is
 * about to see the whole configuration and can change any of it.
 */
export function parseAutomation(text: string, agents: NlAgent[]): NlDraft {
  const input = String(text ?? '').trim()
  const matched: string[] = []
  const missing: string[] = []

  const time = parseTime(input)
  const evt = time ? null : parseEvent(input)

  if (time) matched.push(`when: ${time.matched}`)
  else if (evt) matched.push(`when: ${evt.matched}`)
  else missing.push('when it should run')

  const { ids, names } = parseAgents(input, agents)
  if (names.length > 0) matched.push(`who: ${names.join(', ')}`)

  const { action, matched: actionWord } = parseAction(input)
  matched.push(`do: ${actionWord}`)

  if (ids.length === 0 && action !== 'notify.user') missing.push('which agent should do it')

  const message = extractMessage(input, names, time?.matched)

  return {
    name: titleFor(message),
    event: time ? time.event : (evt?.event ?? 'manual'),
    schedule: time ? time.schedule : null,
    action,
    agentIds: ids,
    message,
    condition: evt?.condition ?? null,
    matched,
    missing
  }
}
