/**
 * A small Markdown parser, written rather than installed.
 *
 * Agent answers are Markdown — every model writes it whether or not it is
 * asked to — and until now the chat rendered them as `whitespace-pre-wrap`
 * text. A model's `## Findings`, its numbered list and its fenced code block
 * all arrived as literal hashes, digits and backticks in one grey rectangle.
 * That is the "wall of text": not too much content, but content with all of
 * its structure still written down as punctuation instead of shown.
 *
 * Two reasons this is here rather than `marked` + `highlight.js`:
 *
 * 1. Safety. Model output is untrusted text. This produces a typed tree that
 *    React renders as elements, so there is no HTML string anywhere and no
 *    `dangerouslySetInnerHTML` to get wrong. Raw HTML in the source is
 *    deliberately *not* interpreted — it is shown as the text it is.
 * 2. Scope. This renders into a narrow side panel. The full CommonMark grammar
 *    — reference links, nested blockquote lazy continuation, HTML blocks — is
 *    surface area nobody will see, and every one of those branches is a place
 *    for untrusted text to do something surprising.
 *
 * So it covers what models actually emit, and anything it does not recognise
 * falls through to being a paragraph, which is the safe direction: the worst
 * case is text that renders as text.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'strike'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'code'; language: string | null; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][]; align: Align[] }
  | { kind: 'rule' }

export type Align = 'left' | 'center' | 'right' | null

/* ------------------------------------------------------------------ blocks -- */

/**
 * Parse a document into blocks.
 *
 * Line-based and single-pass. Fenced code is handled before anything else on
 * every iteration, because its contents are not Markdown — a `# ` inside a
 * shell snippet is a comment, and treating it as a heading is the kind of
 * mangling that makes a renderer worse than no renderer.
 */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i++
      continue
    }

    const fence = openingFence(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !closesFence(lines[i], fence.marker)) {
        body.push(lines[i])
        i++
      }
      // An unterminated fence still yields a code block: the model was mid-way
      // through writing one, and showing the half it has beats showing nothing.
      if (i < lines.length) i++
      blocks.push({ kind: 'code', language: fence.language, text: body.join('\n') })
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2].replace(/\s+#+\s*$/, '').trim())
      })
      i++
      continue
    }

    if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' })
      i++
      continue
    }

    if (/^ {0,3}>/.test(line)) {
      const inner: string[] = []
      while (i < lines.length && (/^ {0,3}>/.test(lines[i]) || lines[i].trim() !== '')) {
        if (!/^ {0,3}>/.test(lines[i]) && lines[i].trim() === '') break
        inner.push(lines[i].replace(/^ {0,3}> ?/, ''))
        i++
      }
      blocks.push({ kind: 'quote', blocks: parseBlocks(inner.join('\n')) })
      continue
    }

    const table = parseTable(lines, i)
    if (table) {
      blocks.push(table.block)
      i = table.next
      continue
    }

    if (listMarker(line)) {
      const list = parseList(lines, i)
      blocks.push(list.block)
      i = list.next
      continue
    }

    // A paragraph runs until a blank line or until something else starts.
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines, i)) {
      para.push(lines[i].trim())
      i++
    }
    if (para.length > 0) {
      blocks.push({ kind: 'paragraph', children: parseInline(para.join('\n')) })
    } else {
      // Defensive: never fail to advance, whatever the input.
      i++
    }
  }

  return blocks
}

/** Whether a line begins a block that a running paragraph must yield to. */
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]
  return (
    openingFence(line) !== null ||
    /^(#{1,6})\s+/.test(line) ||
    /^ {0,3}>/.test(line) ||
    /^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line) ||
    listMarker(line) !== null ||
    parseTable(lines, i) !== null
  )
}

function openingFence(line: string): { marker: string; language: string | null } | null {
  const m = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/.exec(line)
  if (!m) return null
  return { marker: m[1][0].repeat(3), language: m[2] ? m[2].toLowerCase() : null }
}

function closesFence(line: string, marker: string): boolean {
  return new RegExp(`^ {0,3}${marker[0]}{3,}\\s*$`).test(line)
}

interface Marker {
  ordered: boolean
  indent: number
  /** Characters from the start of the line to the item's own content. */
  width: number
  start: number
}

function listMarker(line: string): Marker | null {
  const bullet = /^(\s*)([-*+])\s+/.exec(line)
  if (bullet) {
    return {
      ordered: false,
      indent: bullet[1].length,
      width: bullet[0].length,
      start: 1
    }
  }
  const ordered = /^(\s*)(\d{1,9})[.)]\s+/.exec(line)
  if (ordered) {
    return {
      ordered: true,
      indent: ordered[1].length,
      width: ordered[0].length,
      start: Number(ordered[2])
    }
  }
  return null
}

/**
 * A list, and any nested lists inside it.
 *
 * Each item's lines are gathered with the marker stripped and then parsed as a
 * document of their own, which is what makes a paragraph, a nested list or a
 * fenced code block inside a list item work without a second code path.
 */
function parseList(lines: string[], from: number): { block: Block; next: number } {
  const first = listMarker(lines[from])!
  const items: Block[][] = []
  let current: string[] | null = null
  let i = from

  while (i < lines.length) {
    const line = lines[i]
    const marker = listMarker(line)

    if (marker && marker.indent <= first.indent && marker.ordered === first.ordered) {
      if (current) items.push(parseBlocks(current.join('\n')))
      current = [line.slice(marker.width)]
      i++
      continue
    }

    if (line.trim() === '') {
      // A blank line ends the list unless the next line continues an item.
      const next = lines[i + 1]
      if (next === undefined) break
      const continues =
        /^\s{2,}/.test(next) || (listMarker(next)?.indent ?? -1) >= first.indent
      if (!continues) break
      current?.push('')
      i++
      continue
    }

    // Indented continuation, including nested lists and lazy wrapped text.
    if (current && (/^\s{2,}/.test(line) || !listMarker(line))) {
      current.push(line.replace(new RegExp(`^\\s{0,${first.width}}`), ''))
      i++
      continue
    }

    break
  }

  if (current) items.push(parseBlocks(current.join('\n')))

  return {
    block: { kind: 'list', ordered: first.ordered, start: first.start, items },
    next: i
  }
}

