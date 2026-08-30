import { getActiveProjectId } from '../projects/projectStore'
import { getSettings } from './settingsStore'
import { listTriggers } from './triggerStore'
import { isDue } from './schedule'
import { runAutomation } from './automationRunner'

/**
 * Time-based automations.
 *
 * A single timer for the whole application, ticking once a minute. There is no
 * per-automation `setTimeout`: a timer scheduled twelve hours out is a timer
 * that silently disappears when the machine sleeps, and "the daily review did
 * not run because the laptop lid was shut" is indistinguishable from a bug.
 * Polling a stored `nextRunAt` survives sleep, and a missed window fires once
 * on wake rather than producing a backlog.
 *
 * Two things it deliberately does not do:
 *
 *   It never crosses a project boundary. `listTriggers` is scoped to the open
 *   project, so a scheduled automation belonging to a project that is not open
 *   simply does not run — it is not queued, deferred or run against whatever
 *   folder happens to be current. That is the only correct answer: an
 *   automation is a statement about a workspace, and running it against a
 *   different one would be worse than not running it at all.
 *
 *   It never runs while AUTO collaboration is off. That switch is the master
 *   control on anything that spends money without being asked, and a schedule
 *   is the most unattended spending there is.
 */

/** Once a minute. Schedules have minute resolution; anything finer is waste. */
const TICK_MS = 60_000

let timer: NodeJS.Timeout | null = null

function tick(): void {
  try {
    if (!getActiveProjectId()) return
    if (!getSettings().autoCollaboration) return

    const now = Date.now()
    for (const trigger of listTriggers()) {
      if (!trigger.enabled) continue
      if (!isDue(trigger.event, trigger.nextRunAt, now)) continue
      /*
       * `runAutomation` advances the schedule itself, and refuses when the
       * previous run is still going. Both matter here: without the first this
       * would fire every minute until the clock passed the window, and without
       * the second a slow automation would stack.
       */
      runAutomation(trigger, { origin: 'schedule' })
    }
  } catch {
    // A broken automation must never stop the scheduler for the others.
  }
}

export function initScheduler(): void {
  disposeScheduler()
  timer = setInterval(tick, TICK_MS)
  // Do not hold the app open for a timer that only ever checks a clock.
  timer.unref?.()
}

export function disposeScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

/** Exposed for the tests and for a manual sweep after a project opens. */
export function sweepNow(): void {
  tick()
}
