# Auto-update plan

## Status: not implemented in v1.0.0-beta.1

Backstage has **no auto-updater**. There is no `electron-updater` dependency,
no update check on launch, and no in-app "a new version is available" prompt.
Audited before the release; nothing was found and nothing was added.

### Why nothing was rushed in for the beta

An updater is the one component that can break an application on machines you
cannot reach. A half-tested updater that downloads a bad manifest, or fails
mid-replace, leaves users with an app that will not start and no way to fix it
from your end. That is a worse failure than "download the next installer
yourself", so the beta ships without one on purpose.

---

## Current update strategy

**Manual.** Users download the next installer from the GitHub releases page
and run it.

The NSIS installer handles this correctly already: installing a newer version
over an older one removes the previous entry from Add/Remove Programs rather
than leaving two, and `deleteAppDataOnUninstall: false` means an upgrade never
touches `%APPDATA%\Backstage` — projects, sessions and credentials survive.

Announce new versions on the releases page. Users can watch the repository
(**Watch → Custom → Releases**) to be notified.

---

## The groundwork this release already lays

Turning auto-update on later does **not** require re-cutting past releases.
Three pieces are in place:

1. **A publish provider is configured.** `electron-builder.yml` declares the
   GitHub provider, which is what makes electron-builder emit `latest.yml`.
2. **`latest.yml` is published with every release.** This is the manifest
   `electron-updater` polls. It carries the version, the artifact filename,
   its SHA-512 and its size. It is already attached to this release.
3. **`.blockmap` files are generated** next to the installer. These are what
   make *differential* downloads possible — an update pulls only the changed
   blocks instead of the whole ~100 MB installer.

In other words: the server side of auto-update already works. Only the client
side is missing.

---

## Turning it on, when the time comes

### 1. Add the dependency

```bash
npm install electron-updater
```

It is a **runtime** dependency, not a dev one — it ships inside the app.

### 2. Wire it into the main process

In `main.ts`, after `app.whenReady()`:

```ts
import { autoUpdater } from 'electron-updater'

if (app.isPackaged) {
  autoUpdater.autoDownload = false        // ask first; see below
  autoUpdater.allowPrerelease = true      // betas are pre-releases
  void autoUpdater.checkForUpdates()
}
```

`app.isPackaged` matters: a development run has no `app-update.yml` beside it
and the updater throws on startup without that guard.

`allowPrerelease` matters too. Every Backstage beta is published as a GitHub
pre-release, and the updater ignores pre-releases by default — so a beta would
never see another beta.

### 3. Decide the consent model before writing the UI

This is the design decision, not the code:

- **`autoDownload = false`** — check, tell the user, download on their word.
  Recommended for a beta. A ~100 MB download that starts on its own, on
  someone's metered connection, while agents are mid-task, is a support ticket.
- **`autoDownload = true`** — download in the background, install on quit.
  Smoother once the updater has proven itself.

Either way, **never restart the app out from under a running agent.** Backstage
holds live PTY sessions and in-flight provider calls. Gate
`autoUpdater.quitAndInstall()` behind an explicit user action, and check for
active sessions first.

### 4. Handle the events

`checking-for-update`, `update-available`, `update-not-available`,
`download-progress`, `update-downloaded`, `error`.

**`error` is the one that matters most.** A failed update check must be silent
or near-silent — a modal error dialog every launch because GitHub rate-limited
the request is far worse than never mentioning updates at all.

### 5. Signing changes the picture

On Windows, `electron-updater` verifies the signature of the downloaded
installer when the current build is signed. While Backstage is unsigned the
updater will still work, but the update path inherits exactly the trust
problem described in [CODE_SIGNING_SETUP.md](CODE_SIGNING_SETUP.md): nothing
proves the downloaded installer came from you.

**Recommendation: ship code signing before auto-update, not after.** An
unsigned auto-updater is a mechanism for silently installing unverified code
on a user's machine, which is a materially worse thing to own than an unsigned
one-time download the user chose to run.

### 6. Private repository note

If the repository is ever made private, `electron-updater` needs a GitHub
token to reach releases — which would mean shipping a token inside the app.
Don't. Publish artifacts somewhere designed to be public (a release bucket, or
a public mirror repository) instead.

---

## Suggested order

1. Ship this beta manually. Learn what actually breaks.
2. Obtain a code signing certificate (`CODE_SIGNING_SETUP.md`).
3. Add `electron-updater` with `autoDownload = false` and a visible prompt.
4. Test upgrade **and** rollback on a clean Windows VM, twice.
5. Only then consider background downloads.
