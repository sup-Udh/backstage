# Backstage v1.0.0-beta.1

**Backstage v1.0.0-beta.1 is the first public beta.**

Backstage turns AI agents into a visual development team working inside your
real project workspace.

> ⚠️ **This is an early beta release. Expect bugs and incomplete features.**
> It is not production-stable, it is not code-signed, and it is Windows-only.

---

## What is Backstage?

You point Backstage at a folder on your computer. That folder becomes a
project — with a world, a team and a cast of agents that live in it. The
agents read, write and run things inside that folder and nowhere else, and you
watch them do it as characters in a pixel office rather than as a wall of log
output.

Your source code never leaves your machine.

---

## Highlights

- **AI agent workspaces** — a project is a real folder, a world and a team of
  its own.
- **Project-scoped isolation** — agents can only reach the folder of the
  project you have open. Nothing outside it is readable, writable or runnable.
- **Multi-agent collaboration** — agents delegate to one another, run as a
  team, and report back into a single reconstructed timeline.
- **Group chats** — talk to several agents at once, or let them talk to each
  other.
- **Automations** — daily, weekly, interval and event triggers, described in
  plain English.
- **Permissions and Auto Allow** — every impactful action is gated. Auto Allow
  is a convenience layer over those rules, never a way around them; anything
  Backstage does not recognise is treated as impactful.
- **OpenAI integration** — bring your own key.
- **Claude Code integration** — detected on your PATH, running real sessions
  against your project.
- **Integrated terminal** — real PTY sessions, scoped to the open project.
- **Pixel-world activity** — characters walk to their own desks, change pose
  with what they are actually running, and talk face to face.
- **Themes** — six of them: office, lab, detective, sherlock, friends,
  stranger.
- **Light and dark**, following your system by default.

---

## Installation

**Windows 10 or 11, 64-bit.**

1. Download **`Backstage-Setup-1.0.0-beta.1.exe`** below.
2. Run it. It installs per-user into `%LOCALAPPDATA%\Programs\Backstage`, so
   it does not need admin rights.
3. Launch **Backstage** from the Start Menu or the desktop shortcut.

### You will see "Windows protected your PC"

This build is **not code-signed**, so SmartScreen cannot verify who published
it — and it says so. That warning is correct and expected.

To continue: **More info → Run anyway**.

If you would rather check the download first, every artifact ships a SHA-256
checksum as a `.sha256` asset on this release:

```powershell
Get-FileHash .\Backstage-Setup-1.0.0-beta.1.exe -Algorithm SHA256
```

Compare the result with the contents of
`Backstage-Setup-1.0.0-beta.1.exe.sha256`.

### Portable

`Backstage-Portable-1.0.0-beta.1.exe` runs without installing. It still stores
user data in `%APPDATA%\Backstage`.

---

## First run

1. **Sign in** with Google.
2. **Connect a provider** — paste an OpenAI or Gemini API key on the Account
   page. Keys are stored encrypted, per user, on your machine.
3. **Select or create a project** — point it at a real folder.
4. **Spawn agents** and give them work.

Claude Code, if it is installed and on your PATH, is picked up automatically.
Nothing else needs configuring.

---

## Known limitations

Being honest about what you are downloading:

- **Unsigned build.** SmartScreen warns on first run. Code signing needs a
  certificate that does not exist yet.
- **Windows only.** No macOS or Linux build in this release. Packaging config
  for both exists but has never been built or tested.
- **No auto-update.** Moving to the next version means downloading and running
  the next installer yourself. This release does publish the `latest.yml`
  manifest an updater will need, so this is groundwork, not a dead end.
- **Gemini is less exercised than OpenAI.** It is fully wired and has adapter
  tests, but OpenAI is the path with the most real use behind it. If an agent
  misbehaves on Gemini, try OpenAI before filing.
- **Google sign-in only.** No email/password and no other identity providers.
- **Agent behaviour is beta.** Long or unusual tasks can produce partial or
  confused results. The permission system is the backstop — read what you
  approve before you approve it.
- **Provider calls were not exercised end to end in the release build's QA.**
  Verification covered install, launch, branding, session persistence, project
  loading and Claude Code detection. Live OpenAI and Gemini completions need
  your own API key and were not run against the packaged artifact.

---

## Feedback

Bugs, rough edges and "this made no sense to me" are all useful right now.

**[Open an issue](https://github.com/sup-Udh/backstage/issues)** — and if it is
a crash, the version from the title bar plus what you were doing is enough to
start.

---

## Checksums

SHA-256 checksums for every artifact are attached to this release as `.sha256`
files, generated by the release workflow on the same runner that built them.

---

**License:** MIT · **Full changelog:** [CHANGELOG.md](CHANGELOG.md)
