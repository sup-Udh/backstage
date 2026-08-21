import { inlineText, parseBlocks, parseInline, safeHref, type Block } from './parse'

/**
 * Checks on the Markdown a model actually writes.
 *
 * The cases here are taken from the shapes agent answers really take —
 * `snake_case` identifiers, file paths with underscores, fenced JSON, a
 * numbered list of findings — rather than from the CommonMark spec. The
 * failure this renderer exists to prevent is structure arriving as
 * punctuation; the failure it must not introduce is mangling source code that
 * happens to contain Markdown characters.
 */

let failures = 0

function ok(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`)
  }
}

function kinds(blocks: Block[]): string[] {
  return blocks.map((b) => b.kind)
}

console.log('\nBlock structure')

{
  const blocks = parseBlocks(
    ['## Main finding', '', 'The layout system is fine.', '', '- one', '- two'].join('\n')
  )
  ok('a heading, a paragraph and a list', kinds(blocks).join(',') === 'heading,paragraph,list')

  const heading = blocks[0]
  ok('the heading keeps its level', heading.kind === 'heading' && heading.level === 2)
  ok(
    'and not its hashes',
    heading.kind === 'heading' && inlineText(heading.children) === 'Main finding'
  )

  const list = blocks[2]
  ok('the list has both items', list.kind === 'list' && list.items.length === 2)
  ok('and is unordered', list.kind === 'list' && !list.ordered)
}

{
  const blocks = parseBlocks(['1. first', '2. second', '3. third'].join('\n'))
  const list = blocks[0]
  ok('a numbered list is ordered', list.kind === 'list' && list.ordered)
  ok('with every item', list.kind === 'list' && list.items.length === 3)
}

{
  // The exact shape from the brief: a filename, then a fenced block.
  const blocks = parseBlocks(
    ['package.json', '', '```json', '{', '  "name": "backstage"', '}', '```'].join('\n')
  )
  ok('prose then code', kinds(blocks).join(',') === 'paragraph,code')
  const code = blocks[1]
  ok('the language is captured', code.kind === 'code' && code.language === 'json')
  ok(
    'the body is verbatim',
    code.kind === 'code' && code.text === '{\n  "name": "backstage"\n}'
  )
}

console.log('\nCode is never treated as prose')

{
  const blocks = parseBlocks(['```bash', '# not a heading', '- not a list', '```'].join('\n'))
  ok('one block, not three', blocks.length === 1 && blocks[0].kind === 'code')
  ok(
    'its hashes and dashes survive',
    blocks[0].kind === 'code' && blocks[0].text === '# not a heading\n- not a list'
  )
}

{
  const nodes = parseInline('use `**literal**` here')
  const code = nodes.find((n) => n.kind === 'code')
  ok('a code span wins over emphasis', code?.kind === 'code' && code.text === '**literal**')
}

{
  // The one that bites hardest on real agent output.
  const nodes = parseInline('see src/agents/agent_store_helper.ts and __init__.py')
  ok(
    'underscores in identifiers are not emphasis',
    nodes.every((n) => n.kind === 'text'),
    nodes.map((n) => n.kind).join(',')
  )
  ok(
    'and both filenames survive intact',
    inlineText(nodes).includes('agent_store_helper.ts') &&
      inlineText(nodes).includes('__init__.py'),
    inlineText(nodes)
  )

  // The trade that buys it: asterisk emphasis still works, underscore does not.
  ok(
    'asterisk bold still works',
    parseInline('**really**').some((n) => n.kind === 'strong')
  )
  ok(
    'and __pycache__ is left alone',
    parseInline('found __pycache__ and __tests__ here').every((n) => n.kind === 'text')
  )
}

{
  const unterminated = parseBlocks(['```ts', 'const a = 1', 'const b = 2'].join('\n'))
  ok(
    'a half-written fence still renders as code',
    unterminated.length === 1 &&
      unterminated[0].kind === 'code' &&
      unterminated[0].text === 'const a = 1\nconst b = 2'
  )
}

console.log('\nInline markup')

{
  const nodes = parseInline('**bold** and *italic* and `code`')
  ok(
    'bold, italic and code are all recognised',
    nodes.some((n) => n.kind === 'strong') &&
      nodes.some((n) => n.kind === 'em') &&
      nodes.some((n) => n.kind === 'code')
  )
}

{
  const nodes = parseInline('[the docs](https://example.com/a)')
  const link = nodes[0]
  ok('a link keeps its href', link.kind === 'link' && link.href === 'https://example.com/a')
  ok('and its label', link.kind === 'link' && inlineText(link.children) === 'the docs')
}

{
  const nodes = parseInline('cited from https://example.com/page.html today')
  ok('a bare url becomes a link', nodes.some((n) => n.kind === 'link'))
  ok(
    'without swallowing the next word',
    inlineText(nodes).endsWith(' today'),
    inlineText(nodes)
  )
}

console.log('\nLinks that are not links')

{
  ok('http is allowed', safeHref('https://example.com') === 'https://example.com')
  ok('mailto is allowed', safeHref('mailto:a@b.com') === 'mailto:a@b.com')
  ok('javascript is refused', safeHref('javascript:alert(1)') === null)
  ok('data is refused', safeHref('data:text/html;base64,AAA') === null)
  ok('a relative path is refused', safeHref('/etc/passwd') === null)
  ok(
    'and case does not smuggle it through',
    safeHref('JaVaScRiPt:alert(1)') === null && safeHref('  javascript:alert(1)  ') === null
  )
}

console.log('\nTables')

{
  const blocks = parseBlocks(
    ['| File | Lines |', '| --- | ---: |', '| a.ts | 10 |', '| b.ts | 20 |'].join('\n')
  )
  const table = blocks[0]
  ok('a pipe table is a table', table.kind === 'table')
  ok('with its rows', table.kind === 'table' && table.rows.length === 2)
  ok('and its alignment', table.kind === 'table' && table.align[1] === 'right')
}

{
  // Without the delimiter row this is a sentence, not a table.
  const blocks = parseBlocks('the flags are -a | -b | -c')
  ok('a sentence with pipes stays a paragraph', blocks[0].kind === 'paragraph')
}

console.log('\nNothing is ever lost')

{
  // Raw HTML is shown, not interpreted: the safe direction for untrusted text.
  const nodes = parseInline('<img src=x onerror=alert(1)>')
  ok(
    'html is treated as text',
    nodes.every((n) => n.kind === 'text'),
    nodes.map((n) => n.kind).join(',')
  )
}

{
  const messy = '#not a heading\n\n***\n\n> quoted\n\n  \n\nplain'
  const blocks = parseBlocks(messy)
  ok('odd input still parses', blocks.length > 0)
  ok('a horizontal rule is recognised', blocks.some((b) => b.kind === 'rule'))
  ok('a blockquote is recognised', blocks.some((b) => b.kind === 'quote'))
}

{
  ok('empty input is empty output', parseBlocks('').length === 0)
  ok('whitespace only is empty output', parseBlocks('\n\n   \n').length === 0)
}

if (failures > 0) {
  console.log(`\n${failures} markdown check(s) failed.`)
  process.exit(1)
}
console.log('\nAll markdown checks passed.')
