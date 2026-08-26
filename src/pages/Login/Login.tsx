import { useSyncExternalStore } from 'react'
import { useAuth } from '../../stores/authStore'
import { useBackstage } from '../../stores/backstageStore'
import { useWorldEngine } from '../../world/useWorldEngine'
import { showcaseRuntime } from '../../agents/showcase'
import { defaultThemeId } from '../../themes'
import { PixelMark } from '../../components/Header/PixelMark'
import { GoogleButton } from '../../components/Auth/GoogleButton'
import { LoginWorld } from './LoginWorld'

/**
 * The way in.
 *
 * Two halves that say the same thing in different languages. On the left the
 * office is already running — the real world engine, the real cast, the real
 * ambient behaviour — because the product's claim is "your team is already at
 * work", and a login screen that opens onto an empty gradient contradicts it
 * before the user has clicked anything. On the right, one button.
 *
 * The card is sized so the world stays visible past it rather than being
 * reduced to a texture behind a modal. That balance is the design: this is a
 * door into a place, and you can see the place through it.
 */

/**
 * An empty roster, which `projectCast` reads as "the whole cast".
 *
 * A module constant rather than an inline `[]`, so the world engine's memo
 * sees a stable reference and does not rebake every sprite sheet each render.
 */
const EVERYONE: string[] = []

