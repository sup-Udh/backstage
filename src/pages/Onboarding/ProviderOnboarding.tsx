import { useState } from 'react'
import { useProviders } from '../../providers/useProviders'
import { useAuth } from '../../stores/authStore'
import { useBackstage } from '../../stores/backstageStore'
import { useProject } from '../../stores/projectStore'
import { PixelMark } from '../../components/Header/PixelMark'
import { ProviderPanel } from '../Account/ProviderPanel'
import { ClaudeCard } from '../../claude/ClaudeCard'

/**
 * Connect your AI team.
 *
 * Shown once per account per machine, straight after the first Google sign-in.
 * Its job is narrow: get the user past the one thing that makes Backstage look
 * broken on first run — an office full of agents, none of which can be spawned
 * because no provider is connected, with the explanation three pages away in
 * settings.
 *
 * Two rules shape it:
 *
 *   nothing is required   a user with one provider connects one. A user with
 *                         none skips, and the application opens anyway. Blocking
 *                         entry on an API key would mean a new user's first
 *                         experience of the product is a form they cannot fill
 *                         in, and the roster page already explains, per agent,
 *                         exactly why it cannot start.
 *   it never comes back   skipping counts as being onboarded. The same controls
 *                         live permanently in Settings → AI Providers, so
 *                         re-offering this every launch is nagging, not help.
 *
 * The cards are the *same* `ProviderPanel` the settings page uses, so a key
 * entered here is handled by exactly the code that handles one entered later:
 * verified against the provider before being stored, then encrypted into this
 * account's own credential directory by the main process. Nothing about the
 * key touches this file.
 */
export function ProviderOnboarding() {
  const user = useAuth((s) => s.user)
  const showProjects = useBackstage((s) => s.showProjects)
  const showSetup = useBackstage((s) => s.showSetup)

  const {
    descriptors,
    statuses,
    busy,
    results,
    connect,
    test,
    disconnect,
    selectModel
  } = useProviders()

  const [leaving, setLeaving] = useState(false)

  const connectedCount = statuses.filter((s) => s.hasKey).length

  /**
   * Mark onboarding done and go in.
   *
   * The same call for "save & continue" and for "skip", because they are the
   * same event as far as the account is concerned: this screen has been
   * offered. What differs is only whether the user happened to connect
   * anything while it was on screen.
   */
  const finish = async () => {
    setLeaving(true)
    try {
      await window.backstage?.auth.completeOnboarding()
    } finally {
      /*
       * Where onboarding hands over to is the same decision the walk-in makes:
       * pick a project if there is one, otherwise build one. Re-read rather
       * than captured, because `bootstrap` ran before this screen mounted.
       */
      const { projects } = useProject.getState()
      if (projects.length > 0) showProjects()
      else showSetup()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      <header className="flex h-16 shrink-0 items-center justify-between border-b-[3px] border-ink px-5">
        <div className="flex items-center gap-3">
          <PixelMark />
          <span className="font-pixel text-xl font-bold uppercase tracking-[-0.01em] text-ink">
            Backstage
          </span>
          <span className="ml-2 border-2 border-ink bg-brand px-2 py-0.5 font-pixel text-[10px] font-semibold uppercase tracking-[0.08em] text-on-brand">
            Setup
          </span>
        </div>

        <button
          type="button"
          onClick={() => void finish()}
          disabled={leaving}
          className="border-2 border-rule px-3 py-1.5 font-pixel text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:border-ink hover:text-ink disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
        >
          Skip for now
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[820px]">
          <p className="font-pixel text-sm font-semibold uppercase tracking-[0.1em] text-brand-deep">
            Welcome to Backstage{user ? `, ${firstName(user.displayName)}` : ''}
          </p>
          <h1 className="mt-1 font-ui text-3xl font-extrabold uppercase leading-[1.05] tracking-[-0.03em] text-ink">
            Let&rsquo;s connect your AI team
          </h1>
          <p className="mt-3 max-w-[620px] font-ui text-[15px] leading-[1.6] text-ink-3">
            Your agents run on your own provider accounts. Connect the ones you
            have — you don&rsquo;t need all of them, and you can add the rest
            later in Settings.
          </p>

          {/*
            Said here rather than buried in a document, because this is the
            screen where a user hands the application a credential and is
            entitled to know what happens to it.
          */}
          <p className="mt-4 max-w-[620px] border-2 border-rule bg-paper px-3 py-2 font-ui text-[12px] leading-snug text-ink-3">
            Keys are encrypted by your operating system and stored on this
            machine, under your account. They are never uploaded, never shown
            back to you in full, and never shared with another Backstage user —
            not even someone else signing in on this computer.
          </p>

          <div className="mt-8 flex flex-col gap-6">
            {descriptors.map((descriptor) => (
              <ProviderPanel
                key={descriptor.id}
                descriptor={descriptor}
                provider={statuses.find((s) => s.id === descriptor.id)}
                result={results[descriptor.id]}
                /* Nobody has agents yet on first run; the count is honest. */
                agentCount={0}
                busy={busy}
                onConnect={connect}
                onTest={test}
                onDisconnect={disconnect}
                onSelectModel={selectModel}
              />
            ))}

            {/*
              Claude Code is not an API key, so it is not a ProviderPanel — it
              is a CLI Backstage detects rather than authenticates. Shown here
              anyway, because "which AI can I use" is the question this screen
              answers and leaving it out would imply the answer is two.
            */}
            <ClaudeCard />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 border-t-[3px] border-rule pt-6">
            <button
              type="button"
              onClick={() => void finish()}
              disabled={leaving}
              className="border-[3px] border-ink bg-brand px-6 py-2.5 font-pixel text-base font-bold uppercase tracking-[0.04em] text-on-brand shadow-[4px_4px_0_0_var(--color-shadow)] transition-transform duration-75 hover:bg-brand-lite active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_var(--color-shadow)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep"
            >
              {leaving ? 'Opening…' : 'Continue'}
            </button>

            <p className="font-ui text-[13px] text-ink-3" aria-live="polite">
              {connectedCount === 0
                ? 'Nothing connected yet — you can still go in and set this up later.'
                : `${connectedCount} provider${connectedCount === 1 ? '' : 's'} connected.`}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

/** The first word of a display name, for a greeting that is not a full name. */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName
}
