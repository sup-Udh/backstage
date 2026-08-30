# Code signing

## Status: this beta is unsigned, deliberately

`Backstage-Setup-1.0.0-beta.1.exe` and `Backstage-Portable-1.0.0-beta.1.exe`
carry no Authenticode signature. Verified after packaging:

```powershell
Get-AuthenticodeSignature .\release\Backstage-Setup-1.0.0-beta.1.exe
# Status: NotSigned
```

No certificate is configured in `electron-builder.yml`, and none should be
faked.

### Why not a self-signed certificate

A self-signed certificate is worse than no certificate. It is still untrusted
by Windows — SmartScreen and the UAC prompt treat it exactly like an unsigned
binary — but it *looks* deliberate, which makes an unverifiable publisher name
appear in the dialog. That is closer to misleading users than to protecting
them. Unsigned and clearly documented is the honest option for a beta.

---

## What users will see

On first run of the installer, Microsoft Defender SmartScreen shows:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognised app from starting.
> Running this app might put your PC at risk.

The user has to click **More info → Run anyway**.

This is documented in the README and in the release notes. **Do not attempt to
work around SmartScreen.** There is no legitimate bypass; the only real fix is
a certificate plus reputation, described below.

Users who want to verify the download can check it against the published
SHA-256 checksum. That is integrity, not authenticity — it proves the file was
not altered in transit, but not who built it. Signing is what proves the
latter.

---

## What signing would take

### 1. Choose a certificate type

| Type | Cost (rough) | SmartScreen behaviour |
|---|---|---|
| **OV** (Organisation Validation) | ~$200–400/yr | Still warns until the signature accumulates download reputation — weeks to months |
| **EV** (Extended Validation) | ~$300–600/yr | **Immediate** SmartScreen reputation, no warm-up period |

EV is the one that actually removes the warning on day one. Since June 2023,
both OV and EV certificates must have their private key on **FIPS 140-2 Level 2
hardware** — a physical USB token, or a cloud HSM offered by the issuer.

An OV/EV certificate requires a **registered legal entity**. It cannot be
issued to an individual under a personal name in the way a TLS certificate
can. This is usually the real blocker for a solo project, not the money.

### 2. Buy from a CA

DigiCert, Sectigo, SSL.com and GlobalSign all issue these. Validation takes
days to weeks and involves verifying the organisation exists — company
registry, a verifiable phone number, sometimes a legal opinion letter.

### 3. Decide how CI signs

A USB hardware token cannot be plugged into a GitHub-hosted runner. Pick one:

- **Cloud signing (recommended).** DigiCert KeyLocker, SSL.com eSigner, or
  Azure Trusted Signing. The key stays in the issuer's HSM and CI calls an API.
  Works on hosted runners.
- **Self-hosted runner.** A machine you control with the token physically
  attached. Works, but you now maintain a build machine.
- **Sign locally, upload manually.** Fine for a rare release, and it means the
  release workflow can no longer produce a finished artifact on its own.

**Azure Trusted Signing** is worth looking at first: it is priced per month
rather than per year, and it accepts individual developers as well as
organisations, which sidesteps the entity requirement above.

### 4. Wire it into electron-builder

Add to the `win` block in `electron-builder.yml`:

```yaml
win:
  # Cloud signing (DigiCert KeyLocker / SSL.com eSigner / Azure Trusted Signing)
  signtoolOptions:
    sign: ./scripts/sign.js          # your CA's signing hook

  # ...or, for a local .pfx (development experiments only — never commit it)
  # signtoolOptions:
  #   certificateFile: ${env.WIN_CSC_LINK}
  #   certificatePassword: ${env.WIN_CSC_KEY_PASSWORD}
```

electron-builder also reads the environment variables `CSC_LINK` (path or
base64 of the certificate) and `CSC_KEY_PASSWORD` without any config change.

### 5. Add the secrets and the workflow step

Store credentials as repository secrets — never in the repository:

```yaml
# .github/workflows/release.yml, on the packaging step
- name: Package installer
  env:
    CSC_LINK: ${{ secrets.WINDOWS_CERT_BASE64 }}
    CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
  run: npx electron-builder --win --publish never
```

### 6. Verify before publishing

```powershell
Get-AuthenticodeSignature .\release\Backstage-Setup-<version>.exe
# Status must be: Valid
```

Add that check to the workflow so an unsigned build can never be published
once signing is expected. Until then, the release workflow deliberately makes
no signing claim at all.

---

## Timestamping

Whenever signing is turned on, **always timestamp**. Without a timestamp every
signature stops validating the day the certificate expires, including on
copies users already downloaded. electron-builder timestamps by default; do
not disable it.

---

## Until then

- Keep publishing SHA-256 checksums with every release.
- Keep the SmartScreen warning documented in the README and release notes.
- Do not ship a self-signed certificate.
- Do not tell users to disable SmartScreen.
