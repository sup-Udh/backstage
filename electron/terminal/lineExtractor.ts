/**
 * A miniature terminal, just large enough to recover readable lines from a
 * full-screen CLI's output.
 *
 * Claude Code and Codex do not emit a conversation. They emit cursor
 * movements, colour codes and repeated repaints of a region of the screen; the
 * conversation is something a terminal emulator reconstructs by painting all
 * of that into a character grid. To show any of it in the chat, something has
 * to do that painting.
 *
 * This is deliberately a *line* emulator rather than a screen emulator: it
 * tracks the cursor within the current line, honours the erase and absolute-
 * move sequences that decide what survives, and commits a line when one
 * finishes. A full grid would be more faithful and far more code, and the
 * extra fidelity buys nothing — the terminal panel is already the faithful
 * view, and this only has to produce something readable.
 *
 * No electron, no node-pty, no I/O. Everything here is a pure function of the
 * bytes it is given, which is what makes it testable — and it needs to be,
 * because escape-sequence handling fails silently and produces plausible-
 * looking rubbish rather than an error.
 */

/** How many recent lines to remember, for redraw suppression. */
const DEDUPE_WINDOW = 60
/** Longest single line kept. TUIs pad to the full terminal width. */
export const MAX_LINE_CHARS = 400
/** Longest incomplete escape sequence carried across a chunk boundary. */
const MAX_ESCAPE_CHARS = 64

/**
 * Characters that only ever appear as decoration: box drawing, block shading,
 * spinner frames and rules. A line made of nothing else is a frame of a
 * repaint, not something anybody wrote.
 */
const DECORATION = /^[\s─-╿▀-▟■-◿•·⠀-⣿.:_=+*#|/\\<>()[\]{}~^-]*$/

export class LineExtractor {
  /** The line being built, as cells so the cursor can overwrite in place. */
  private cells: string[] = []
  private cursor = 0
  /** Partial escape sequence carried across a chunk boundary. */
  private pending = ''
  private recent: string[] = []

  /**
   * Feed one chunk of output. Returns the lines that finished within it.
   *
   * Written as an explicit state machine over characters rather than a regex
   * pass, because escape sequences routinely straddle chunk boundaries: a
   * chunk can end halfway through `\x1b[3` and the rest arrive milliseconds
   * later. A regex would treat the fragment as literal text and leak `[3` into
   * the transcript.
   */
  push(data: string): string[] {
    const out: string[] = []

    /*
     * Anything held back from the previous chunk goes in front. `pending` is
     * only ever the start of a sequence that had not finished when the chunk
     * ended, so re-processing from the top is correct and cheap.
     */
    const text = this.pending + data
    this.pending = ''

    let i = 0
    while (i < text.length) {
      const ch = text[i]

      if (ch === '\x1b') {
        const consumed = this.escape(text, i)
        if (consumed === -1) {
          /*
           * Incomplete: keep the tail and wait. Capped, because a stream
           * containing a lone ESC — binary output, a corrupted write — would
           * otherwise pin every later chunk behind a sequence that never
           * terminates, and the transcript would silently stop updating.
           */
          const tail = text.slice(i)
          this.pending = tail.length <= MAX_ESCAPE_CHARS ? tail : ''
          return out
        }
        i = consumed
        continue
      }

      if (ch === '\n') {
        const line = this.commit()
        if (line !== null) out.push(line)
        i++
        continue
      }

      if (ch === '\r') {
        // A lone carriage return rewrites the line in place, which is how a
        // progress indicator works. The line is not finished.
        this.cursor = 0
        i++
        continue
      }

      if (ch === '\b') {
        this.cursor = Math.max(0, this.cursor - 1)
        i++
        continue
      }

      if (ch === '\t') {
        this.cursor = (Math.floor(this.cursor / 8) + 1) * 8
        i++
        continue
      }

      // Any other control character carries no text.
      if (ch < ' ') {
        i++
        continue
      }

      while (this.cells.length < this.cursor) this.cells.push(' ')
      this.cells[this.cursor] = ch
      this.cursor++
      i++
    }

    return out
  }

  /**
   * Skip one escape sequence, applying the few that affect which text
   * survives. Returns the index just past it, or -1 if the chunk ended
   * mid-sequence.
   */
  private escape(text: string, start: number): number {
    const next = text[start + 1]
    if (next === undefined) return -1

    // OSC: ends at BEL or ST. Window titles and the like — no text content.
    if (next === ']') {
      for (let i = start + 2; i < text.length; i++) {
        if (text[i] === '\x07') return i + 1
        if (text[i] === '\x1b' && text[i + 1] === '\\') return i + 2
      }
      return -1
    }

    if (next === '[') {
      let i = start + 2
      while (i < text.length && /[0-9;?]/.test(text[i])) i++
      if (i >= text.length) return -1
      const final = text[i]
      const params = text.slice(start + 2, i)

      if (final === 'K') {
        // Erase in line: 0/absent from the cursor on, 1 to the cursor, 2 all.
        const mode = params.replace(/\D/g, '') || '0'
        if (mode === '0') this.cells.length = Math.min(this.cells.length, this.cursor)
        else if (mode === '1') for (let c = 0; c < this.cursor; c++) this.cells[c] = ' '
        else this.cells.length = 0
      } else if (final === 'J' || final === 'H' || final === 'f') {
        /*
         * A screen erase or an absolute cursor move means the program is
         * repainting. Whatever was half-built on the current line belonged to
         * the old frame and is dropped rather than committed — committing it
         * is what produces a transcript full of torn fragments.
         */
        this.cells.length = 0
        this.cursor = 0
      } else if (final === 'G') {
        this.cursor = Math.max(0, (parseInt(params, 10) || 1) - 1)
      }
      return i + 1
    }

    // Two-character sequences (=, >, M, 7, 8 …) carry no text.
    return start + 2
  }

  /** Finish the current line, returning it if it says anything. */
  private commit(): string | null {
    const raw = this.cells.join('')
    this.cells = []
    this.cursor = 0

    const trimmed = raw.replace(/\s+$/, '').slice(0, MAX_LINE_CHARS)
    if (!trimmed.trim()) return null
    if (DECORATION.test(trimmed)) return null

    /*
     * Redraw suppression. A TUI reprints unchanged lines every frame, so the
     * same sentence can arrive dozens of times; without this the transcript is
     * mostly repetition. Matching on the trimmed text within a recent window
     * collapses a repaint while still keeping a line that genuinely recurs
     * later — two identical test failures, say.
     */
    const key = trimmed.trim()
    if (this.recent.includes(key)) return null
    this.recent.push(key)
    if (this.recent.length > DEDUPE_WINDOW) this.recent.shift()

    return trimmed
  }
}
