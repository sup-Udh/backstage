import { PixelMark } from '../../components/Header/PixelMark'

/**
 * The frame before the app knows who you are.
 *
 * Deliberately its own surface rather than "show the landing page and correct
 * it later". On launch the main process is reading an encrypted session file
 * and, if the access token has expired, refreshing it — and until that answers
 * there is genuinely no correct thing to render. Guessing and correcting is
 * how you get the flash requirement 11 rules out: the dashboard appearing,
 * then the login page, or worse the login page appearing to somebody who was
 * already signed in.
 *
 * In practice this is on screen for a single IPC round trip, because the main
 * process resolves the session before the window is created at all. It is
 * visible for longer in exactly the case where it earns its place: a launch
 * where the stored token has expired and the refresh is going over a slow
 * network.
 */
export function AuthBoot() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-cream px-6">
      <div className="flex items-center gap-3">
        <PixelMark />
        <span className="font-pixel text-2xl font-bold uppercase tracking-[-0.01em] text-ink">
          Backstage
        </span>
      </div>

      <p
        className="mt-6 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3"
        role="status"
      >
        <span aria-hidden className="blink mr-2 text-brand-deep">
          ✦
        </span>
        Checking your session
      </p>
    </div>
  )
}
