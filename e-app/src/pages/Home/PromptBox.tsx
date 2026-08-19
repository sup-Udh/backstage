import { useState, type FormEvent, type KeyboardEvent } from 'react'

interface Props {
  onSubmit: (text: string) => void
  disabled?: boolean
  placeholder?: string
  /**
   * Visible rows. The transcript wants room to compose; a live session wants
   * a single line, because you are talking to a process that is waiting.
   */
  rows?: number
}

/**
 * The command input.
 *
 * Deliberately a control surface rather than a chat bubble: hard border,
 * brand focus ring, a square send key. Enter submits and Shift+Enter breaks
 * a line, which is what anyone typing a task will expect.
 *
 * The same control serves every tab that sends rather than filters — the
 * transcript, a live PTY session and the task list — so the bottom of the
 * command centre never changes shape as the user moves between them.
 */
export function PromptBox({
  onSubmit,
  disabled = false,
  placeholder,
  rows = 2
}: Props) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  const send = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSubmit(text)
    setValue('')
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    send()
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-end gap-2 border-[3px] bg-paper p-2 transition-colors ${
        focused ? 'border-brand-deep' : 'border-ink'
      }`}
    >
      <textarea
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder ?? 'Ask your team…'}
        className="min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 font-ui text-sm leading-[1.5] text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
      />

      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        aria-label="Send to your team"
        className={[
          'grid h-9 w-9 shrink-0 place-items-center border-[3px] border-ink',
          'font-pixel text-base font-bold text-ink',
          'transition-transform duration-75 ease-linear',
          'disabled:cursor-default disabled:opacity-40',
          'enabled:bg-brand enabled:shadow-[3px_3px_0_0_var(--color-ink)]',
          'enabled:hover:-translate-x-px enabled:hover:-translate-y-px enabled:hover:bg-brand-lite',
          'enabled:active:translate-x-[2px] enabled:active:translate-y-[2px] enabled:active:shadow-[1px_1px_0_0_var(--color-ink)]',
          'disabled:bg-cream-2'
        ].join(' ')}
      >
        <span aria-hidden>↑</span>
      </button>
    </form>
  )
}
