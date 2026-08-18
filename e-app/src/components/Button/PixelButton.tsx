import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: Variant
  size?: 'sm' | 'lg'
}

/**
 * A game-UI button, not a web button.
 *
 * The raised state is a hard offset shadow rather than a blur, and pressing
 * translates the button onto its own shadow so it physically sinks. No
 * transitions on the shadow itself, so the movement stays snappy and reads
 * as pixel art rather than as a CSS effect.
 */
export function PixelButton({
  children,
  variant = 'primary',
  size = 'lg',
  className = '',
  ...rest
}: Props) {
  const sizing =
    size === 'lg'
      ? 'px-8 py-3 text-lg tracking-[0.12em]'
      : 'px-4 py-2 text-sm tracking-[0.1em]'

  const skin =
    variant === 'primary'
      ? [
          'bg-brand text-ink border-ink',
          'hover:bg-brand-lite',
          'shadow-[4px_4px_0_0_var(--color-ink)]',
          'hover:shadow-[5px_5px_0_0_var(--color-ink)]',
          'hover:-translate-x-px hover:-translate-y-px',
          'active:shadow-[1px_1px_0_0_var(--color-ink)]',
          'active:translate-x-[3px] active:translate-y-[3px]'
        ].join(' ')
      : [
          'bg-paper text-ink border-ink',
          'hover:bg-brand-pale',
          'shadow-[3px_3px_0_0_var(--color-ink)]',
          'hover:shadow-[4px_4px_0_0_var(--color-ink)]',
          'hover:-translate-x-px hover:-translate-y-px',
          'active:shadow-[1px_1px_0_0_var(--color-ink)]',
          'active:translate-x-[2px] active:translate-y-[2px]'
        ].join(' ')

  return (
    <button
      {...rest}
      className={[
        'inline-flex items-center gap-2 border-[3px] font-bold uppercase',
        'font-pixel select-none cursor-pointer',
        'transition-transform duration-75 ease-linear',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-deep',
        sizing,
        skin,
        className
      ].join(' ')}
    >
      {children}
    </button>
  )
}
