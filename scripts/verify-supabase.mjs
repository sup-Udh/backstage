/**
 * Does the remote Supabase project actually have the schema this app needs?
 *
 * Written because the local migration files said yes and the running app said
 * no: every table below existed in `supabase/migrations/` and none of them
 * existed in the database, so every sync failed with "Could not find the table
 * 'public.X' in the schema cache" while the migrations sat there looking
 * applied. A file on disk is not a deployed schema, and this is the check that
 * tells the two apart.
 *
 *     node scripts/verify-supabase.mjs
 *
 * Uses the anon key from .env and asks PostgREST for one row of each table.
 * It never writes. A 404 means the table is missing from the API schema — the
 * table does not exist, or PostgREST has not reloaded since it was created.
 * A 401/403 means the table is there and row level security is doing its job,
 * which for an unauthenticated request is the correct answer.
 */
import { readFileSync } from 'node:fs'

/** The tables the application actually reads and writes. Keep in step with
 *  the `from('...')` calls in supabase/sync.ts and supabase/authService.ts. */
const TABLES = [
  'profiles',
  'projects',
  'agents',
  'conversations',
  'messages',
  'cases',
  'user_settings'
]

function env() {
  let raw = ''
  try {
    raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  } catch {
    console.error('No .env file. Copy .env.example and fill it in.')
    process.exit(2)
  }
  const get = (key) =>
    raw
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${key}=`))
      ?.slice(key.length + 1)
      .trim()

  const url = get('SUPABASE_URL')
  const key = get('SUPABASE_ANON_KEY')
  if (!url || !key) {
    console.error('SUPABASE_URL or SUPABASE_ANON_KEY is missing from .env.')
    process.exit(2)
  }
  return { url: url.replace(/\/+$/, ''), key }
}

const { url, key } = env()

console.log(`Checking ${url.replace(/https:\/\/([a-z0-9]{6})[a-z0-9]*/, 'https://$1…')}\n`)

let missing = 0
for (const table of TABLES) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  })

  if (res.status === 404) {
    console.log(`  MISSING  ${table}`)
    missing++
  } else if (res.status === 401 || res.status === 403) {
    console.log(`  ok       ${table}  (present, RLS refusing an anonymous read)`)
  } else if (res.ok) {
    console.log(`  ok       ${table}`)
  } else {
    console.log(`  ?        ${table}  HTTP ${res.status}`)
  }
}

if (missing > 0) {
  console.log(
    `\n${missing} of ${TABLES.length} tables are missing from the remote API.\n` +
      'Apply the migrations — see supabase/README.md. Backstage will keep\n' +
      'working locally in the meantime; only the cloud mirror is affected.'
  )
  process.exit(1)
}

console.log(`\nAll ${TABLES.length} tables are exposed. Cloud sync can run.`)
