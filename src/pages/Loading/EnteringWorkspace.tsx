import { useEffect, useState } from 'react'
import { useBackstage } from '../../stores/backstageStore'
import { useAuth } from '../../stores/authStore'
import { useProject } from '../../stores/projectStore'
import { getTheme } from '../../themes'
import { PixelMark } from '../../components/Header/PixelMark'
import { WalkingCharacter } from './WalkingCharacter'

/**
 * The walk in.
 *
 * Every line on this screen is a real step. The app genuinely has to verify
 * stored provider keys, read the project registry, resolve a workspace folder
 * and load a roster before the office can be rendered, and each of those is
 * reported as it finishes rather than being animated on a timer. A loading
 * screen that invents its own progress is a loading screen that lies the first
 * time something is slow.
 *
 * It is allowed to be *slower* than the work, never faster: a screen that
 * appears for 90ms and vanishes reads as a flicker, so the walk holds for a
 * moment. If initialisation outruns that, the transition happens the instant
 * it settles.
 */

/** How long the walk holds even when everything was already warm. */
const MIN_MS = 1400

/**
 * How long to wait before going on regardless.
 *
 * A provider key is verified over the network, and a slow or unreachable one
 * would otherwise hold the user on a loading screen indefinitely. Nothing past
 * this point needs the check to have finished — an unverified provider shows
 * as disconnected, which the roster page already explains.
 */
const MAX_MS = 5000

interface Step {
  label: string
  done: boolean
}

