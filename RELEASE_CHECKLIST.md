# Release checklist

Run through this before every release. Status below is for **v1.0.0-beta.1**.

Legend: `[x]` verified · `[~]` partially verified, scope noted · `[ ]` not done
/ pending

---

## Version & metadata

- [x] **Version updated** — `package.json` is `1.0.0-beta.1` (semver, not
      "beta-final")
- [x] **Product name is Backstage** — packaged `Backstage.exe` reports
      `ProductName: Backstage`, `FileDescription: Backstage`,
      `CompanyName: udhay rajeev`. No Electron or `e-app` naming anywhere
- [x] **Metadata complete** — name, productName, version, description, author,
      license, homepage, repository, bugs
- [x] **License present** — MIT, `LICENSE` + `"license": "MIT"`

## Build

- [x] **Typecheck passes** — `npm run typecheck`, clean
- [x] **Tests pass** — `npm test`, all unit + integration suites
- [x] **Production build passes** — `npm run build`
- [x] **Package passes** — `npm run dist` produces installer + portable
- [x] **Artifact names correct** — `Backstage-Setup-1.0.0-beta.1.exe`,
      `Backstage-Portable-1.0.0-beta.1.exe`
- [x] **`latest.yml` emitted** — the manifest a future updater needs

## Installer

- [x] **Installer runs** — exit code 0 on a machine with no prior install
- [x] **Installs per-user** — `%LOCALAPPDATA%\Programs\Backstage`, no admin
      prompt
- [x] **Desktop shortcut created** — including on a OneDrive-redirected Desktop
- [x] **Start Menu shortcut created** — targets the installed exe
- [x] **Add/Remove Programs entry correct** — `Backstage 1.0.0-beta.1`,
      publisher `udhay rajeev`
- [x] **App icon correct** — custom pixel icon on the window, title bar,
      shortcuts and installer. `resources/build/icon.ico` ships with the app
- [x] **Installed app launches** — window title `Backstage`, UI renders
      (verified by capturing the window buffer, not just a live process)

## Security

- [x] **No secrets bundled** — secret scan across all tracked files: clean.
      The only key in the artifact is the Supabase **anon/publishable** key,
      which is public by design and RLS-protected
- [x] **No service-role key anywhere** — not in the repo, not in the artifact,
      not read by any code path
- [x] **No user data bundled** — asar contains only `out/`, `package.json` and
      production `node_modules`
- [x] **No source maps shipped** — 0 `.map` files in the asar
- [x] **No sources, docs, migrations or scratch dirs shipped** — 0 `.ts`/
      `.tsx`, 0 `.md`, 0 `.sql`; `batman-test/`, `test-workspace/`, `cases/`
      all absent
- [x] **devDependencies pruned** — no electron, typescript, vite or
      tailwindcss inside the asar
- [x] **Dev flags off in production** — remote debugging requires
      `!app.isPackaged` + a Vite dev server + explicit opt-in, and binds to
      `127.0.0.1`. DevTools are opt-in via `OPEN_DEVTOOLS=1` and dev-only
- [x] **Real error logging retained** — not stripped

## QA — verified against the packaged build

- [x] **App launch** — installed build, from the Start Menu shortcut
- [x] **UI loads** — project picker renders fully
- [x] **Session persists** — signed-in state survived install + relaunch,
      meaning the shipped `resources/.env` reached `supabaseConfig()` and
      Supabase auth resolved
- [x] **Project list loads** — existing project shown with world, cast and
      last-opened
- [x] **Theme loading** — light mode rendered, appearance toggle present
- [x] **Claude Code detection** — `available`, v2.1.251
- [x] **Claude Code absent** — PATH without `claude` returns
      `not_installed` cleanly, no crash
- [x] **Claude Code broken** — a shim that exits non-zero returns
      `failed_to_start`, distinct from "not installed"
- [x] **Claude absent is surfaced to the user** — distinct copy in both
      `ClaudeCard` and `TerminalPanel`, not a silent failure

## QA — verified by automated suites, not in the packaged UI

- [~] **Project isolation** — integration tests cover per-project activity,
      timelines and cross-account separation. Live Claude/terminal session
      isolation across a project switch was **not** exercised in the packaged
      app
- [~] **Group chats** — covered by `test/collaboration.test.ts`
- [~] **Automations** — schedule, trigger and natural-language suites pass
- [~] **Permissions / Auto Allow** — `agents/permissionRules.test.ts` and
      `permissionStore` suites pass, including "unknown actions are impactful"
