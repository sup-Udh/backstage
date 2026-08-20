import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Credential storage, main process only.
 *
 * This uses Electron's built-in `safeStorage`, which encrypts against an
 * OS-held key — DPAPI on Windows, the Keychain on macOS, libsecret/kwallet on
 * Linux. It was chosen over adding a package such as keytar because:
 *
 *   - it ships with Electron, so there is no native module to rebuild per
 *     platform and per Electron version, which is where keytar builds usually
 *     break;
 *   - keytar itself is archived and no longer maintained;
 *   - the guarantee is the same one we need here: ciphertext at rest that
 *     only this OS user can decrypt.
 *
 * The ciphertext lives in the app's userData directory. The plaintext key
 * never leaves this process: nothing here is ever returned over IPC, and the
 * renderer only ever learns whether a key exists and its last four characters.
 */

/** Keys and config are namespaced per provider id. */
function keyFile(providerId: string): string {
  return `${providerId}.key`
}
function configFile(providerId: string): string {
  return `${providerId}.config.json`
}

interface ProviderConfig {
  selectedModel: string | null
  /** Last four characters only, for display. */
  keyHint: string | null
}

function dir(): string {
  const d = join(app.getPath('userData'), 'credentials')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function keyPath(providerId: string): string {
  return join(dir(), keyFile(providerId))
}

function configPath(providerId: string): string {
  return join(dir(), configFile(providerId))
}

/* ------------------------------------------------------------ the key ---- */

export function hasApiKey(providerId: string): boolean {
  return existsSync(keyPath(providerId))
}

export function saveApiKey(providerId: string, apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('Empty API key')

  if (!safeStorage.isEncryptionAvailable()) {
    // Refusing is the right call: silently writing plaintext would be worse
    // than failing, and the user can act on the message.
    throw new Error('OS secure storage is unavailable on this machine')
  }

  writeFileSync(keyPath(providerId), safeStorage.encryptString(trimmed))
  const config = readConfig(providerId)
  config.keyHint = `…${trimmed.slice(-4)}`
  writeConfig(providerId, config)
}

/**
 * Decrypt the stored key. Main process only — the return value must never be
 * put on an IPC reply, logged, or included in an error message.
 */
export function getApiKey(providerId: string): string | null {
  if (!hasApiKey(providerId)) return null
  try {
    return safeStorage.decryptString(readFileSync(keyPath(providerId)))
  } catch {
    // A key encrypted under a different OS user or profile cannot be read.
    return null
  }
}

export function deleteApiKey(providerId: string): void {
  try {
    rmSync(keyPath(providerId), { force: true })
  } catch {
    // Already gone is the desired end state.
  }
  const config = readConfig(providerId)
  config.keyHint = null
  writeConfig(providerId, config)
}

/* --------------------------------------------------------- the config ---- */

export function readConfig(providerId: string): ProviderConfig {
  try {
    const raw = readFileSync(configPath(providerId), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>
    return {
      selectedModel: parsed.selectedModel ?? null,
      keyHint: parsed.keyHint ?? null
    }
  } catch {
    return { selectedModel: null, keyHint: null }
  }
}

export function writeConfig(providerId: string, config: ProviderConfig): void {
  writeFileSync(configPath(providerId), JSON.stringify(config, null, 2), 'utf8')
}

export function setSelectedModel(providerId: string, modelId: string | null): void {
  const config = readConfig(providerId)
  config.selectedModel = modelId
  writeConfig(providerId, config)
}
