# Backstage — AI Provider Configuration

How your agents get their intelligence, where your API keys live, and why
nobody else can use them.

Companion to [SUPABASE_GOOGLE_AUTH_SETUP.md](./SUPABASE_GOOGLE_AUTH_SETUP.md),
which covers signing in. This document covers what happens after.

---

## Contents

1. [The short version](#1-the-short-version)
2. [Connecting OpenAI](#2-connecting-openai)
3. [Connecting Gemini](#3-connecting-gemini)
4. [Configuring Claude Code](#4-configuring-claude-code)
5. [Where keys are stored](#5-where-keys-are-stored)
6. [The credential policy](#6-the-credential-policy)
7. [Environment variables](#7-environment-variables)
8. [Model selection](#8-model-selection)
9. [What happens with no provider](#9-what-happens-with-no-provider)
10. [Per-user isolation](#10-per-user-isolation)
11. [Pre-account keys](#11-pre-account-keys)
12. [Claude Code detection](#12-claude-code-detection)
13. [Security notes](#13-security-notes)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. The short version

- Every user brings their **own** API keys. Backstage has none of its own.
- Keys are encrypted by your **operating system** and stored **on your
  machine**, in a directory belonging to your Backstage account.
- Keys are **never** uploaded to Supabase, never sent over IPC to the app
  window, never logged, and never shown back to you in full.
- Two people using Backstage on the same computer have **completely separate**
  provider configurations.
- There is **no fallback**. If you have not connected a provider, requests to
  it do not happen — Backstage will not quietly use somebody else's key or one
  from the environment.

You are offered provider setup once, right after your first Google sign-in.
You can skip it and connect providers later in **Settings → AI Providers**.

---

## 2. Connecting OpenAI

1. Get a key from <https://platform.openai.com/api-keys>. It starts `sk-`.
2. In Backstage: **Settings → AI Providers → OpenAI**.
3. Paste the key and press **Connect**.

Backstage verifies the key against OpenAI *before* storing it, so a typo is
reported immediately rather than surfacing later as a failed agent run. Once
verified it fetches the model list and selects a default.

After connecting, the card shows `…1234` — the last four characters only. The
full key is never redisplayed, by you or by anyone.

---

## 3. Connecting Gemini

1. Get a key from <https://aistudio.google.com/apikey>.
2. **Settings → AI Providers → Gemini**.
3. Paste and **Connect**.

Identical flow to OpenAI: verified before it is stored, models fetched on
success, masked thereafter.

> Your Gemini API key is unrelated to the Google account you signed into
> Backstage with. Signing in with Google does **not** give Backstage access to
> any Google AI service — it only identifies you.

---

## 4. Configuring Claude Code

Claude Code is different in kind, and the interface says so.

There is **no API key to enter**. Claude Code is a CLI on your machine, and
Backstage drives it by opening a real terminal and running `claude` in it —
the same thing you would do yourself. It authenticates through your own Claude
subscription or Anthropic account, entirely outside Backstage.

So **Settings → AI Providers → Claude Code** shows status, not a form:

| State | Meaning | What to do |
|---|---|---|
| ● **Available** | `claude` resolves on PATH and reports a version | Nothing |
| ! **Not installed** | `claude` is not on PATH | Install Claude Code |
| ! **Found, but won't run** | It is installed but failed to execute | Check it runs in your own terminal — reinstalling is probably not the fix |

**Test connection** re-checks. The version shown is only ever one Claude Code
actually reported; if it prints something unrecognised, the line is omitted
rather than guessed at.

Agents configured against OpenAI or Gemini are unaffected by any of this.
Claude Code is a session you drive, not a provider agents are assigned to.

---

## 5. Where keys are stored

```
<userData>/credentials/
    u_<hash of your Supabase user id>/
        openai.key            ← ciphertext, OS-encrypted
        openai.config.json    ← selected model + "…1234" hint
        gemini.key
        gemini.config.json
```

`<userData>` is:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\Backstage` |
| macOS | `~/Library/Application Support/Backstage` |
| Linux | `~/.config/Backstage` |

**Encryption** is Electron's `safeStorage`, which encrypts against a key held
by the operating system:

- **Windows** — DPAPI, tied to your Windows user account
- **macOS** — the Keychain
- **Linux** — libsecret / kwallet

This is the same mechanism, and the same code, that stored keys before
Backstage had accounts. What changed is the directory: it is now derived from
your Supabase user id, so two accounts on one machine get two directories.

The directory name is a hash rather than the raw user id, so a directory
listing does not enumerate who has signed in on the machine. That is tidiness,
not security — the security is the ciphertext inside.

### What is NOT stored

- Nothing in Supabase. There is **no column for an API key anywhere in the
  schema**, which is the strongest available statement that none is stored.
- Nothing in the renderer. The app window never receives a key; the most it
  learns is that one exists and its last four characters.
- Nothing in git. `<userData>` is outside the repository entirely.

---

## 6. The credential policy

This is deliberately the entire policy:

> **A request is made with the credential the signed-in user stored for that
> provider. If they have not stored one, the request does not happen.**

Implemented in one place — `resolveProvider()` in
[`providers/registry.ts`](./providers/registry.ts) — which every agent
execution goes through.

### What is never consulted

| Not used | Why |
|---|---|
| `process.env.OPENAI_API_KEY` and every sibling | Environment variables configure the *application*, never a user's credentials. A developer running from a shell that exports a key must not have it silently spent by whoever signs into their build. |
| Another account's key | Keys are stored per Supabase user id, and `currentUserId()` is read at the moment of use rather than cached. |
| A cached client | Providers are constructed per call from the key on disk. No long-lived client holds a credential that could outlive the session that authorised it. |

**The absence of a fallback is the feature.** Every fallback in a system like
this is a path by which one person's request goes out on another person's
credential — and the failure is invisible, because the request *succeeds*.
Nobody investigates until the bill arrives.

### The three failures, distinguished

`resolveProvider` returns which of these happened, so the interface can say
something useful:

| Failure | Message |
|---|---|
| `no_account` | "Sign in to Backstage before running an agent." |
| `no_key` | "Connect your OpenAI API key in Settings → AI Providers." |
| `unknown_provider` | "There is no provider called …" |

Collapsing them into one "not connected" would send people to the wrong screen.

---

## 7. Environment variables

Backstage reads **exactly four** environment variables, and none of them is a
provider credential:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Which Supabase project to authenticate against |
| `SUPABASE_ANON_KEY` | The public client key for it |
| `BACKSTAGE_AUTH_PORT` | Optional. The OAuth loopback port (default 8765) |
| `OPEN_DEVTOOLS` | Optional. Open DevTools in development |

### Precedence

For **application configuration** (the Supabase pair): the real environment
wins over `.env`, so CI or a launcher can override the file without editing it.

For **provider credentials**: there is no precedence, because there is only one
source. The signed-in user's encrypted key, or nothing.

If you export `OPENAI_API_KEY` in your shell, Backstage ignores it. This is not
an oversight — see [section 6](#6-the-credential-policy).

`SUPABASE_SERVICE_ROLE_KEY` is never read, and Backstage prints a warning on
startup if it finds one in the environment, because it bypasses every row level
security policy in the database and does not belong anywhere near a desktop
app.

---

## 8. Model selection

Each provider has a **selected model**, chosen on its card in Settings. The
list comes from the provider's own API at connection time — nothing is
hard-coded, so a model that has been retired stops appearing without any change
to Backstage.

Each **agent** may additionally pin its own model, on the Agents page. The
resolution is:

```
agent.modelId  ?? provider's selected model  ?? error
```

An agent with no model available anywhere refuses to spawn and says so, rather
than picking one on your behalf.

Model choice is per user, stored beside the key in
`<provider>.config.json`, and is not shared between accounts.

---

## 9. What happens with no provider

Nothing breaks. Specifically:

- The app opens.
- Projects, the pixel world, themes, the terminal, Claude Code sessions, files
  and git all work — none of them needs an API key.
- Agents appear in the roster but **cannot be spawned**. Each one says why, in
  its own card: *"OpenAI is not connected. Add your API key in Settings → AI
  Providers."*
- The onboarding screen can be skipped, and does not come back.

This is deliberate. Blocking entry on an API key would make a new user's first
experience of the product a form they may not be able to fill in.

---

## 10. Per-user isolation

Signing out and signing in as somebody else gives a completely different
provider configuration. Concretely, on sign-out Backstage:

1. stops every running agent execution;
2. kills terminal and Claude Code sessions — a PTY outlives its window, and its
   scrollback contains the previous user's paths and history;
3. closes the active project, which clears the workspace root that every file
   and terminal tool validates against;
4. drops any queued cloud writes belonging to the previous account;
5. pushes empty provider state to the window, so the previous user's masked key
   hint is not left on screen;
6. clears the renderer's stores — transcripts, roster, approvals, sessions.

And on sign-in it re-verifies **that account's** keys, clearing the cached
model lists and connection flags first so nothing describes a key the new
account does not have.

Because `secureStore` derives its directory from `currentUserId()` on **every
read and write**, with nothing cached, there is no stale handle that could
point at the previous account's directory after a switch.

### Verifying it yourself

Sign in as A, connect an OpenAI key, note the `…1234` hint. Sign out, sign in
as B: OpenAI reads as not connected, with no hint. Connect a different key as
B, sign back in as A — A's original hint is back, unchanged.

---

## 11. Pre-account keys

Backstage stored provider keys before it had accounts, so an upgrading install
has a loose `openai.key` in the credentials root belonging to nobody.

**It is adopted only on a machine that has only ever had one account.**

"Give it to the first person who signs in" satisfies the letter of the
requirement and not its spirit: on a machine two people already share, *first*
is a coin toss, and losing it means one person's API key silently becomes
another's. So the bar is higher — the keys are moved into an account's
directory only when both of these are true:

- at most one distinct account has ever signed in on this machine; **and**
- at most one distinct account owns a stored project on it.

If either says otherwise, nothing is claimed and everyone connects their own
key. The loose file is **never deleted** — a single-account machine that later
becomes shared has lost nothing, and a developer who upgrades keeps working.

You will see one of these lines in the console on first sign-in after
upgrading:

```
[credentials] claimed 1 pre-account provider key(s) for the first signed-in
user. No other account inherits them.
```

```
[credentials] more than one account has been used on this machine, so
pre-account provider keys were left alone. Each user connects their own.
```

---

## 12. Claude Code detection

Backstage checks whether Claude Code is usable **before** opening a terminal to
run it in.

Without that check the failure is genuinely confusing: a terminal appears, the
command runs, the shell prints `'claude' is not recognized as an internal or
external command`, and the user has to work out from that whether Backstage is
broken, their PATH is broken, or Claude Code was never installed.

### How it works

Two steps, in the main process — the renderer never runs a command, it asks a
question:

1. **Does the name resolve?** `where claude` on Windows, `command -v claude`
   elsewhere. No → `NOT_INSTALLED`.
2. **Does running it work?** `claude --version`. No → `FAILED_TO_START`, with
   the real stderr kept for the settings panel.

Collapsing these into one check is the mistake the whole module exists to
avoid: telling somebody to reinstall a CLI that is already on their PATH wastes
their afternoon.

Both commands are literal constants with literal arguments. No project name,
file path, prompt or other user-controlled string reaches a shell.

### States

| State | Where it comes from |
|---|---|
| `AVAILABLE` | Detection |
| `NOT_INSTALLED` | Detection |
| `FAILED_TO_START` | Detection |
| `RUNNING` / `STOPPED` | The session, via `AgentSessionStatus` — these describe a session, not the machine |

### When it is missing

Pressing **Start Claude** with Claude Code unavailable shows a Backstage
notice, not a shell error:

> **CLAUDE CODE NOT FOUND**
> Backstage tried to start a Claude Code session, but Claude Code doesn't
> appear to be installed on this computer. Install it and try again — nothing
> else needs configuring.
> [ VIEW SETUP ] [ CLOSE ]

A `FAILED_TO_START` gets different words, because "reinstall it" is wrong
advice for a CLI that is already there.

Commands you type yourself go straight through, unchecked — intercepting
arbitrary input would mean Backstage deciding which of your programs exist.

---

## 13. Security notes

| Concern | How it is handled |
|---|---|
| Key at rest | OS-encrypted via `safeStorage` (DPAPI / Keychain / libsecret) |
| Key in transit to the app window | Never happens. No IPC channel returns a key |
| Key in the cloud | Never uploaded. No column exists for one |
| Key in logs | Never logged. Errors are classified, not echoed |
| Key in the UI | Masked to the last four characters, always |
| Key in git | `<userData>` is outside the repository |
| Cross-user access | Directory derived per Supabase user id, resolved per call |
| Developer key inheritance | Blocked on any multi-account machine (§11) |
| Renderer running commands | It cannot. It asks whether Claude Code exists; the main process runs the check |
| Shell injection in detection | No interpolation. Both commands are constants |

### If secure storage is unavailable

On Linux with no keyring service running, `safeStorage` cannot encrypt.
Backstage **refuses to save the key** rather than writing it in plaintext, and
says so. Install and run `gnome-keyring` or `kwallet`.

(The Supabase *session* is treated differently — it falls back to plaintext
with a loud warning, because refusing would make the app unusable rather than
degraded, and the token expires. An API key does not expire.)

---

## 14. Troubleshooting

### "Connect your OpenAI API key in Settings → AI Providers"

You have not connected that provider *on this account*. Note the account part:
if you were previously signed in as someone else on this machine, their key is
still there and still theirs.

### My key disappeared after I signed in as someone else

It did not. It is in the other account's directory. Sign back in as that
account.

### "This machine has no secure credential storage available"

`safeStorage` cannot reach an OS keyring. On Linux, install and start
`gnome-keyring` or `kwallet`. Backstage will not write the key in plaintext.

### The agent says "No model is selected"

Connect (or re-test) the provider so Backstage can fetch its model list, then
pick one on the provider card, or pin one on the agent.

### I set OPENAI_API_KEY and Backstage ignores it

Correct, and deliberate. See [section 6](#6-the-credential-policy). Connect the
key in Settings instead.

### Claude Code says "not installed" but I can run `claude`

Backstage inherits the PATH of the process that launched it. If you installed
Claude Code after starting Backstage — or added it to a shell profile that a
GUI launch does not read — restart Backstage. If it still says so, run
**Test connection** in Settings, which ignores the cached answer.

### Claude Code says "Found, but won't run"

It is installed. Run `claude --version` in your own terminal — whatever fails
there is the actual problem. Settings shows the error output Backstage
received.

### After deleting my account, was my key removed?

Yes. Account deletion removes your encrypted credential directory, your local
preferences, and every row you own in Supabase. It does not touch your project
folders or source code.
