import type { ReactNode } from 'react'

interface Props {
  title: string
  lead: string
  children?: ReactNode
}

/**
 * The shell every non-Home page sits in, so the sections that are not built
 * yet still feel like part of the same product rather than blank routes.
 */
export function PagePlaceholder({ title, lead, children }: Props) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-cream px-8 py-10">
      <div className="mx-auto max-w-[1100px]">
        <h1 className="font-ui text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.04em] text-ink">
          {title}
        </h1>
        <p className="mt-3 max-w-[520px] font-ui text-[15px] leading-[1.6] text-ink-3">
          {lead}
        </p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}
