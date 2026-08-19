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

const KEY_FILE = 'openai.key'
const CONFIG_FILE = 'openai.config.json'

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

function keyPath(): string {
  return join(dir(), KEY_FILE)
}

function configPath(): string {
  return join(dir(), CONFIG_FILE)
}

/* ------------------------------------------------------------ the key ---- */

export function hasApiKey(): boolean {
  return existsSync(keyPath())
}

export function saveApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('Empty API key')

  if (!safeStorage.isEncryptionAvailable()) {
    // Refusing is the right call: silently writing plaintext would be worse
    // than failing, and the user can act on the message.
    throw new Error('OS secure storage is unavailable on this machine')
  }

  writeFileSync(keyPath(), safeStorage.encryptString(trimmed))
  const config = readConfig()
  config.keyHint = `sk-…${trimmed.slice(-4)}`
  writeConfig(config)
}

/**
 * Decrypt the stored key. Main process only — the return value must never be
 * put on an IPC reply, logged, or included in an error message.
 */
export function getApiKey(): string | null {
  if (!hasApiKey()) return null
  try {
    return safeStorage.decryptString(readFileSync(keyPath()))
  } catch {
    // A key encrypted under a different OS user or profile cannot be read.
    return null
  }
}

export function deleteApiKey(): void {
  try {
    rmSync(keyPath(), { force: true })
  } catch {
    // Already gone is the desired end state.
  }
  const config = readConfig()
  config.keyHint = null
  writeConfig(config)
}

/* --------------------------------------------------------- the config ---- */

export function readConfig(): ProviderConfig {
  try {
    const raw = readFileSync(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>
    return {
      selectedModel: parsed.selectedModel ?? null,
      keyHint: parsed.keyHint ?? null
    }
  } catch {
    return { selectedModel: null, keyHint: null }
  }
}

export function writeConfig(config: ProviderConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8')
}

export function setSelectedModel(modelId: string | null): void {
  const config = readConfig()
  config.selectedModel = modelId
  writeConfig(config)
}