export function Login() {
  const status = useAuth((s) => s.status)
  const signingIn = useAuth((s) => s.signingIn)
  const error = useAuth((s) => s.error)
  const configured = useAuth((s) => s.configured)
  const signInWithGoogle = useAuth((s) => s.signInWithGoogle)
  const cancelSignIn = useAuth((s) => s.cancelSignIn)
  const dismissError = useAuth((s) => s.dismissError)

  const exitToLanding = useBackstage((s) => s.exitToLanding)

  /*
   * The default world, not a project's.
   *
   * Nobody is signed in, so there is no project, no roster and no chosen
   * theme — and reaching for one would be the login page reading state that
   * belongs to an account it has not identified yet. The default world's cast
   * is the same one the user just watched on the landing page, which is the
   * point: they are walking further into the same building.
   */
  const { theme, engine } = useWorldEngine(
    defaultThemeId,
    EVERYONE,
    showcaseRuntime
  )

  // Only for the count in the caption; the canvas itself is driven by the
  // engine and re-renders nothing.
  const agents = useSyncExternalStore(engine.subscribeViews, engine.getViews)
  const busy = agents.filter(
    (a) => a.status === 'working' || a.status === 'thinking'
  ).length

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      {/*
        A header that matches the landing page's, so arriving here reads as
        walking through a door in the same building rather than being handed
        off to an authentication product.
      */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b-[3px] border-ink bg-cream px-5">
        <div className="flex items-center gap-3">
          <PixelMark />
          <span className="font-pixel text-xl font-bold uppercase tracking-[-0.01em] text-ink">
            Backstage
          </span>
        </div>

        <button
          type="button"
          onClick={exitToLanding}
          className="border-2 border-ink bg-paper px-2.5 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:bg-brand-pale hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
        >
          ← Back
        </button>
      </header>

      {/*
        `items-stretch` on the row rather than `items-center`, so the office
        fills the height it is given instead of sitting as a fixed-height panel
        with dead space above and below it. The card centres itself inside its
        own column, which keeps it at eye level however tall the window is.
      */}
      <main className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-6 py-8 lg:flex-row lg:items-stretch lg:gap-12 lg:px-10">
        {/* ------------------------------------------------- the world -- */}

        {/*
          Hidden below `lg` rather than shrunk.

          A narrow window cannot hold both a readable card and a room with
          people walking about in it, and the half that has to survive is
          obvious — requirement 38 is explicit that the pixel environment
          carries no information that exists only visually, which is what makes
          dropping it a legitimate answer rather than a loss.
        */}
        <section
          aria-hidden
          className="relative hidden min-h-[320px] flex-1 border-[4px] border-ink bg-ink shadow-[8px_8px_0_0_var(--color-brand-shadow)] lg:block"
        >
          <LoginWorld engine={engine} />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t-[3px] border-ink-3 bg-ink px-3 py-2">
            <span className="border-2 border-brand-shadow bg-brand px-2 py-0.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
              {theme.name}
            </span>
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-dim">
              {busy} working · {agents.length} in the office
            </span>
          </div>
        </section>

        {/* -------------------------------------------------- the card -- */}

        <section className="mx-auto flex w-full max-w-[420px] shrink-0 flex-col justify-center lg:mx-0 lg:w-[420px]">
          <div className="border-[3px] border-ink bg-paper p-7 shadow-[6px_6px_0_0_var(--color-brand-shadow)] sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <PixelMark size={32} />
              <span className="font-pixel text-2xl font-bold uppercase tracking-[-0.01em] text-ink">
                Backstage
              </span>
            </div>

            <h1 className="font-ui text-[26px] font-extrabold uppercase leading-[1.05] tracking-[-0.03em] text-ink">
              Welcome to Backstage
            </h1>
            <p className="mt-2 font-ui text-[15px] leading-[1.6] text-ink-3">
              Your AI team has been waiting.
            </p>

            <div className="pixel-rule my-6" />

            {configured ? (
              <>
                <GoogleButton
                  onClick={() => void signInWithGoogle()}
                  loading={signingIn}
                />

                {/*
                  Live region, so the state change is announced rather than
                  only shown. `polite` because none of it interrupts anything
                  the user is in the middle of.
                */}
                <div aria-live="polite" className="mt-4">
                  {signingIn && (
                    <div className="border-2 border-rule bg-cream px-3 py-2.5">
                      <p className="font-ui text-[13px] leading-snug text-ink-3">
                        We&rsquo;ve opened your browser. Finish signing in with
                        Google and Backstage will pick it up from there.
                      </p>
                      <button
                        type="button"
                        onClick={() => void cancelSignIn()}
                        className="mt-2 font-ui text-[12px] font-semibold text-ink underline decoration-brand-deep decoration-2 underline-offset-2 hover:text-brand-shadow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/*
                    The failure surface. Backstage's own words and Backstage's
                    own frame — the underlying Supabase or Google message names
                    grant types and endpoints, tells the user nothing they can
                    act on, and is logged to the console for whoever can.
                  */}
                  {!signingIn && error && (
                    <div
                      role="alert"
                      className="border-2 border-rust bg-cream px-3 py-2.5"
                    >
                      <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.08em] text-rust">
                        Sign-in failed
                      </p>
                      <p className="mt-1 font-ui text-[13px] leading-snug text-ink">
                        {error.message}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          dismissError()
                          void signInWithGoogle()
                        }}
                        className="mt-2.5 border-2 border-ink bg-brand px-3 py-1 font-pixel text-[11px] font-bold uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-75 hover:bg-brand-lite active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /*
               * No credentials on this machine. Showing a Google button that
               * cannot work would send the user to check their internet
               * connection for a problem that is a missing file.
               */
              <div role="alert" className="border-2 border-rust bg-cream px-3 py-3">
                <p className="font-pixel text-[11px] font-bold uppercase tracking-[0.08em] text-rust">
                  Not configured yet
                </p>
                <p className="mt-1.5 font-ui text-[13px] leading-snug text-ink">
                  Backstage has no Supabase credentials. Add{' '}
                  <code className="font-mono text-[12px]">SUPABASE_URL</code> and{' '}
                  <code className="font-mono text-[12px]">SUPABASE_ANON_KEY</code>{' '}
                  to a <code className="font-mono text-[12px]">.env</code> file in
                  the project root, then restart.
                </p>
                <p className="mt-1.5 font-ui text-[13px] leading-snug text-ink-3">
                  Full instructions are in{' '}
                  <span className="font-mono text-[12px]">
                    SUPABASE_GOOGLE_AUTH_SETUP.md
                  </span>
                  .
                </p>
              </div>
            )}

            <p className="mt-6 font-ui text-[12px] leading-[1.6] text-ink-3">
              Signing in creates your Backstage account and keeps your projects,
              agents and conversations to yourself. Your source code stays on
              this machine.
            </p>
          </div>

          {/*
            The world's caption, in text.

            Requirement 38: nothing on this page may exist only as pixels. The
            office on the left is atmosphere, and this is the same statement
            written down for anyone who is not seeing it.
          */}
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3 lg:text-left">
            {status === 'initialising'
              ? 'Checking for a saved session…'
              : `${theme.name} — a simulated office`}
          </p>
        </section>
      </main>
    </div>
  )
}
