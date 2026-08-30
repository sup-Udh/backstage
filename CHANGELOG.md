# Changelog

All notable changes to Backstage are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-beta.1] — 2026-08-30

The first public beta. Windows only, unsigned, and expected to have bugs.

Everything below already existed in the application; this release is the point
at which it became installable by someone who is not the author. Entries are
what a beta user gets, not a commit log.

### Added — the application

- **Project-scoped workspaces.** A project is a folder, a world and a team.
  Agents can reach only the folder of the open project — nothing outside it is
  readable, writable or runnable.
- **Agent cast.** Spawn characters with roles, each with its own desk, tools
  and permissions. Every theme's cast can be assembled into a working team.
- **Multi-agent collaboration.** Delegation between agents, team runs
  reconstructed into one timeline, and one worker failing without sinking the
  run.
- **Group chats.** Multi-agent threads, renameable, with unread tracking, and
  attachable to an automation.
- **Automations.** Daily, weekly, interval and event triggers, described in
  plain English and compiled into a schedule.
- **Permissions and Auto Allow.** Rule-based gating of impactful actions.
  Unknown actions are treated as impactful, so Auto Allow never covers them.
- **Claude Code integration.** Detection on PATH with three distinct states —
  available, not installed, and found-but-won't-run — each with its own
  user-facing explanation.
- **OpenAI and Google Gemini providers.** Per-user API keys held in an
  encrypted credential store.
- **Integrated terminal** with real PTY sessions, scoped to the open project.
- **Pixel world.** Characters walk to their own desks, change pose with what
  they are running, and talk face to face. Six themes: office, lab, detective,
  sherlock, friends, stranger.
- **Light and dark appearance,** following the system by default.
- **Google sign-in** via Supabase, with the session persisted across restarts.

### Added — packaging and release

- **electron-builder.** The project previously had no packager at all —
  `electron-vite` produced bundles and stopped. `npm run package` and
  `npm run dist` now produce a real application.
- **NSIS installer** (`Backstage-Setup-1.0.0-beta.1.exe`): per-user install, a
  changeable install directory, desktop and Start Menu shortcuts, and correct
  Add/Remove Programs metadata.
- **Portable build** (`Backstage-Portable-1.0.0-beta.1.exe`).
- **Application identity** in the packaged executable — product name
  `Backstage`, publisher, version and the custom pixel icon on the window,
  taskbar, installer and shortcuts. No default Electron branding anywhere.
- **GitHub Actions release workflow** (`.github/workflows/release.yml`),
  triggered by a `v*` tag: installs with `npm ci`, refuses to build when the
  tag and `package.json` version disagree, typechecks, tests, packages,
  generates SHA-256 checksums and publishes a GitHub **pre-release**.
- **SHA-256 checksums** published alongside every artifact.
- **`latest.yml` update manifest** emitted with each release, so auto-update
  can be switched on later without re-cutting a release.
- **MIT license.**

### Fixed

- **Packaging failed with `EPERM` when Backstage was watching its own
  repository.** `workspace/FileWatcher.ts` ignored `out`, `dist` and `build`
  but not `release`. On Windows a watched directory holds an open handle, and
  electron-builder packages by renaming `release/win-unpacked.tmp` into place —
  which a watched directory cannot do. Added `release` to the ignore pattern.

### Security

- The packaged application bundles **no user or provider secrets**. API keys
  live in the per-user encrypted credential store, never in the artifact.
- Only the **public** Supabase pair (project URL and anon/publishable key) is
  shipped, written at build time from repository secrets. The anon key asserts
  the `anon` role and every table behind it is under row level security.
  `SUPABASE_SERVICE_ROLE_KEY` is never read by the application and is never
  present in the artifact or the repository.
- The asar contains only `out/`, `package.json` and production
  `node_modules` — **no source maps, no TypeScript sources, no `.env`, no SQL
  migrations, no scratch workspaces, no documentation.** Verified by listing
  the packaged archive.
- The remote-debugging automation endpoint cannot be enabled in a packaged
  build. It requires `app.isPackaged` to be false, a Vite dev server, and an
  explicit opt-in environment variable, and binds to `127.0.0.1` only.
- DevTools no longer open on their own; `OPEN_DEVTOOLS=1` is opt-in and
  development-only.

### Known limitations

- Unsigned — Windows SmartScreen will warn on first run.
- Windows x64 only. macOS and Linux are configured but unbuilt and untested.
- No auto-update; updating means running the next installer by hand.
- Gemini is fully wired but less exercised than OpenAI.
- Google is the only sign-in method.

[1.0.0-beta.1]: https://github.com/sup-Udh/backstage/releases/tag/v1.0.0-beta.1
