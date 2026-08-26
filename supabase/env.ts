import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Supabase configuration, read once at startup.
 *
 * Electron's main process is a plain Node process with no bundler around it,
 * so nothing loads a `.env` on its behalf — `import.meta.env` is a renderer
 * facility and is not available here. This reads the file itself rather than
 * adding a dependency for twenty lines of parsing.
 *
 * Only ever the *public* pair. The URL and the anon/publishable key are
 * designed to ship inside clients: the anon key is a signed JWT asserting the
 * `anon` role and nothing else, and every table it can reach is behind row
 * level security. The service-role key bypasses RLS entirely and must never be
 * read here, put in `.env`, or exist anywhere in this repository — see
 * SUPABASE_GOOGLE_AUTH_SETUP.md.
 */

export interface SupabaseConfig {
  url: string
  anonKey: string
  /** The loopback port the OAuth callback is served on. */
  callbackPort: number
  /** False when either half of the pair is missing. */
  configured: boolean
}

/** The port Supabase's redirect allow-list is documented against. */
const DEFAULT_CALLBACK_PORT = 8765

let cached: SupabaseConfig | null = null

/**
 * Where a `.env` might be.
 *
 * In development the app runs out of the repository, so the current working
 * directory is the project root. A packaged build has neither — the app is
 * inside an asar and the working directory is wherever the user launched it
 * from — so the directory beside the executable and the unpacked resources
 * directory are both tried. The first file that exists wins; none of them
 * existing is a normal state, because the variables may equally have come
 * from the real environment.
 */
function candidatePaths(): string[] {
  const paths = [join(process.cwd(), '.env')]

  try {
    if (app.isPackaged) {
      paths.push(join(process.resourcesPath, '.env'))
      paths.push(join(dirname(app.getPath('exe')), '.env'))
    } else {
      // electron-vite runs the main bundle out of `out/main`, two levels down.
      paths.push(join(app.getAppPath(), '.env'))
    }
  } catch {
    // `app` is unavailable in a plain Node context (tests); cwd is enough.
  }

  return paths
}

/**
 * A deliberately small `.env` parser.
 *
 * `KEY=value`, `#` comments, and one level of surrounding quotes. It does not
 * do interpolation, multi-line values or `export` prefixes, because a config
 * file holding two URLs and a key does not need them and a half-correct
 * implementation of them is worse than none.
 */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1)
    }

    if (key) out[key] = value
  }

  return out
}

function fromFiles(): Record<string, string> {
  for (const path of candidatePaths()) {
    try {
      if (!existsSync(path)) continue
      return parseEnvFile(readFileSync(path, 'utf8'))
    } catch {
      // An unreadable .env is not fatal; the real environment may still have it.
    }
  }
  return {}
}

/**
 * Read config from the process environment first, then a `.env`.
 *
 * That order matters: a value set by CI, a launcher or a shell is a deliberate
 * override and must beat a file that happens to be lying in the checkout.
 *
 * Both the historical and current Supabase names for the public key are
 * accepted. Supabase renamed "anon key" to "publishable key" in its dashboard
 * while every existing tutorial and `.env` still says `SUPABASE_ANON_KEY`, and
 * refusing to start because the user copied the name off the newer screen
 * would be pedantry with a support cost.
 */
export function supabaseConfig(): SupabaseConfig {
  if (cached) return cached

  const file = fromFiles()
  const read = (...names: string[]): string => {
    for (const name of names) {
      const value = process.env[name] ?? file[name]
      if (value && value.trim()) return value.trim()
    }
    return ''
  }

  const url = read('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const anonKey = read(
    'SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY'
  )

  const port = Number(read('BACKSTAGE_AUTH_PORT'))

  cached = {
    url,
    anonKey,
    callbackPort:
      Number.isInteger(port) && port > 0 && port < 65536
        ? port
        : DEFAULT_CALLBACK_PORT,
    configured: Boolean(url && anonKey)
  }

  /*
   * A service-role key in the app's environment is a configuration mistake
   * serious enough to name out loud: it bypasses every RLS policy in the
   * database, and this process hands its environment to nothing but is still
   * the wrong place for it. The key itself is never printed.
   */
  if (process.env.SUPABASE_SERVICE_ROLE_KEY || file.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      '[auth] SUPABASE_SERVICE_ROLE_KEY is present in this environment. ' +
        'Backstage never uses it and it must not be shipped with the app — ' +
        'it bypasses row level security.'
    )
  }

  return cached
}

/** The one URL Supabase redirects back to. Must match the allow-list exactly. */
export function callbackUrl(): string {
  return `http://localhost:${supabaseConfig().callbackPort}/auth/callback`
}
