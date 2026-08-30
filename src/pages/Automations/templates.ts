import type { Trigger } from '../../shared/providerApi'
import { WEEKDAYS } from '../../shared/schedule'

/**
 * Starting points.
 *
 * Every one of these is built from a trigger the scheduler or the event engine
 * genuinely fires and an action the runtime genuinely performs. There is no
 * "coming soon" template and no template that quietly does less than it says —
 * an automation library whose examples do not work is worse than an empty one,
 * because the user's first experience of the feature is it failing.
 *
 * Deliberately not stored anywhere. A template is a partial `Trigger` handed
 * to the builder as its initial state; the user always sees the whole thing
 * before it is saved, and editing one produces an ordinary automation with no
 * memory of where it came from.
 */

export interface AutomationTemplate {
  id: string
  title: string
  /** The one-line version, in the shape the card shows it. */
  when: string
  blurb: string
  /** Whether it needs one agent or reads better with a team. */
  wants: 'one' | 'team'
  draft: Partial<Trigger>
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'daily-review',
    title: 'Daily code review',
    when: 'Every weekday · 18:00',
    blurb: "Review the day's changes and summarise anything suspicious.",
    wants: 'one',
    draft: {
      name: 'Daily code review',
      event: 'schedule.daily',
      schedule: { minuteOfDay: 18 * 60, days: [...WEEKDAYS], everyMinutes: 60 },
      action: 'create.task',
      message:
        "Review today's changes in this workspace with git, and summarise anything that looks risky, unfinished or accidental. Be specific about files and lines.",
      permissionMode: 'inherit'
    }
  },
  {
    id: 'morning-git',
    title: 'Morning git catch-up',
    when: 'Every day · 09:00',
    blurb: 'Read the latest commits and say what changed while you were away.',
    wants: 'one',
    draft: {
      name: 'Morning git catch-up',
      event: 'schedule.daily',
      schedule: { minuteOfDay: 9 * 60, days: [], everyMinutes: 60 },
      action: 'create.task',
      message:
        'Look at the most recent commits and the current working tree, then tell me in a few lines what changed and whether anything needs my attention.',
      permissionMode: 'inherit'
    }
  },
  {
    id: 'dependency-watch',
    title: 'Dependency watch',
    when: 'When package.json changes',
    blurb: 'Review dependency changes and flag anything that could break.',
    wants: 'one',
    draft: {
      name: 'Dependency watch',
      event: 'file.changed',
      condition: 'package.json',
      action: 'request.review',
      message:
        'The dependency manifest changed. Read it, work out what was added, removed or upgraded, and flag anything that looks like a breaking change.',
      /*
       * Strict, because this one reacts to a file changing rather than to the
       * user asking — and reviewing a manifest is exactly the situation where
       * an agent decides to try installing something.
       */
      permissionMode: 'strict'
    }
  },
  {
    id: 'commit-review',
    title: 'Review after every commit',
    when: 'When git state changes',
    blurb: 'Have a second agent look over what was just committed.',
    wants: 'one',
    draft: {
      name: 'Commit review',
      event: 'git.changed',
      action: 'request.review',
      message:
        'Review the most recent commit. Report anything incorrect, unsafe or left half-finished, and say plainly if it looks fine.',
      cooldownMs: 300_000,
      permissionMode: 'inherit'
    }
  },
  {
    id: 'failure-triage',
    title: 'Triage a failure',
    when: 'When an agent fails',
    blurb: 'Send the error to someone else to work out the likely cause.',
    wants: 'one',
    draft: {
      name: 'Failure triage',
      event: 'agent.error',
      action: 'create.task',
      message:
        'Another agent failed with the error below. Work out the likely cause and say what you would do about it. Do not change anything yet.',
      permissionMode: 'strict'
    }
  },
  {
    id: 'team-standup',
    title: 'Team stand-up',
    when: 'Every weekday · 09:30',
    blurb: 'Ask the whole team what they see in the project this morning.',
    wants: 'team',
    draft: {
      name: 'Team stand-up',
      event: 'schedule.daily',
      schedule: { minuteOfDay: 9 * 60 + 30, days: [...WEEKDAYS], everyMinutes: 60 },
      action: 'create.task',
      message:
        'Take a look at the project from your own angle and report the one thing you think most needs attention today. Keep it to a few lines.',
      permissionMode: 'inherit'
    }
  }
]
