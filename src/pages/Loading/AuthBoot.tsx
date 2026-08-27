import { PixelMark } from '../../components/Header/PixelMark'

/**
 * The frame before the app knows who you are.
 *
 * Deliberately its own surface rather than "show Home and correct it later".
 * On launch the main process is reading an encrypted session file and, if the
 * access token has expired, refreshing it — and until that answers there is
 * genuinely no correct thing to render. Guessing and correcting is how you get
 * the flash requirement 28 rules out: the project list appearing, then Home,
 * or worse Home appearing to somebody who was already signed in.
 *
 * It renders in two situations, and it is the honest answer in both:
 *
 *   before the session resolves   nothing is known yet
 *   after it resolves, on a       the session is known, the user is signed in,
 *   public view                   and initialisation is what happens next
 *
 * In practice it is on screen for a single IPC round trip, because the main
 * process resolves the session before the window is created at all. It is
 * visible for longer in exactly the case where it earns its place: a launch
 * where the stored token has expired and the refresh is going over a slow
 * network.
 *
 * Nothing here is on a timer. There is no minimum duration, no scripted
 * progress bar and no artificial delay — requirement 27 is explicit, and a
 * splash that holds for a fixed five seconds is a splash that is lying about
 * what the application is doing for four of them. It is on screen while real
 * work is happening and gone the instant it is not.
 */

/**
 * The floor the mark sits on, drawn as a strip of pixels.
 *
 * A row of blocks rather than a progress bar, and the difference matters: a
 * bar implies a proportion, and there is no proportion to report — the app is
 * waiting on one answer that either has arrived or has not. Blocks lighting in
 * sequence say "something is happening" and claim nothing else.
 */
const BLOCKS = [0, 1, 2, 3, 4]

export function AuthBoot() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-cream px-6">
      <div className="flex flex-col items-center">
        <div className="bob flex items-center gap-3">
          <PixelMark size={32} />
          <span className="font-pixel text-2xl font-bold uppercase tracking-[-0.01em] text-ink">
            Backstage
          </span>
        </div>

        {/*
          The blocks run on a stepped keyframe with a staggered delay, so they
          light one at a time on the pixel grid rather than easing. Purely
          decorative, and `aria-hidden` — the status line below is what a
          screen reader is given, and it says the same thing in words.
        */}
        <div aria-hidden className="mt-7 flex gap-1.5">
          {BLOCKS.map((i) => (
            <span
              key={i}
              className="blink h-2 w-2 bg-brand-deep"
              style={{ animationDelay: `${i * 140}ms`, animationDuration: '1.4s' }}
            />
          ))}
        </div>

        <p
          role="status"
          className="mt-6 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3"
        >
          Setting up backstage
        </p>
      </div>
    </div>
  )
}
