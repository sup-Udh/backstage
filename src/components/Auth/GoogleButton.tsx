import { GoogleMark } from './GoogleMark'

interface Props {
  onClick: () => void
  loading?: boolean
  disabled?: boolean
}

/**
 * Continue with Google.
 *
 * Built as a Backstage control — hard 3px border, solid offset shadow, sinking
 * on press — around Google's own mark and Google's own wording. The frame is
 * ours; the identity inside it is theirs, and mixing those up would be the
 * button quietly implying it is a Backstage password field.
 *
 * The label is set in the readable UI face rather than the pixel one. Pixelify
 * Sans carries headings and world labels across the product, but this is the
 * single most consequential click in the application and legibility beats
 * house style at exactly one place.
 *
 * Three states, all real:
 *
 *   idle      raised, hover lifts, press sinks onto its own shadow
 *   loading   disabled, spinner, "Connecting to Google…" — requirement 30's
 *             answer to a button that looks broken while a browser opens
 *   disabled  Supabase is not configured, so the click cannot go anywhere
 */
export function GoogleButton({ onClick, loading = false, disabled = false }: Props) {
  const inert = loading || disabled

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inert}
      /*
       * `aria-busy` rather than only a visual spinner: a screen reader user
       * gets told the button is working, and the label below changes with it
       * so the announcement is the same information the sighted user has.
       */
      aria-busy={loading}
      aria-label={loading ? 'Connecting to Google' : 'Continue with Google'}
      className={[
        'group flex w-full items-center justify-center gap-3',
        'border-[3px] border-ink bg-paper px-5 py-3',
        'font-ui text-[15px] font-semibold tracking-[0.01em] text-ink',
        'select-none transition-transform duration-75 ease-linear',
        // The focus ring is the brand's deep gold on cream: a visible,
        // high-contrast indicator rather than the browser default outline,
        // which disappears entirely against a paper surface.
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep',
        inert
          ? 'cursor-not-allowed opacity-70 shadow-[3px_3px_0_0_var(--color-ink)]'
          : [
              'cursor-pointer',
              'hover:bg-brand-pale',
              'shadow-[4px_4px_0_0_var(--color-ink)]',
              'hover:shadow-[5px_5px_0_0_var(--color-ink)]',
              'hover:-translate-x-px hover:-translate-y-px',
              'active:shadow-[1px_1px_0_0_var(--color-ink)]',
              'active:translate-x-[3px] active:translate-y-[3px]'
            ].join(' ')
      ].join(' ')}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-[18px] w-[18px] shrink-0 animate-spin border-[3px] border-rule border-t-brand-deep"
        />
      ) : (
        <GoogleMark />
      )}

      <span>{loading ? 'Connecting to Google…' : 'Continue with Google'}</span>
    </button>
  )
}
