import type { Theme } from '../../themes/types'
import type { Op } from '../../world/pixel/ops'
import { disc } from '../../world/pixel/shapes'
import { PixelArt } from '../../world/PixelArt'

interface Props {
  theme: Theme
}

/**
 * What Backstage actually does, in four claims.
 *
 * Each one is something the application can be held to. There is no
 * "10× your productivity" here and no testimonials, because this is the start
 * screen of a tool the user has already downloaded — they are past being sold
 * to and are trying to work out what it is.
 *
 * The icons are drawn through the same pixel pipeline as the office, so the
 * accents on this section and the art in the world are literally the same
 * renderer at the same palette. That is the whole of the "pixel world second,
 * decoration third" rule: the personality shows up as 16-pixel marks beside
 * product copy, not as another room.
 */

const ICON = 16

/** A folder with a file in it: the workspace an agent is scoped to. */
const workspaceIcon: Op[] = [
  [1, 3, 6, 1, 'ink'],
  [1, 4, 14, 10, 'ink'],
  [2, 5, 12, 8, 'paper'],
  [4, 7, 8, 1, 'ink3'],
  [4, 9, 8, 1, 'ink3'],
  [4, 11, 5, 1, 'brandDeep']
]

/** Two heads, one handing to the other. Shoulders must touch or it reads as
    four loose squares. */
const teamIcon: Op[] = [
  [2, 2, 5, 5, 'ink'],
  [3, 3, 3, 3, 'brandLite'],
  [0, 7, 9, 8, 'ink'],
  [1, 8, 7, 6, 'brand'],
  [9, 2, 5, 5, 'ink'],
  [10, 3, 3, 3, 'brandLite'],
  [7, 7, 9, 8, 'ink'],
  [8, 8, 7, 6, 'brandDeep']
]

/** A prompt and a caret. */
const terminalIcon: Op[] = [
  [1, 2, 14, 12, 'ink'],
  [2, 3, 12, 10, 'screen'],
  [4, 6, 1, 1, 'brand'],
  [5, 7, 1, 1, 'brand'],
  [4, 8, 1, 1, 'brand'],
  [7, 9, 5, 1, 'brandDeep']
]

/** Three sockets on one bus: several providers, one team. */
const providerIcon: Op[] = [
  ...disc(4, 4, 2, 'brand'),
  ...disc(12, 4, 2, 'brandDeep'),
  ...disc(8, 12, 2, 'sage'),
  [4, 5, 1, 4, 'ink'],
  [12, 5, 1, 4, 'ink'],
  [4, 8, 9, 1, 'ink'],
  [8, 9, 1, 2, 'ink']
]

const CAPABILITIES = [
  {
    label: 'Real workspace',
    ops: workspaceIcon,
    note: 'Agents read, write and run inside one folder you choose. Nothing outside it is reachable.'
  },
  {
    label: 'Multi-agent',
    ops: teamIcon,
    note: 'A team lead breaks work down and hands it to the others, and you can watch the handover.'
  },
  {
    label: 'Terminal',
    ops: terminalIcon,
    note: 'A real PTY, not a log viewer. Claude Code, Codex and Gemini run as themselves.'
  },
  {
    label: 'Multi-provider',
    ops: providerIcon,
    note: 'Claude, OpenAI and Gemini on your own keys, encrypted by your operating system.'
  }
]

export function Capabilities({ theme }: Props) {
  return (
    <section aria-labelledby="does-heading" className="px-6 py-14">
      <div className="mx-auto max-w-[1240px]">
        <h2
          id="does-heading"
          className="font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3"
        >
          What Backstage does
        </h2>

        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((item) => (
            <li
              key={item.label}
              className="border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-shadow)] transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_0_var(--color-brand-shadow)]"
            >
              <PixelArt
                width={ICON}
                height={ICON}
                ops={item.ops}
                palette={theme.palette}
                scale={2}
                className="mb-3"
              />
              <h3 className="font-pixel text-[13px] font-bold uppercase leading-none tracking-[0.06em] text-ink">
                {item.label}
              </h3>
              <p className="mt-2 font-ui text-[13px] leading-snug text-ink-3">
                {item.note}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
