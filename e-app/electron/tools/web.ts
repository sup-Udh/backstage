import { truncate, type AgentTool, type ToolResult } from './types'

/**
 * Web tools.
 *
 * Deliberately small: fetch a URL and turn it into readable text, and run a
 * keyword search. No browser, no JavaScript execution, no cookies — the point
 * is to get current documentation in front of the model, not to browse.
 */

const FETCH_TIMEOUT_MS = 20_000
const UA = 'Backstage/0.1 (+local agent workspace)'

/** Reject anything that is not plain public http(s). */
function checkUrl(raw: string): { url: URL } | { error: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { error: 'That is not a valid URL.' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'Only http and https URLs can be fetched.' }
  }
  /*
   * Block the obvious SSRF targets. An agent asking for documentation has no
   * reason to reach the loopback interface or a cloud metadata endpoint, and
   * this process can see the user's private network.
   */
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === '0.0.0.0'
  ) {
    return { error: 'Refused: that address is on a private or local network.' }
  }
  return { url }
}

/** Strip a HTML document down to something worth sending to a model. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function get(url: URL, accept: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept }
    })
  } finally {
    clearTimeout(timer)
  }
}

export const webFetch: AgentTool = {
  name: 'web_fetch',
  label: 'Fetching a page',
  description:
    'Fetch a public web page or API response and return it as readable text. Use for documentation, changelogs and error references.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full http(s) URL.' }
    },
    required: ['url']
  },
  describe: (i) => {
    try {
      return `Fetched ${new URL(String(i.url)).hostname}`
    } catch {
      return 'Fetched a page'
    }
  },

  async execute(input): Promise<ToolResult> {
    const checked = checkUrl(String(input.url ?? ''))
    if ('error' in checked) return { success: false, error: checked.error }

    try {
      const res = await get(checked.url, 'text/html,application/json;q=0.9,text/plain;q=0.8')
      if (!res.ok) {
        return { success: false, error: `The server returned ${res.status}.` }
      }
      const type = res.headers.get('content-type') ?? ''
      const body = await res.text()
      const readable =
        type.includes('json') || type.includes('text/plain') ? body : htmlToText(body)

      const { text, truncated } = truncate(readable, 16_000)
      return {
        success: true,
        output: `${checked.url.href}\n\n${text}`,
        metadata: { truncated }
      }
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError'
      return {
        success: false,
        error: aborted ? 'The request timed out.' : 'Could not reach that URL.'
      }
    }
  }
}

export const webSearch: AgentTool = {
  name: 'web_search',
  label: 'Searching the web',
  description:
    'Search the web and get back result titles, URLs and snippets. Follow up with web_fetch to read a result in full.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for.' }
    },
    required: ['query']
  },
  describe: (i) => `Searched the web for "${String(i.query).slice(0, 60)}"`,

  async execute(input): Promise<ToolResult> {
    const query = String(input.query ?? '').trim()
    if (!query) return { success: false, error: 'Empty query.' }

    /*
     * DuckDuckGo's HTML endpoint needs no API key, which keeps this tool
     * working without another credential to manage. It is scraping, so it is
     * the most brittle tool here: if the markup changes this returns nothing
     * useful rather than wrong data, and web_fetch still works.
     */
    const url = new URL('https://html.duckduckgo.com/html/')
    url.searchParams.set('q', query)

    try {
      const res = await get(url, 'text/html')
      if (!res.ok) return { success: false, error: `Search returned ${res.status}.` }
      const html = await res.text()

      const results: string[] = []
      const linkRe =
        /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
      let m: RegExpExecArray | null
      while ((m = linkRe.exec(html)) !== null && results.length < 8) {
        const href = decodeDdgLink(m[1])
        const title = htmlToText(m[2])
        if (href && title) results.push(`${title}\n${href}`)
      }

      if (results.length === 0) {
        return {
          success: false,
          error:
            'No results could be parsed. Try web_fetch with a URL you already know.'
        }
      }
      return { success: true, output: results.join('\n\n') }
    } catch {
      return { success: false, error: 'Web search is unavailable right now.' }
    }
  }
}

/** DuckDuckGo wraps results in a redirect carrying the real URL in `uddg`. */
function decodeDdgLink(href: string): string {
  try {
    const abs = href.startsWith('//') ? `https:${href}` : href
    const u = new URL(abs, 'https://duckduckgo.com')
    const target = u.searchParams.get('uddg')
    return target ? decodeURIComponent(target) : u.href
  } catch {
    return ''
  }
}

export const webTools = [webSearch, webFetch]
