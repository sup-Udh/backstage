import { PagePlaceholder } from '../shell/PagePlaceholder'

const SECTIONS = [
  { name: 'Profile', note: 'Who you are inside Backstage.' },
  { name: 'API Providers', note: 'Connect Anthropic, OpenAI and others.' },
  { name: 'Preferences', note: 'Defaults for new cases and agents.' },
  { name: 'Appearance', note: 'World scale, motion and density.' },
  { name: 'Data', note: 'Local history, export and reset.' }
]

export function Account() {
  return (
    <PagePlaceholder
      title="Account"
      lead="Settings for you, and for the providers behind your team."
    >
      <ul className="max-w-[640px] border-[3px] border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)]">
        {SECTIONS.map((s, i) => (
          <li
            key={s.name}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${
              i > 0 ? 'border-t-2 border-rule' : ''
            }`}
          >
            <div>
              <p className="font-ui text-sm font-semibold text-ink">{s.name}</p>
              <p className="mt-0.5 font-ui text-xs text-ink-3">{s.note}</p>
            </div>
            <span className="shrink-0 border-2 border-rule px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
              Soon
            </span>
          </li>
        ))}
      </ul>
    </PagePlaceholder>
  )
}