export function EnteringWorkspace() {
  const showProjects = useBackstage((s) => s.showProjects)
  const showSetup = useBackstage((s) => s.showSetup)
  const showOnboarding = useBackstage((s) => s.showOnboarding)
  const signOut = useAuth((s) => s.signOut)

  const bootstrap = useProject((s) => s.bootstrap)
  const adoptLegacy = useProject((s) => s.adoptLegacy)

  /*
   * Two steps, because two things happen. There used to be a third, "Assembling
   * team", from when this screen also opened a project and loaded its roster —
   * it now hands over to the picker instead, and a step that reports work
   * nobody is doing is exactly the invented progress the note above rejects.
   */
  const [steps, setSteps] = useState<Step[]>([
    { label: 'Initialising workspace', done: false },
    { label: 'Finding your projects', done: false }
  ])
  const [failed, setFailed] = useState<string | null>(null)

  /*
   * The theme the walk is drawn in.
   *
   * Not the project's — the project may not exist yet, and this screen has to
   * paint before the answer is known. The default world's first character is a
   * face the user has already seen on the landing page, which is the point.
   */
  const walker = getTheme().characters[0]

  /*
   * No "have I already run" guard here, deliberately, and it took a hang to
   * learn why.
   *
   * StrictMode mounts, unmounts and remounts every component in development.
   * A ref that latched on the first pass survived that remount, so the second
   * pass returned immediately — while the first pass's cleanup had already set
   * `live = false` and cleared the backstop below. Every callback the first
   * run owned then short-circuited, nothing was left to hand over, and the
   * walk-in screen sat there for ever. Production never showed it, because
   * production only mounts once.
   *
   * So the effect is written to be safe to run twice instead of being stopped
   * from running twice: each pass owns its own `live` flag and its own timers,
   * and the pass that is still mounted is the one that hands over. The work it
   * repeats is a disk read and a roster fetch, and adopting a legacy install
   * is refused by the main process once a project exists — running it again
   * costs a few milliseconds and changes nothing.
   */
  useEffect(() => {
    let live = true
    const startedAt = performance.now()

    const mark = (i: number) =>
      setSteps((prev) => prev.map((s, n) => (n === i ? { ...s, done: true } : s)))

    /** Hold the walk for its minimum, then hand over. */
    const handOver = (go: () => void) => {
      const elapsed = performance.now() - startedAt
      const wait = Math.max(0, MIN_MS - elapsed)
      window.setTimeout(() => {
        if (live) go()
      }, wait)
    }

    const run = async () => {
      /*
       * Step one: what is on disk. This also re-opens the stored project in
       * the main process, which is what points the workspace at it — so the
       * roster load below has something to be scoped to.
       */
      const { projects, legacy } = await bootstrap()
      if (!live) return
      mark(0)

      /*
       * Step two: pre-project state, if there is any.
       *
       * An install from before projects existed is folded into one here rather
       * than being shown the wizard. The user already has a workspace, a team
       * and a theme; asking them to choose all three again would be asking
       * them to re-enter what the app is looking straight at. It becomes an
       * ordinary project in the list, and they still choose it.
       *
       * Only when there is a team to keep, though. A folder with no agents
       * behind it is not a project anybody built — adopting it would open an
       * empty office and leave the user to hire everyone by hand, when the
       * wizard exists to do exactly that.
       */
      let known = projects
      if (known.length === 0 && legacy?.workspacePath && legacy.agentCount > 0) {
        await adoptLegacy(folderName(legacy.workspacePath))
        /*
         * Read the list back rather than trusting what adoption returned.
         * StrictMode runs this effect twice, and the main process refuses a
         * second adoption once a project exists — correctly, with a null that
         * means "already done" and not "failed". Taking that null at face
         * value would send the surviving pass to the wizard to build the
         * project the other pass had just built.
         */
        known = useProject.getState().projects
      }
      if (!live) return
      mark(1)

      /*
       * First run for this account, before anything else.
       *
       * Asked of the main process rather than inferred from "has no
       * providers", because those are different questions: a user who
       * deliberately skipped setup has no providers either, and showing them
       * this screen on every launch would be the app refusing to accept an
       * answer it already got.
       */
      const needsSetup = (await window.backstage?.auth.onboardingNeeded()) === true
      if (!live) return

      /*
       * And then the user chooses.
       *
       * Note what is *not* here: opening whatever was last active.
       * Initialisation finds out what exists; it does not decide which folder
       * a team is about to be given write access to. With nothing to choose
       * between, the wizard is the only honest destination.
       */
      handOver(
        needsSetup ? showOnboarding : known.length > 0 ? showProjects : showSetup
      )
    }

    void run().catch((err: unknown) => {
      if (!live) return
      setFailed(err instanceof Error ? err.message : 'Something went wrong.')
    })

    /*
     * The backstop. Whatever is still outstanding is left outstanding — the
     * surfaces that need it show their own empty state, which is a better
     * place to be stuck than here.
     */
    const cap = window.setTimeout(() => {
      if (!live) return

      /*
       * Setup is the answer when there is no main process to ask. The optional
       * chain used to be the whole story, which meant a renderer whose preload
       * had not attached evaluated to `undefined` and simply did nothing — a
       * backstop that quietly declined to fire is not a backstop.
       */
      const api = window.backstage?.projects
      if (!api) {
        showSetup()
        return
      }
      void api
        .list()
        .then((found) => (found.length > 0 ? showProjects() : showSetup()))
        .catch(() => showSetup())
    }, MAX_MS)

    return () => {
      live = false
      window.clearTimeout(cap)
    }
  }, [bootstrap, adoptLegacy, showProjects, showSetup, showOnboarding])

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-cream px-6">
      <div className="flex w-full max-w-[420px] flex-col items-center">
        <div className="flex items-center gap-3">
          <PixelMark />
          <span className="font-pixel text-2xl font-bold uppercase tracking-[-0.01em] text-ink">
            Backstage
          </span>
        </div>

        {/*
          The walk itself. A floor line rather than a progress bar: the
          character is crossing to the office, and a percentage would be
          claiming a precision none of these steps have.
        */}
        <div className="relative mt-10 h-[104px] w-full border-[3px] border-ink bg-paper shadow-[6px_6px_0_0_var(--color-brand-shadow)]">
          <WalkingCharacter appearance={walker.appearance} />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-[18px] h-[3px] bg-rule"
          />
        </div>

        <ul className="mt-8 w-full space-y-2" aria-live="polite">
          {steps.map((step, i) => {
            // The step in progress is the first one not yet done.
            const current = !step.done && steps.slice(0, i).every((s) => s.done)
            return (
              <li
                key={step.label}
                className={[
                  'flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em]',
                  step.done ? 'text-ink' : current ? 'text-ink-3' : 'text-rule'
                ].join(' ')}
              >
                <span aria-hidden className={current ? 'blink text-brand-deep' : ''}>
                  {step.done ? '◆' : current ? '✦' : '○'}
                </span>
                {step.label}
                {step.done && <span className="text-rule">— done</span>}
              </li>
            )
          })}
        </ul>

        {failed && (
          <div className="mt-6 w-full border-2 border-rust bg-paper px-3 py-2">
            <p className="font-ui text-[13px] leading-snug text-ink">{failed}</p>
            {/*
              Signing out, rather than "Back".
              
              There is nowhere back to. This screen only renders for a signed
              in user, and Home now bounces one straight here again — so a
              Back button would have walked the user in a circle through the
              very initialisation that had just failed. Ending the session is
              the one exit that is always available and always works.
            */}
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-2 border-2 border-ink bg-cream px-2.5 py-1 font-pixel text-[10px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-brand-pale focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** The last segment of a path, whichever separator it uses. */
function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