- [~] **Activity states** — `agents/activityMap.test.ts` and the activity
      integration suite pass
- [~] **Team runs / multi-agent collaboration** — `agents/teamRun.test.ts`
      passes

## QA — NOT verified this release

- [ ] **OpenAI agent end to end** — needs a live API key and network calls
      against the packaged build. Adapter code is unit-tested; a real
      completion was not run
- [ ] **Gemini agent end to end** — same. Marked "less exercised than OpenAI"
      in the release notes rather than claimed working
- [ ] **Fresh Google OAuth sign-in** — only a *persisted* session was
      exercised. The first-time browser consent flow was not
- [ ] **Logout clears protected state** — not exercised against the packaged
      build
- [ ] **Terminal session in the packaged app** — PTY spawn not driven
      interactively
- [ ] **Dark mode in the packaged app** — light mode confirmed; the toggle was
      not flipped
- [ ] **Clean-machine install** — installed on the development machine with
      no prior Backstage install, but not on a fresh Windows VM

## Documentation

- [x] **README updated** — what it is, beta status, platform, providers,
      install, known limitations
- [x] **CHANGELOG updated** — `[1.0.0-beta.1]`
- [x] **Release notes written** — `RELEASE_NOTES_v1.0.0-beta.1.md`
- [x] **Known limitations documented honestly** — unsigned, Windows-only, no
      auto-update, Gemini less exercised, providers not verified end to end
- [x] **Beta disclaimer present** — README and release notes
- [x] **Code signing documented** — `CODE_SIGNING_SETUP.md`
- [x] **Auto-update documented** — `AUTO_UPDATE_PLAN.md`
- [x] **Website download wiring documented** — `DOWNLOAD_RELEASE_SETUP.md`

## Git & GitHub

- [x] **`.gitignore` covers build output** — `node_modules`, `out`, `dist`,
      `build`, `release`, `.env`, logs, OS junk. No source files ignored
- [x] **No secrets tracked** — `.env` untracked and ignored
- [x] **Working tree reviewed** before committing
- [x] **Release commit** — `release: Backstage v1.0.0-beta.1`
- [x] **Annotated tag created** — `v1.0.0-beta.1`
- [x] **Release workflow exists** — `.github/workflows/release.yml`, triggers
      on `v*`, uses `npm ci` and `secrets.GITHUB_TOKEN`
- [x] **Checksums generated** — SHA-256 for both artifacts
- [x] **Repository secrets set** — `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- [x] **Release commit pushed** — `9ef8779` to `origin/master`
- [x] **Tag pushed** — `v1.0.0-beta.1` → `origin`
- [ ] **GitHub Action passes** — ⛔ **BLOCKED**, see below
- [ ] **Installer uploaded to the release**
- [ ] **Release marked pre-release**
- [ ] **Checksum uploaded**
- [ ] **Asset URL verified to return 200**
- [ ] **Website download link updated**

### ⛔ Blocker: GitHub Actions is disabled by account billing

Run [33299565242](https://github.com/sup-Udh/backstage/actions/runs/33299565242)
failed after 2 seconds having executed **zero steps**. The annotation is:

> The job was not started because your account is locked due to a billing issue.

This is not a defect in `release.yml` — the workflow YAML parses, and the
runner never picked the job up. The repository is public, but an account lock
disables Actions regardless of repository visibility.

**To unblock:** settle the balance at
<https://github.com/settings/billing>, then re-run the existing run
(**Actions → Release → Re-run all jobs**). The tag is already pushed and does
**not** need to be recreated — re-running builds the same commit and publishes
the release.

**Alternative, if Actions stays unavailable:** create the release by hand from
the locally built artifacts in `release/`. They were packaged from exactly the
source at `v1.0.0-beta.1` (verified: no packaged input changed after the
build; the release commit added only documentation and CI config). Upload the
installer, the portable exe, both `.sha256` files and `latest.yml`, and tick
**Set as a pre-release**.

---

## Notes for the next release

- Close any running Backstage that has this repo open as its project before
  `npm run dist`. Its watcher used to hold `release/` and break packaging with
  `EPERM`; `release` is now in the ignore list, but a build from before that
  fix will still fail.
- `RELEASE_NOTES_v<version>.md` must exist before tagging — the workflow reads
  it by name and fails without it.
- Bump `package.json` **before** tagging; the workflow refuses to build when
  the tag and the version disagree.
