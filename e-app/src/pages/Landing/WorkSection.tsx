import type { Theme } from '../../themes/types'
import type { Op } from '../../world/pixel/ops'
import { disc } from '../../world/pixel/shapes'
import { PixelArt } from '../../world/PixelArt'
import { CharacterSprite } from '../../world/CharacterSprite'

interface Props {
  theme: Theme
}

const ICON = 16

const taskIcon: Op[] = [
  [3, 1, 10, 14, 'ink'],
  [4, 2, 8, 12, 'paper'],
  [5, 4, 6, 1, 'ink3'],
  [5, 6, 6, 1, 'ink3'],
  [5, 8, 4, 1, 'ink3'],
  [5, 10, 6, 1, 'brandDeep']
]

const investigateIcon: Op[] = [
  ...disc(6, 6, 5, 'ink'),
  ...disc(6, 6, 4, 'brandPale'),
  [4, 3, 2, 1, 'white'],
  [3, 4, 1, 2, 'white'],
  [9, 9, 3, 3, 'ink'],
  [11, 11, 4, 4, 'ink']
]

// Head and shoulders must touch, or the pair reads as four loose squares.
const collaborateIcon: Op[] = [
  [2, 2, 5, 5, 'ink'],
  [3, 3, 3, 3, 'brandLite'],
  [0, 7, 9, 8, 'ink'],
  [1, 8, 7, 6, 'brand'],
  [9, 2, 5, 5, 'ink'],
  [10, 3, 3, 3, 'brandLite'],
  [7, 7, 9, 8, 'ink'],
  [8, 8, 7, 6, 'brandDeep']
]

const solveIcon: Op[] = [
  [1, 7, 4, 4, 'ink'],
  [3, 10, 4, 4, 'ink'],
  [6, 7, 4, 4, 'ink'],
  [8, 4, 4, 4, 'ink'],
  [10, 1, 4, 4, 'ink'],
  [2, 8, 2, 2, 'brand'],
  [4, 11, 2, 2, 'brand'],
  [7, 8, 2, 2, 'brand'],
  [9, 5, 2, 2, 'brand'],
  [11, 2, 2, 2, 'brand']
]

const STEPS = [
  { label: 'Task', ops: taskIcon, note: 'You hand over the work' },
  { label: 'Investigate', ops: investigateIcon, note: 'They dig through it' },
  { label: 'Collaborate', ops: collaborateIcon, note: 'They talk it out' },
  { label: 'Solve', ops: solveIcon, note: 'They ship the fix' }
]

const TERMINAL_LINES = [
  'agent thinking...',
  'running command...',
  'waiting...',
  'generating...'
]

export function WorkSection({ theme }: Props) {
  return (
    <section id="work" className="border-t-[3px] border-ink px-6 py-20">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-12 max-w-2xl">
          <h2 className="font-pixel text-4xl uppercase leading-none tracking-[-0.01em] text-ink sm:text-5xl">
            They don&apos;t just answer.
          </h2>
          <p className="mt-4 font-mono text-base leading-relaxed text-ink-3">
            They investigate. They code. They research. They collaborate.
          </p>
        </header>

        {/* The pipeline, as a row of pixel plates joined by hard arrows. */}
        <ol className="mb-16 flex flex-col gap-4 lg:flex-row lg:gap-0">
          {STEPS.map((step, i) => (
            <li key={step.label} className="flex flex-1 items-stretch">
              <div className="flex-1 border-[3px] border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
                <PixelArt
                  width={ICON}
                  height={ICON}
                  ops={step.ops}
                  palette={theme.palette}
                  scale={3}
                  className="mb-3"
                />
                <p className="font-pixel text-lg font-bold uppercase leading-none tracking-[0.08em] text-ink">
                  {step.label}
                </p>
                <p className="mt-1.5 font-mono text-xs leading-tight text-ink-3">
                  {step.note}
                </p>
              </div>

              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="hidden items-center px-3 font-pixel text-2xl font-bold text-brand-deep lg:flex"
                >
                  &gt;
                </span>
              )}
            </li>
          ))}
        </ol>

        {/* The contrast: what you stop looking at, and what replaces it. */}
        <div className="grid items-stretch gap-6 lg:grid-cols-2">
          <div className="border-[3px] border-ink bg-ink p-6 shadow-[4px_4px_0_0_var(--color-ink-3)]">
            <p className="mb-4 font-pixel text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
              No more staring at
            </p>
            <div className="space-y-2">
              {TERMINAL_LINES.map((line) => (
                <p
                  key={line}
                  className="font-mono text-sm leading-none text-dim"
                >
                  <span className="mr-2 text-dim">&gt;</span>
                  {line}
                </p>
              ))}
              <p className="font-mono text-sm leading-none text-dim">
                <span className="mr-2">&gt;</span>
                <span className="blink text-brand">_</span>
              </p>
            </div>
          </div>

          <div className="relative flex items-center gap-6 overflow-hidden border-[3px] border-ink bg-brand-pale p-6 shadow-[4px_4px_0_0_var(--color-brand-shadow)]">
            <div className="absolute inset-x-0 bottom-0 h-14 bg-cream-2" />
            <CharacterSprite
              appearance={theme.characters[0].appearance}
              state="working"
              scale={4}
              className="relative shrink-0"
            />
            <p className="relative font-pixel text-3xl uppercase leading-tight text-ink sm:text-4xl">
              Watch them
              <br />
              work.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
