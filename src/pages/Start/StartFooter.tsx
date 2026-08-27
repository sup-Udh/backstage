import { useBackstage } from '../../stores/backstageStore'
import { PixelButton } from '../../components/Button/PixelButton'

interface Props {
  /** The world on screen above, so the footer states what is being shown. */
  themeName: string
  castSize: number
}

/**
 * The end of the page, and the last chance to start.
 *
 * A footer rather than a fifth section: one line of identity, one repeat of
 * the primary action, one line saying what the office above actually was. That
 * last line matters more than it looks — everything on this screen is
 * simulated, and a start screen that has spent a page showing an office full
 * of busy agents owes the user a plain statement that none of them were real.
 */
export function StartFooter({ themeName, castSize }: Props) {
  const enterApp = useBackstage((s) => s.enterApp)

  return (
    <footer className="border-t-[3px] border-ink bg-slate px-6 py-10">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/*
            The wordmark alone, without the pixel mark beside it.

            The mark outlines itself in `ink`, and this plate is `slate` — the
            same colour in light mode. Putting it here would have drawn a
            yellow block whose frame had vanished, which is worse than not
            drawing it at all. The mark has the whole navigation bar; the
            footer has the name.
          */}
          <p className="font-pixel text-xl font-bold uppercase leading-none tracking-[-0.01em] text-brand">
            Backstage
          </p>
          <p className="mt-2.5 max-w-[46ch] font-ui text-[13px] leading-snug text-on-slate-2">
            Give your AI agents a place to work. Your projects, your keys and
            your source code stay on this machine.
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
            {themeName} · {castSize} characters · simulated office
          </p>
        </div>

        <PixelButton className="shrink-0" onClick={enterApp}>
          Get started
        </PixelButton>
      </div>
    </footer>
  )
}
