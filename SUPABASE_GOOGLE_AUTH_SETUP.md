# Backstage Google Authentication Setup

Everything below is **manual configuration you have to do once**, in two web
consoles: Supabase and Google Cloud. The application code is already written —
it will not work until these steps are done, and it tells you so on the login
page rather than failing silently.

Budget about 20 minutes. Steps 5–10 (Google Cloud) are the fiddly half.

> **Provider API keys are a separate subject.** Signing in with Google
> identifies you; it does not give Backstage any AI capability. Connecting
> OpenAI, Gemini and Claude Code is covered in
> [USER_PROVIDER_CONFIGURATION.md](./USER_PROVIDER_CONFIGURATION.md), and none
> of those credentials are stored in Supabase.

**Every value in this document is a placeholder.** Nothing here is a real
credential, and no redirect URI in this file should be copied literally except
`http://localhost:8765/auth/callback`, which is Backstage's own and is fixed by
the code. The Supabase callback URI in step 8 must be copied from *your*
dashboard, because it contains your project reference.

---

## Contents

1. [Create a Supabase project](#1-create-a-supabase-project)
2. [Supabase URL](#2-supabase-url)
3. [Supabase publishable / anon key](#3-supabase-publishable--anon-key)
4. [Enable the Google provider](#4-enable-the-google-provider)
5. [Create a Google Cloud project](#5-create-a-google-cloud-project)
6. [Configure the OAuth consent screen](#6-configure-the-oauth-consent-screen)
7. [Create the Google OAuth client](#7-create-the-google-oauth-client)
8. [Authorised redirect URI](#8-authorised-redirect-uri)
9. [Client ID](#9-client-id)
10. [Client secret](#10-client-secret)
11. [Supabase redirect configuration](#11-supabase-redirect-configuration)
12. [Electron-specific OAuth notes](#12-electron-specific-oauth-notes)
13. [Environment variables](#13-environment-variables)
14. [Database migrations](#14-database-migrations)
15. [RLS policies](#15-rls-policies)
16. [Testing checklist](#16-testing-checklist)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Create a Supabase project

Go to <https://supabase.com/dashboard> and sign in (GitHub, or email).

Click **New project** and fill in:

| Field | What to put |
|---|---|
| Organization | Any; create a personal one if you have none |
| Name | `backstage` — this is only a label |
| Database password | Generate one and save it in your password manager |
| Region | Whichever is closest to you |
| Plan | Free is enough |

The database password is for direct Postgres connections. Backstage never uses
it. You will want it if you ever run `supabase db push` or connect with `psql`.

Provisioning takes a minute or two. Wait for the project to go green before
continuing.

---

## 2. Supabase URL

**Dashboard → Project Settings → Data API → Project URL**

It looks like:

```
https://abcdefghijklmnop.supabase.co
```

That subdomain is your *project reference*. You will need it again in step 8.

This becomes:

```
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
```

---

## 3. Supabase publishable / anon key

**Dashboard → Project Settings → API Keys**

Copy the key labelled **`anon` / `public`**. Newer dashboards call this the
**publishable** key — it is the same key, renamed. It is a long JWT starting
`eyJ...`.

This becomes:

```
SUPABASE_ANON_KEY=eyJhbGciOi...
```

Backstage accepts either variable name (`SUPABASE_ANON_KEY` or
`SUPABASE_PUBLISHABLE_KEY`), so it does not matter which spelling you copied
off the screen.

### ⚠️ The service-role key

On the same page there is a **`service_role`** key (sometimes **secret** key).

**Do not put it in `.env`. Do not put it in the app. Do not commit it.**

It bypasses *every* row level security policy in your database. Anything
holding it can read and write every user's data. Backstage has no code path
that reads it, and it prints a warning on startup if it finds one in the
environment.

The anon key is different and is safe to ship: it asserts the `anon` role and
nothing else, and every table it can reach is behind the policies in step 15.
That is the whole design — the key is public, the *policies* are the security.

---

## 4. Enable the Google provider

**Dashboard → Authentication → Sign In / Providers → Google**

Toggle it on. You will see two empty fields, **Client ID** and **Client
Secret**, and — importantly — a read-only **Callback URL (for OAuth)** box.

**Leave this tab open.** You need the callback URL for step 8, and you come
back here in steps 9 and 10 to paste the credentials Google gives you.

---

## 5. Create a Google Cloud project

Go to <https://console.cloud.google.com>.

Use the project dropdown at the top of the page → **New Project**.

| Field | What to put |
|---|---|
| Project name | `Backstage` |
| Organization / Location | Whatever the console defaults to |

Create it, then **make sure it is the selected project** in that dropdown
before doing anything else. Configuring the consent screen of the wrong project
is the single most common way to lose half an hour here.

---

## 6. Configure the OAuth consent screen

**Google Cloud Console → APIs & Services → OAuth consent screen**

(In the newer console this may appear under **Google Auth Platform → Branding**
and **→ Audience**.)

**User type:**

- **External** — anyone with a Google account can sign in. This is what you
  want unless you have a Google Workspace organisation and only its members
  should have access.
- **Internal** — only accounts in your Workspace organisation. Only offered if
  you have one.

Fill in:

| Field | What to put |
|---|---|
| App name | `Backstage` — this is what the user sees on the Google consent screen |
| User support email | Your email address |
| App logo | Optional; skip it, a logo triggers a verification review |
| Application home page | Optional |
| Developer contact information | Your email address (required) |

**Scopes:** click **Add or remove scopes** and make sure these three are
selected. They are the non-sensitive defaults and need no Google review:

- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`
- `openid`

Backstage needs exactly these: the email identifies the account, and the
profile supplies the display name and avatar you see in the account menu. Do
not add anything else — every additional scope is more access than the app uses
and pushes you towards a verification review.

**Test users:** while the app is in *Testing* status, only accounts listed here
can sign in. Add your own Google address, and any second account you want for
the multi-user isolation test in step 16.

> An **External** app in *Testing* is limited to 100 test users and its refresh
> tokens expire after 7 days. That is fine for development. For real users,
> click **Publish app** — with only the three scopes above, publishing does not
> require Google's verification review.

---

## 7. Create the Google OAuth client

**Google Cloud Console → APIs & Services → Credentials → Create Credentials →
OAuth client ID**

**Application type: `Web application`.**

This is the counter-intuitive part, and it is worth understanding rather than
just doing.

Backstage is a desktop app, so "Desktop app" looks correct. It is not. The
OAuth client is not used by Backstage — it is used by **Supabase**, which is a
web service, and Google must redirect to Supabase's HTTPS endpoint. A "Desktop
app" client type will not accept that redirect URI and sign-in will fail.

| Field | What to put |
|---|---|
| Name | `Backstage — Supabase` (internal label only) |
| Authorised JavaScript origins | Leave empty |
| Authorised redirect URIs | See step 8 |

---

## 8. Authorised redirect URI

Under **Authorised redirect URIs**, click **Add URI**.

**Go back to the Supabase tab from step 4** (Authentication → Providers →
Google) and copy the **Callback URL (for OAuth)** exactly as it appears there.

It has this shape:

```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

**Copy it from your dashboard. Do not type it from this document** — the
project reference is yours and I do not know it. Paste it into Google exactly,
with no trailing slash and no changes.

That is the **only** redirect URI Google needs. In particular:

- `http://localhost:8765/auth/callback` does **not** go here. That is
  Backstage's own loopback address, and Google never sees it — Supabase
  redirects there afterwards. It goes in the Supabase allow-list in step 11.

Click **Create**.

---

## 9. Client ID

Google now shows a dialog with **Client ID** and **Client secret**. The client
ID looks like:

```
123456789012-abc123def456.apps.googleusercontent.com
```

Copy it into **Supabase → Authentication → Providers → Google → Client ID**.

It does **not** go in `.env`. Backstage never sees it — Supabase is what talks
to Google.

---

## 10. Client secret

Copy the **Client secret** into **Supabase → Authentication → Providers →
Google → Client Secret**, then click **Save** in Supabase.

### ⚠️ Never commit this

The client secret goes in **exactly one place: the Supabase dashboard.**

- Not in `.env`
- Not in the repository
- Not in the Electron app

Backstage has no field, variable or code path for it. If it ever leaks, revoke
it in Google Cloud Console → Credentials and generate a new one.

---

## 11. Supabase redirect configuration

**Dashboard → Authentication → URL Configuration**

This is where Backstage's own loopback address goes, and getting it wrong is
the most likely cause of a failed sign-in.

**Site URL:**

```
http://localhost:8765/auth/callback
```

**Redirect URLs** — click **Add URL**:

```
http://localhost:8765/auth/callback
```

Then **Save**.

### Why this address

Supabase will only redirect to a URL on this allow-list. Backstage asks it to
redirect to `http://localhost:8765/auth/callback`, so that exact string must be
present or Supabase silently sends the user to the Site URL instead and the app
never receives the code.

`8765` is Backstage's default. If you set `BACKSTAGE_AUTH_PORT` to something
else in `.env`, add that address here too.

---

## 12. Electron-specific OAuth notes

Worth reading once, because Backstage does not do what a browser tutorial would
tell you to.

### The flow

```
  Backstage (Electron main process)
      │
      │ 1. opens a loopback listener on 127.0.0.1:8765
      │ 2. asks Supabase for an authorisation URL (PKCE)
      ▼
  Your default browser  ──────►  Google  ──────►  Supabase
                                                      │
      ┌───────────────────────────────────────────────┘
      │ 3. Supabase redirects to
      ▼    http://localhost:8765/auth/callback?code=…
  Backstage's loopback listener
      │ 4. exchanges the code + PKCE verifier for a session
      ▼
  Session encrypted to disk, listener closed
```

### Why the system browser and not a window inside the app

RFC 8252 (*OAuth 2.0 for Native Apps*) says a native app must use the system
browser. An embedded `BrowserWindow` would be Backstage rendering Google's
password field — indistinguishable to the user from an app harvesting it, and
Google actively blocks the known embedded-webview user agents anyway.

So `shell.openExternal()` opens your real browser, where you can see the
`accounts.google.com` address bar and any existing Google session applies.

### Why loopback and not a `backstage://` deep link

Both are RFC 8252-approved. Loopback was chosen because a custom scheme has to
be registered with the operating system, and
`app.setAsDefaultProtocolClient()` behaves differently under `electron-vite dev`
than in a packaged build — so the path that worked in development would be the
one that broke after packaging, silently. A TCP port either binds or it does
not, identically in both.

### The listener is loopback-only

Backstage binds `127.0.0.1:8765` **and** `[::1]:8765` explicitly, rather than
letting Node bind every interface (its default when no host is given).

Both, because which address `localhost` resolves to varies by machine —
Windows usually answers `::1`, many Linux setups answer `127.0.0.1` — and
binding one would break sign-in on the half of the world that resolves the
other.

Loopback-only, for two reasons. Nothing on your network can reach the callback
endpoint; and on Windows, a listener on a real network interface makes the OS
raise a firewall prompt ("do you want to allow public and private networks to
access this app?") the first time you sign in. Backstage does not need that
access, and a security dialog appearing at the exact moment you are deciding
whether to trust the app with your Google account is the worst possible time
for one. Loopback listeners are never filtered, so no prompt appears.

The listener exists only during a sign-in and is closed the moment the code
arrives, the attempt is cancelled, or five minutes pass. There is no
long-running local server in Backstage.

### Development vs production

They are the same. There is no separate development callback and nothing to
change when packaging: the port is fixed, the redirect URL is one string, and
neither depends on how the app was launched.

### PKCE

Backstage uses the PKCE flow (`flowType: 'pkce'`). Supabase returns a
single-use `code` rather than tokens, and that code is worthless without the
verifier held in the Electron main process. That is what makes a plain HTTP
loopback redirect safe — anything else listening on your machine that
intercepted the code could not redeem it.

### Where the session lives

Encrypted on disk with Electron's `safeStorage` — DPAPI on Windows, the
Keychain on macOS, libsecret/kwallet on Linux — in your `userData` directory:

```
<userData>/auth/supabase-session.enc
```

The Supabase client lives entirely in the **main process**. The renderer never
receives an access token, a refresh token or a client — it can ask who is
signed in and ask for that to change, and nothing else. This is the same rule
the provider API keys already follow.

On Linux with no keyring service running, `safeStorage` is unavailable and the
session falls back to plaintext with a console warning. Install and run
`gnome-keyring` or `kwallet` to avoid that.

### Session restoration

On launch the main process reads the encrypted file and refreshes the access
token if it has expired — **before the window is created**. That is why there
is no flash of the login page for an already-signed-in user: the renderer's
first frame already knows the answer.

---

## 13. Environment variables

Copy `.env.example` to `.env` in the project root and fill in the two values
from steps 2 and 3:

```bash
cp .env.example .env
```

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...

# Optional. Defaults to 8765. If you change it, add the new address to the
# Supabase redirect allow-list in step 11.
# BACKSTAGE_AUTH_PORT=8765
```

`.env` is already in `.gitignore`.

Restart Backstage after changing it — the file is read once at startup.

Values already present in the real environment take precedence over the file,
so CI or a launcher can override it without editing anything.

---

## 14. Database migrations

The schema lives in the repository:

```
supabase/migrations/0001_auth_and_ownership.sql
```

### Applying it

**Option A — Dashboard (simplest):**

1. **Dashboard → SQL Editor → New query**
2. Paste the entire contents of the file
3. **Run**

**Option B — Supabase CLI:**

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

The migration is written to be re-runnable: every object is `create ... if not
exists` and every policy is dropped before being created, so running it twice
is harmless.

### What it creates

| Table | Purpose | Owner | Key columns | RLS |
|---|---|---|---|---|
| `profiles` | Display data for the account — name, email, avatar. Never a credential; Supabase Auth owns authentication. | `id` **is** `auth.users.id` | `id`, `email`, `display_name`, `avatar_url` | `auth.uid() = id` |
| `projects` | A workspace folder, a world, a cast, a team lead. The container everything else hangs off. | `user_id` | `id`, `user_id`, `name`, `workspace_path`, `theme_id`, `character_roster`, `god_agent_id` | `auth.uid() = user_id` |
| `agents` | Agent configuration: role, instructions, capabilities, provider and model. **No API keys.** | `user_id` + `project_id` | `id`, `user_id`, `project_id`, `role`, `provider_id`, `capabilities`, `can_talk_to`, `leads` | `auth.uid() = user_id` **and** the project must be yours |
| `conversations` | One agent's private memory inside one project. Two agents never share one. | `user_id` + `project_id` | `id`, `user_id`, `project_id`, `agent_id` | `auth.uid() = user_id` **and** the project must be yours |
| `messages` | The lines in a conversation. | `user_id` + `conversation_id` | `id`, `conversation_id`, `user_id`, `kind`, `body`, `at` | `auth.uid() = user_id` **and** the conversation must be yours |
| `cases` | One investigation and the tasks run under it. | `user_id` + `project_id` | `id`, `user_id`, `project_id`, `name`, `status`, `task_ids` | `auth.uid() = user_id` **and** the project must be yours |
| `user_settings` | Orchestration limits — chain depth, cooldowns, spend guards. Account-level, not project-level. | `user_id` (primary key) | `user_id`, `orchestration` | `auth.uid() = user_id` |

It also creates:

- **`handle_new_user()`** + a trigger on `auth.users` — creates the `profiles`
  row when the account is created, so a profile exists even for someone whose
  first sign-in happened on a flaky connection.
- **`touch_updated_at()`** + triggers — maintains `updated_at` in the database
  rather than trusting the client.
- **`delete_own_account()`** — lets an account delete itself, including its
  `auth.users` row, which the anon key cannot otherwise touch. It takes no
  arguments and reads `auth.uid()` from the verified JWT, so it can only ever
  delete its caller. Without it, "Delete account" in Settings still removes all
  of the user's data but leaves the Supabase login in place, and says so.

### Provider API keys are not in this schema

There is no column for an OpenAI, Gemini or Anthropic key anywhere in the
migration, and that is deliberate rather than an omission. Provider credentials
are encrypted with the operating system's own key store on the machine that
owns them, in a directory derived from the Supabase user id, and never leave
it. Supabase holds the *account* and the application's metadata; it never holds
a credential for a third-party service.

Full reasoning in
[USER_PROVIDER_CONFIGURATION.md](./USER_PROVIDER_CONFIGURATION.md) §5–6.

### Tables deliberately not created

Two were in the original spec and are intentionally absent, because both would
be a second copy of data the app already holds elsewhere:

- **`agent_connections`** — collaboration links are `can_talk_to` and `leads`
  arrays on `agents`. That is the shape the application reads and writes them
  in; a join table would need keeping in step by hand.
- **`project_settings`** — a Backstage project's settings *are* its columns:
  theme, roster, team lead. A separate table would hold one row per project
  containing the same values.

---

## 15. RLS policies

**Row level security is enabled and forced on all seven tables.** This is not
optional and it is not defence in depth — for this application it is the
security boundary.

### Why frontend filtering is not enough

Backstage ships the anon key inside the application. That is fine by design,
but it means anyone who installs Backstage can send arbitrary PostgREST queries
to your database. The client filters by user, and the Electron main process
refuses to serve another account's rows — and **neither of those protects
anything**, because both run on the attacker's machine where they can be
edited.

The policies run inside Postgres, against `auth.uid()` taken from the verified
JWT. They are what stands between one user's projects and another user's
`select`.

### The shape of every policy

```sql
create policy "projects: read own" on public.projects
  for select using ((select auth.uid()) = user_id);

create policy "projects: update own" on public.projects
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

Both halves matter. `using` decides which existing rows a statement may see or
touch; `with check` decides what a row may look like afterwards. An update
policy with only `using` would let a user reassign `user_id` and hand their
project to someone else — visible to neither of them afterwards.

For child tables the check goes further: inserting an agent requires both that
the agent is yours *and* that the project it names is yours. Without the second
condition a user could create an agent, correctly stamped with their own id,
inside somebody else's project — and it would appear in that project's roster.

`force row level security` is set on every table as well. Without it, a
connection that happens to be the owning role bypasses every policy — the
footgun that makes an RLS setup look correct in testing and not be.

### Verifying the policies

**Dashboard → Authentication → Policies.** Every one of the seven tables must
show **RLS enabled** and its policies listed. A table showing "RLS not enabled"
is world-readable to anyone holding the anon key.

To test properly, use the SQL editor with an impersonated user:

```sql
-- Should return only your own rows.
select id, user_id, name from public.projects;

-- Count all rows, bypassing nothing: if RLS is working, a second user's
-- projects are not in the result above even though they are in this count.
select count(*) from public.projects;
```

Then in **Dashboard → SQL Editor**, use the role switcher to run as
`authenticated` with a specific user id and confirm the first query narrows.

---

## 16. Testing checklist

### Configuration

- [ ] Supabase project created
- [ ] `SUPABASE_URL` in `.env`
- [ ] `SUPABASE_ANON_KEY` in `.env`
- [ ] Service-role key is **not** in `.env` or anywhere in the repo
- [ ] Google provider enabled in Supabase
- [ ] Google Cloud project created and selected
- [ ] OAuth consent screen configured, with the three default scopes
- [ ] Your Google account added as a test user (if the app is in Testing)
- [ ] OAuth client created as **Web application**
- [ ] Supabase's callback URI added to Google's authorised redirect URIs
- [ ] Client ID pasted into Supabase
- [ ] Client secret pasted into Supabase
- [ ] `http://localhost:8765/auth/callback` in Supabase's Site URL and Redirect URLs
- [ ] Migration applied
- [ ] RLS shows as enabled on all seven tables

### The flow

- [ ] Landing page → **Get Started** → login page
- [ ] Login page shows the pixel office with characters moving
- [ ] **Continue with Google** shows "Connecting to Google…" and opens the browser
- [ ] Completing Google sign-in returns to Backstage and lands on your projects
- [ ] Your Google name, avatar and email appear in the account menu
- [ ] A `profiles` row exists in Supabase for your account
- [ ] First sign-in offers provider setup; skipping it still opens the app
- [ ] Settings → Profile can change the display name, and it persists
- [ ] Settings → AI Providers shows Claude Code's real status
- [ ] Provider keys connected as one account are invisible to another
- [ ] Creating a project writes a `projects` row with your `user_id`
- [ ] Configuring agents writes `agents` rows
- [ ] Sending an agent a message persists the conversation
- [ ] ALL AGENTS still delegates, runs workers and synthesises
- [ ] Creating a case persists it
- [ ] Theme switching still works
- [ ] Claude Code / terminal sessions still work
- [ ] Close and reopen Backstage → still signed in, projects still there
- [ ] **Log out** → login page
- [ ] After logging out, the dashboard is unreachable
- [ ] Close and reopen after logging out → login page

### Isolation (needs two Google accounts)

- [ ] Sign in as user A, create project A with agents and a chat
- [ ] Log out, sign in as user B
- [ ] User B sees **no** projects, agents, chats or cases from A
- [ ] Create project B as user B
- [ ] Log out, sign back in as A — project A is there, project B is not

If you only have one Google account, verify statically instead: check
**Authentication → Policies** shows RLS enabled on all seven tables, and run
the queries in step 15 as an impersonated user in the SQL editor.

---

## 17. Troubleshooting

### "Not configured yet" on the login page

`.env` is missing, in the wrong place, or was added after the app started.

- It must be at the **project root**, beside `package.json`
- Restart Backstage — it is read once at startup
- Check for typos: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- No quotes needed around the values

### `redirect_uri_mismatch` from Google

Google's authorised redirect URI does not exactly match Supabase's callback.

- Copy it again from **Supabase → Authentication → Providers → Google →
  Callback URL** and paste it into Google Cloud → Credentials → your OAuth
  client
- No trailing slash, `https` not `http`, correct project reference
- Google can take a few minutes to propagate a change

### The browser opens, I sign in, and Backstage never notices

Supabase redirected somewhere other than the loopback listener.

- Check **Authentication → URL Configuration** contains
  `http://localhost:8765/auth/callback` in **Redirect URLs**, exactly
- If you set `BACKSTAGE_AUTH_PORT`, that address must be on the list too
- Look at the address bar of the tab you were left on — if it is your Site URL
  rather than `localhost:8765`, the allow-list is the problem

### "Port 8765 is already in use"

Something else on your machine holds the port.

```bash
# Windows
netstat -ano | findstr :8765

# macOS / Linux
lsof -i :8765
```

Either stop it, or set `BACKSTAGE_AUTH_PORT=8766` in `.env` **and** add
`http://localhost:8766/auth/callback` to the Supabase redirect allow-list.

### Windows asks whether to allow network access

It should not, and if it does, something is wrong. Backstage binds the callback
listener to loopback addresses only, and Windows Firewall never prompts for
those.

If you see the prompt, you are almost certainly running an older build — stop
every `electron.exe`, rebuild, and try again. **Cancel** the prompt rather than
allowing it; Backstage does not need, and does not want, access from public or
private networks. Sign-in works either way.

### `Error 403: access_denied` on the Google screen

Your app is in *Testing* and the account you are using is not a test user.

Add it under **OAuth consent screen → Test users**, or publish the app.

### "Google sign-in is not enabled for this Backstage installation yet"

The Google provider is off in Supabase, or was saved without both credentials.
Go back to step 4 and confirm the toggle is on and both fields are filled.

### Signed out every time I reopen the app

- **Linux:** `safeStorage` needs a keyring. Install and run `gnome-keyring` or
  `kwallet`, or the session cannot be decrypted on the next launch.
- **Any platform:** an External app in *Testing* status has refresh tokens that
  expire after 7 days. Publish the app to lift that.
- Check the console for `[auth] could not restore the stored session`.

### Sign-in works but the app shows no projects

Expected on a second machine, and expected for a second account. Projects are
tied to a workspace folder on a specific machine — the cloud mirror holds the
metadata but Backstage will not invent a local path for it. Create the project
again pointing at the same folder.

If it happens on the machine that *created* the project, check the console for
`[auth] claimed N pre-account project(s)`. That migration runs once per
machine, for the first account to sign in — a second account deliberately does
not inherit the first's projects.

### `permission denied for table ...` / RLS errors in the console

The migration has not been applied, or was applied partially.

Re-run `supabase/migrations/0001_auth_and_ownership.sql` in the SQL editor. It
is safe to run again.

If reads work but writes fail, you are probably missing the `with check` half
of a policy — re-running the migration restores it.

### The profile row is missing

The trigger did not fire, usually because the migration was applied after the
account was already created.

Sign out and back in: Backstage upserts the profile on every sign-in as well,
so it will self-heal. If it does not, check that
`handle_new_user()` and the `on_auth_user_created` trigger both exist.

### Anything else

Run with DevTools open and check the console:

```bash
OPEN_DEVTOOLS=1 npm run dev
```

Auth failures are logged in the main process with the `[auth]` prefix and cloud
sync failures with `[sync]`. The full technical error is always there, even
though the login page deliberately shows a plain one.