/**
 * A pipe table, if these lines are one.
 *
 * Requires the delimiter row, because that is the only thing separating a real
 * table from a paragraph that happens to contain pipe characters — and a
 * sentence about `a | b` becoming a one-column table is a worse outcome than
 * a table not being recognised.
 */
function parseTable(lines: string[], from: number): { block: Block; next: number } | null {
  const header = lines[from]
  const divider = lines[from + 1]
  if (!header || !divider) return null
  if (!header.includes('|')) return null
  if (!/^[\s|:-]+$/.test(divider) || !divider.includes('-') || !divider.includes('|')) {
    return null
  }

  const head = splitRow(header)
  const align = splitRow(divider).map((cell): Align => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
  if (head.length === 0 || align.length !== head.length) return null

  const rows: Inline[][][] = []
  let i = from + 2
  while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
    const cells = splitRow(lines[i])
    rows.push(
      Array.from({ length: head.length }, (_, c) => parseInline(cells[c] ?? ''))
    )
    i++
  }

  return {
    block: {
      kind: 'table',
      head: head.map(parseInline),
      rows,
      align
    },
    next: i
  }
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

/* ------------------------------------------------------------------ inline -- */

/**
 * Parse inline markup.
 *
 * Code spans win over everything, as they must: backticks are how a model
 * writes `**not bold**` when it means the literal characters, and emphasis
 * parsed inside a code span would silently eat them.
 */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  let i = 0

  const flush = () => {
    if (text) {
      out.push({ kind: 'text', text })
      text = ''
    }
  }

  while (i < source.length) {
    const rest = source.slice(i)

    // `code`, ``code with a ` in it``
    const code = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest)
    if (code) {
      flush()
      out.push({ kind: 'code', text: code[2].trim() })
      i += code[0].length
      continue
    }

    // [label](href) — the href is validated at render, not here.
    const link = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest)
    if (link) {
      flush()
      out.push({ kind: 'link', href: link[2], children: parseInline(link[1]) })
      i += link[0].length
      continue
    }

    // A bare URL, which is how models cite things far more often than links.
    const bare = /^<?(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])>?/.exec(rest)
    if (bare) {
      flush()
      out.push({ kind: 'link', href: bare[1], children: [{ kind: 'text', text: bare[1] }] })
      i += bare[0].length
      continue
    }

    const strong = /^\*\*(?=\S)([\s\S]*?\S)\*\*/.exec(rest)
    if (strong) {
      flush()
      out.push({ kind: 'strong', children: parseInline(strong[1]) })
      i += strong[0].length
      continue
    }

    /*
     * `__bold__` is deliberately not supported, where `**bold**` is.
     *
     * CommonMark says `__init__` is bold text. In this product it is a Python
     * identifier: these agents read source code for a living, so dunder names,
     * `__pycache__` and `__tests__` appear in their answers constantly, and
     * every one of them would render as a bold word with the underscores —
     * the part that makes it a filename — silently deleted.
     *
     * A word-boundary guard does not settle it either, because `__init__.py`
     * clears every boundary test there is. So the trade is made explicitly:
     * models write `**bold**` essentially always and `__bold__` essentially
     * never, and the identifier is the thing the user actually needs to read.
     */

    const strike = /^~~(?=\S)([\s\S]*?\S)~~/.exec(rest)
    if (strike) {
      flush()
      out.push({ kind: 'strike', children: parseInline(strike[1]) })
      i += strike[0].length
      continue
    }

    /*
     * Emphasis with `_` only at a word boundary. `snake_case_name` and
     * `__init__` are identifiers, not emphasis, and they appear constantly in
     * the output of an agent reading source code.
     */
    const em = /^\*(?=\S)([\s\S]*?\S)\*/.exec(rest)
    if (em) {
      flush()
      out.push({ kind: 'em', children: parseInline(em[1]) })
      i += em[0].length
      continue
    }
    const emUnder = /^_(?=\S)([^_]*?\S)_(?![A-Za-z0-9_])/.exec(rest)
    if (emUnder && (i === 0 || !/[A-Za-z0-9_]/.test(source[i - 1]))) {
      flush()
      out.push({ kind: 'em', children: parseInline(emUnder[1]) })
      i += emUnder[0].length
      continue
    }

    // An escape, so a model can write a literal asterisk.
    if (rest[0] === '\\' && rest.length > 1 && /[\\`*_{}[\]()#+\-.!~>|]/.test(rest[1])) {
      text += rest[1]
      i += 2
      continue
    }

    text += source[i]
    i++
  }

  flush()
  return out
}

/* ------------------------------------------------------------------- links -- */

/**
 * The href to use, or null to render the label as plain text.
 *
 * Allow-list rather than deny-list. Model output is untrusted, and `javascript:`
 * is only the best known of the schemes that turn a link into an execution;
 * naming the two that are safe is a rule that cannot be out-of-date, where
 * naming the unsafe ones is a rule that always is.
 */
export function safeHref(href: string): string | null {
  const trimmed = href.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^mailto:[^\s]+@[^\s]+$/i.test(trimmed)) return trimmed
  return null
}

/** Plain text of an inline tree, for titles and copy buttons. */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.kind === 'text' || n.kind === 'code') return n.text
      return inlineText(n.children)
    })
    .join('')
}
