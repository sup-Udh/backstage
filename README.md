# Backstage

**Give your AI agents a place to work.**

Backstage is a desktop application that turns AI agents into a visible
development team working inside one real folder on your computer. You pick a
project, you hire a cast, and you watch them work — as characters in a pixel
office, not as a scrollback buffer.

> ### ⚠️ This is an early beta
>
> **v1.0.0-beta.1** is the first public build. Expect bugs and incomplete
> features. It is not production-stable, it is not code-signed, and it is
> Windows-only for now. Please report what breaks —
> [open an issue](https://github.com/sup-Udh/backstage/issues).

---

## What it does

- **Project-scoped workspaces.** A project is a folder, a world and a team of
  its own. Agents can only reach the folder of the project you have open —
  nothing outside it is readable, writable or runnable.
- **A cast of agents.** Spawn characters with roles. Each has its own desk,
  its own tools and its own permissions.
- **Multi-agent collaboration.** Agents delegate to each other, run as a team
  and report back. Team runs are reconstructed into a single timeline.
- **Group chats.** Talk to several agents at once, or let them talk to each
  other.
- **Automations.** Schedule work — daily, weekly, on an interval, or on an
  event — and describe it in plain English.
- **Permissions and Auto Allow.** Every impactful action is gated. Auto Allow
  is a convenience layer over those rules and never a way around them.
- **Claude Code integration.** Backstage detects Claude Code on your PATH and
  runs real sessions against your project.
- **A pixel world.** Characters walk to their desks, change pose with what
  they are doing, and talk face to face. Six themes ship with the beta.
- **Light and dark.** Follows the system by default.

Your source code stays on your machine. Backstage keeps your account, projects
and conversations to you.

---

## Supported platform

| Platform | Status |
|---|---|
| **Windows 10/11 (x64)** | ✅ Supported — this is the beta target |
| macOS | ❌ Not built or tested for this release |
| Linux | ❌ Not built or tested for this release |

Packaging config for macOS (`dmg`) and Linux (`AppImage`) exists in
`electron-builder.yml` but has never been built or run. Treat it as a starting
point, not a supported target.

## Supported providers

| Provider | How it is used | Status in this beta |
|---|---|---|
| **OpenAI** | Agent reasoning and chat | Supported — the most exercised path |
| **Google Gemini** | Agent reasoning and chat | Supported, less exercised than OpenAI |
| **Claude Code** | Real CLI sessions in your project | Supported — detected on PATH |

You bring your own API keys. They are stored per-user in Backstage's encrypted
credential store and are never bundled into the application or sent anywhere
except to the provider they belong to.

---

## Install

1. Download **`Backstage-Setup-1.0.0-beta.1.exe`** from the
   [latest release](https://github.com/sup-Udh/backstage/releases).
2. Run it. It installs per-user into
   `%LOCALAPPDATA%\Programs\Backstage` — no admin rights needed.
3. Launch **Backstage** from the Start Menu or the desktop shortcut.

### "Windows protected your PC"

This beta is **not code-signed**, so SmartScreen will warn you the first time
you run the installer. That warning is accurate: Windows genuinely cannot
verify who published this.

To continue anyway: **More info → Run anyway**.

Verify what you downloaded first if you want to — every release ships a
SHA-256 checksum next to the installer:

```powershell
Get-FileHash .\Backstage-Setup-1.0.0-beta.1.exe -Algorithm SHA256
```

Compare it against `Backstage-Setup-1.0.0-beta.1.exe.sha256` on the release
page. See [CODE_SIGNING_SETUP.md](CODE_SIGNING_SETUP.md) for what signing will
take.

### Portable build

`Backstage-Portable-1.0.0-beta.1.exe` runs without installing. It still writes
user data to `%APPDATA%\Backstage`, so it is portable in the "no installer"
sense, not the "leaves no trace" sense.

---

## First run

1. **Sign in** with Google.
2. **Connect a provider** — paste an OpenAI or Gemini API key in Account.
3. **Create a project** — point it at a real folder on your machine.
4. **Spawn agents** and give them something to do.

If you have Claude Code installed and on your PATH, Backstage finds it on its
own; nothing else needs configuring.

---

## Known limitations

- **Unsigned build.** SmartScreen will warn on first run (see above).
- **Windows only.** No macOS or Linux build in this release.
- **No auto-update.** Updating means downloading the next installer by hand.
  The release already publishes the `latest.yml` manifest an updater will
  need — see [AUTO_UPDATE_PLAN.md](AUTO_UPDATE_PLAN.md).
- **Gemini is less exercised than OpenAI.** It is fully wired and has adapter
  tests, but OpenAI is the path that has seen the most real use. Prefer OpenAI
  if you hit trouble.
- **Google sign-in is the only sign-in.** No email/password, no other
  providers.
- **Agent behaviour is beta.** Long or unusual tasks can produce partial or
  confused results. Permissions are the backstop — read what you approve.
- **Signing in requires the hosted Backstage Supabase project.** Building from
  source means bringing your own (see below).

---

## Building from source

```bash
npm ci
npm run dev          # development, with hot reload
npm run typecheck    # tsc --noEmit
npm test             # unit + integration suites
npm run build        # production bundles into out/
npm run package      # unpacked app into release/win-unpacked
npm run dist         # NSIS installer + portable exe into release/
```

Signing in needs a Supabase project. Copy `.env.example` to `.env` and fill in
the **public** pair — the project URL and the anon/publishable key. Full
walkthrough, including the Google Cloud side, is in
[SUPABASE_GOOGLE_AUTH_SETUP.md](SUPABASE_GOOGLE_AUTH_SETUP.md).

Never put a `SUPABASE_SERVICE_ROLE_KEY` in that file. It bypasses every row
level security policy in the database. Backstage has no code path that reads
it and warns on startup if it finds one.

> **Packaging note.** Close any running Backstage instance that has this
> repository open as its project before `npm run dist`. Its file watcher holds
> a handle on `release/`, and Windows cannot rename a directory that is being
> watched — the build fails with `EPERM`.

---

## Documentation

| File | What it covers |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | What changed, per version |
| [RELEASE_NOTES_v1.0.0-beta.1.md](RELEASE_NOTES_v1.0.0-beta.1.md) | This release |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | What is verified before shipping |
| [DOWNLOAD_RELEASE_SETUP.md](DOWNLOAD_RELEASE_SETUP.md) | Wiring the download button on the website |
| [CODE_SIGNING_SETUP.md](CODE_SIGNING_SETUP.md) | What signing needs, and why this build is unsigned |
| [AUTO_UPDATE_PLAN.md](AUTO_UPDATE_PLAN.md) | How auto-update gets turned on later |
| [SUPABASE_GOOGLE_AUTH_SETUP.md](SUPABASE_GOOGLE_AUTH_SETUP.md) | Auth setup, end to end |
| [USER_PROVIDER_CONFIGURATION.md](USER_PROVIDER_CONFIGURATION.md) | How per-user provider keys work |

## License

[MIT](LICENSE) © 2026 udhay rajeev
