# Applying the Backstage schema

The files in `migrations/` describe the database. They are **not** the
database. Until they have been run against the remote project, every table in
them is missing from the API and every sync fails with:

```
Could not find the table 'public.profiles' in the schema cache
```

That is the state this project was in: both migration files existed and none
of the seven tables did.

## Check first

```
node ../scripts/verify-supabase.mjs
```

It reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `.env`, asks the API for
one row of each table, and reports which are missing. It only reads.

## Apply

Two files, in order. Both are plain UTF-8 with LF endings — `0002` was
UTF-16LE, which some tools read as binary and others turn into mojibake, so it
was converted.

| File | What it does |
|---|---|
| `0001_auth_and_ownership.sql` | The seven tables, their foreign keys into `auth.users`, row level security on all seven, 26 policies, and the trigger that creates a `profiles` row when an account is created. |
| `0002_api_grants.sql` | Grants on those tables for the `anon` and `authenticated` roles, then asks PostgREST to reload its schema cache. |

### Option A — the dashboard (no tooling needed)

1. Open the project → **SQL Editor** → **New query**.
2. Paste the whole of `0001_auth_and_ownership.sql`, run it.
3. Paste the whole of `0002_api_grants.sql`, run it.
4. Re-run the verify script. All seven should report `ok`.

### Option B — the Supabase CLI

```
supabase link --project-ref <your-project-ref>
supabase db push
```

`db push` applies everything in `migrations/` in filename order.

## After applying

`notify pgrst, 'reload schema'` at the end of `0002` makes PostgREST pick the
tables up straight away. If the verify script still reports `MISSING`, wait a
few seconds and run it again, or restart the project's API from
**Project Settings → General**.

Then restart Backstage. The pending sync queue flushes on its own — nothing
needs to be deleted by hand.

## What this does not affect

Agents. The cloud copy is a mirror: every store writes to disk first and the
mirror is fire-and-forget, so a missing table produces a logged warning and
nothing else. Agent runs, tool calls and conversations all work with the
schema absent — they simply are not backed up.
