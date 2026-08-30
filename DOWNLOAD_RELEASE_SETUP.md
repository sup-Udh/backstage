# Download & release setup

How the Backstage website's **Download for Windows** button connects to a
GitHub Release, and what has to change when a new version ships.

> The Backstage landing website is **not part of this repository**. Nothing
> here modifies it. This document is the contract the website implements.

---

## This release

| | |
|---|---|
| **Repository** | `https://github.com/sup-Udh/backstage` |
| **Git tag** | `v1.0.0-beta.1` |
| **Release name** | `Backstage v1.0.0-beta.1` |
| **Pre-release** | Yes |
| **Installer** | `Backstage-Setup-1.0.0-beta.1.exe` |
| **Portable** | `Backstage-Portable-1.0.0-beta.1.exe` |
| **Checksums** | `<artifact>.exe.sha256` |
| **Update manifest** | `latest.yml` |

### Asset URLs

Release assets follow a fixed pattern:

```
https://github.com/sup-Udh/backstage/releases/download/<TAG>/<FILENAME>
```

Which for this release is:

```
https://github.com/sup-Udh/backstage/releases/download/v1.0.0-beta.1/Backstage-Setup-1.0.0-beta.1.exe
https://github.com/sup-Udh/backstage/releases/download/v1.0.0-beta.1/Backstage-Portable-1.0.0-beta.1.exe
https://github.com/sup-Udh/backstage/releases/download/v1.0.0-beta.1/Backstage-Setup-1.0.0-beta.1.exe.sha256
```

> ⚠️ **Verify before publishing these on the website.** The URLs above are
> derived from the tag and the artifact names, both of which are pinned by
> `electron-builder.yml` and the release workflow. They are *predicted*, not
> observed. Once the release exists, confirm each one returns HTTP 200:
>
> ```bash
> curl -sIL -o /dev/null -w '%{http_code} %{url_effective}\n' \
>   https://github.com/sup-Udh/backstage/releases/download/v1.0.0-beta.1/Backstage-Setup-1.0.0-beta.1.exe
> ```
>
> A 404 means the release, the tag or the filename differs from the above.
> Fix the link, do not guess again.

---

## How the website should link

### Option A — pin the version (recommended for a beta)

```html
<a
  href="https://github.com/sup-Udh/backstage/releases/download/v1.0.0-beta.1/Backstage-Setup-1.0.0-beta.1.exe"
  download
>
  Download for Windows
  <span>Beta · 1.0.0-beta.1 · ~99 MB · Windows 10/11 64-bit</span>
</a>
```

**Why pin.** The link is explicit, cacheable, and cannot silently start
serving something else. The cost is one edit per release — which is the point:
a human confirms the artifact exists before the website points at it.

State the version and the beta status on the button. Someone downloading an
unsigned pre-release should know that before they click, not after SmartScreen
tells them.

### Option B — always the newest release

**`/releases/latest` does not work here.** GitHub excludes pre-releases from
`latest`, so while every Backstage release is a beta, that URL resolves to
nothing.

Use the API instead, which can see pre-releases:

```js
// Newest release, pre-releases included.
const res  = await fetch('https://api.github.com/repos/sup-Udh/backstage/releases')
const rel  = (await res.json()).find(r => !r.draft)
const win  = rel.assets.find(a => /^Backstage-Setup-.*\.exe$/.test(a.name))

link.href        = win.browser_download_url
link.textContent = `Download for Windows — ${rel.tag_name}`
```

Two caveats: the unauthenticated API allows 60 requests/hour per IP, so cache
the result; and always keep a hardcoded fallback URL for when the fetch fails,
so the button is never dead.

Once Backstage leaves beta and releases stop being pre-releases,
`https://github.com/sup-Udh/backstage/releases/latest/download/Backstage-Setup.exe`
becomes available — but only if the artifact name stops carrying the version.
That is a deliberate trade-off; do not change the artifact name for it while
still in beta.

---

## Publishing a new version

1. **Bump the version** in `package.json` — semver only
   (`1.0.0-beta.2`, `1.0.0-rc.1`, `1.0.0`).
2. **Write the release notes** as `RELEASE_NOTES_v<version>.md`. The workflow
   reads this file by name for the release body and **fails if it is missing**.
3. **Update `CHANGELOG.md`.**
4. **Commit** — `release: Backstage v<version>`.
5. **Tag and push:**
   ```bash
   git tag -a v<version> -m "Backstage v<version>"
   git push origin master
   git push origin v<version>
   ```
6. **Watch the Actions run.** It refuses to build if the tag and
   `package.json` version disagree.
7. **Confirm the release page** — assets attached, marked pre-release.
8. **Verify the asset URL returns 200** (see the `curl` above).
9. **Update the website link** to the new tag and filename.

### Things that will break the website link

- Renaming the artifact — it is set by `nsis.artifactName` in
  `electron-builder.yml`. Changing it changes every download URL.
- Deleting or re-tagging a release. Existing links 404 permanently.
- Marking a release as a draft. Draft assets are not publicly downloadable.

### Required repository secrets

The release workflow will not build without these:

| Secret | What it is |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key — public by design, RLS-protected |

`GITHUB_TOKEN` is provided automatically; no personal access token is needed.

**Never add `SUPABASE_SERVICE_ROLE_KEY`.** It bypasses every row level
security policy in the database, and it would end up inside a publicly
downloadable installer.

---

## What to tell users on the download page

- **Windows 10/11, 64-bit.** No macOS or Linux build yet.
- **This is a beta.** Say so on the button, not just in the small print.
- **The installer is unsigned** and SmartScreen will warn — with the
  *More info → Run anyway* steps written out. Users who are not warned in
  advance assume the download is malicious and bounce.
- **Link the SHA-256 checksum** next to the download for anyone who wants to
  verify it.
