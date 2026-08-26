import { app, safeStorage } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { currentUserId } from '../supabase/authService'
import { knownAccountCount } from '../supabase/userPrefs'
import { listAllProjects } from '../projects/projectStore'
import { once } from '../agents/migrations'

/**
 * Credential storage, main process only, scoped to the signed-in account.
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
 *
 * ---------------------------------------------------------------------------
 * Why every path here is per-account
 * ---------------------------------------------------------------------------
 *
 * Keys used to live in one directory shared by whoever was using the machine.
 * That was correct while Backstage had no accounts and wrong the moment it
 * did: two people signing in on the same laptop would have spent each other's
 * OpenAI credit without either of them ever seeing the other's key, and the
 * developer's own key — sitting in that directory since before accounts
 * existed — would have become the default credential for every user who ever
 * signed in.
 *
 * So the directory is now derived from the Supabase user id, and
 * `currentUserId()` is consulted on every single read and write. There is no
 * cached handle, no "current provider" object built at start-up, and no path
 * computed once and reused: a key is located at the moment it is needed, for
 * whoever is signed in at that moment. Signing out therefore does not need to
 * clear anything, because there is nothing left pointing at the previous
 * account's directory.
 *
 * There is deliberately no environment-variable fallback. `OPENAI_API_KEY` and
 * friends are ignored entirely — see `resolveProviderKey` in
 * providers/registry.ts and USER_PROVIDER_CONFIGURATION.md for the full
 * precedence policy, which has exactly one rule in it.
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

/** The root all account directories live under. */
function credentialsRoot(): string {
  return join(app.getPath('userData'), 'credentials')
}

/**
 * A short, stable, filesystem-safe directory name for an account.
 *
 * Hashed rather than used raw. A Supabase user id is a UUID and would be a
 * perfectly legal directory name, but writing account identifiers into a
 * directory listing means anyone with the machine can enumerate who has signed
 * in on it. FNV-1a is not a security measure here — the ciphertext beside it
 * is — it is just enough to keep the listing uninformative.
 */
function accountDir(userId: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `u_${(h >>> 0).toString(36)}`
}

/**
 * The signed-in account's credential directory, or null when nobody is.
 *
 * Null is the important half. Every function below treats it as "there are no
 * keys", which is the honest answer for a signed-out application and means a
 * provider simply cannot be constructed — rather than one being built from
 * whatever happened to be on disk.
 */
function dir(): string | null {
  const userId = currentUserId()
  if (!userId) return null

  const d = join(credentialsRoot(), accountDir(userId))
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function keyPath(providerId: string): string | null {
  const d = dir()
  return d ? join(d, keyFile(providerId)) : null
}

function configPath(providerId: string): string | null {
  const d = dir()
  return d ? join(d, configFile(providerId)) : null
}

/* ------------------------------------------------------------ the key ---- */

export function hasApiKey(providerId: string): boolean {
  const path = keyPath(providerId)
  return path !== null && existsSync(path)
}

export function saveApiKey(providerId: string, apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('Empty API key')

  const path = keyPath(providerId)
  if (!path) {
    // Refusing beats writing it somewhere nobody will read it from: a key
    // saved while signed out would belong to no account and silently never be
    // used, which presents as "I connected OpenAI and it did nothing".
    throw new Error('Sign in before connecting a provider.')
  }

  if (!safeStorage.isEncryptionAvailable()) {
    // Refusing is the right call: silently writing plaintext would be worse
    // than failing, and the user can act on the message.
    throw new Error('OS secure storage is unavailable on this machine')
  }

  writeFileSync(path, safeStorage.encryptString(trimmed))
  const config = readConfig(providerId)
  config.keyHint = `…${trimmed.slice(-4)}`
  writeConfig(providerId, config)
}

/**
 * Decrypt the stored key. Main process only — the return value must never be
 * put on an IPC reply, logged, or included in an error message.
 *
 * Returns null when nobody is signed in, which is what stops a request going
 * out on a credential whose owner has left.
 */
export function getApiKey(providerId: string): string | null {
  const path = keyPath(providerId)
  if (!path || !existsSync(path)) return null
  try {
    return safeStorage.decryptString(readFileSync(path))
  } catch {
    // A key encrypted under a different OS user or profile cannot be read.
    return null
  }
}

export function deleteApiKey(providerId: string): void {
  const path = keyPath(providerId)
  if (!path) return
  try {
    rmSync(path, { force: true })
  } catch {
    // Already gone is the desired end state.
  }
  const config = readConfig(providerId)
  config.keyHint = null
  writeConfig(providerId, config)
}

/**
 * Remove every credential belonging to the signed-in account.
 *
 * For account deletion, which is the one operation where leaving encrypted
 * ciphertext behind would be wrong — the user asked for their account to stop
 * existing on this machine.
 */
export function deleteAllCredentials(): void {
  const d = dir()
  if (!d) return
  try {
    rmSync(d, { recursive: true, force: true })
  } catch (err) {
    console.error('[credentials] could not remove the account directory:', err)
  }
}

/* --------------------------------------------------------- the config ---- */

export function readConfig(providerId: string): ProviderConfig {
  const path = configPath(providerId)
  if (!path) return { selectedModel: null, keyHint: null }
  try {
    const raw = readFileSync(path, 'utf8')
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
  const path = configPath(providerId)
  if (!path) return
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8')
}

export function setSelectedModel(providerId: string, modelId: string | null): void {
  const config = readConfig(providerId)
  config.selectedModel = modelId
  writeConfig(providerId, config)
}

/* ------------------------------------------------------------ migration -- */

/**
 * Adopt pre-account credentials — but only on a machine that has only ever had
 * one account.
 *
 * Backstage stored provider keys before it had accounts, so an existing
 * install has an `openai.key` sitting loose in the credentials root belonging
 * to nobody. Two requirements pull in opposite directions here:
 *
 *   - a developer's key must not become every authenticated user's credential.
 *     Somebody else signing in on this laptop must not spend that budget, and
 *     must certainly not be able to do so without ever being shown a key;
 *   - working development configuration must not be destroyed, which would
 *     silently disconnect the person who set it up.
 *
 * "Give it to the first person who signs in" satisfies the letter of the first
 * and not its spirit. On a machine two people already share, *first* is a coin
 * toss — whoever happens to launch the upgraded build — and losing that toss
 * means one person's API key silently becomes another's, which is exactly the
 * outcome the requirement exists to prevent.
 *
 * So the bar is higher: the keys are adopted only when this machine has never
 * had more than one account on it, judged two ways because either alone can be
 * fooled:
 *
 *   accounts seen      how many distinct users have signed in here since
 *                      accounts existed;
 *   project owners     how many distinct owners the stored projects have,
 *                      which catches a machine whose preference file was
 *                      cleared but whose data was not.
 *
 * If either says more than one, nothing is claimed, and every user connects
 * their own key. Nothing is deleted either way — the loose file stays where it
 * is, unused, so a single-account machine that later becomes shared has not
 * lost anything.
 */
export function claimUnownedCredentials(): number {
  const target = dir()
  if (!target) return 0

  if (knownAccountCount() > 1 || distinctProjectOwners() > 1) {
    console.log(
      '[credentials] more than one account has been used on this machine, so ' +
        'pre-account provider keys were left alone. Each user connects their own.'
    )
    return 0
  }

  let claimed = 0
  once('credentials.claim-pre-account-keys', () => {
    const root = credentialsRoot()
    if (!existsSync(root)) return

    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      return
    }

    for (const name of entries) {
      // Only loose files in the root. Account directories start `u_` and are
      // somebody's already.
      if (!name.endsWith('.key') && !name.endsWith('.config.json')) continue

      const from = join(root, name)
      const to = join(target, name)
      try {
        if (existsSync(to)) {
          // The account already has its own; the loose one is the older
          // artefact and must not overwrite a key the user deliberately set.
          rmSync(from, { force: true })
          continue
        }
        renameSync(from, to)
        if (name.endsWith('.key')) claimed++
      } catch (err) {
        console.error(`[credentials] could not claim "${name}":`, err)
      }
    }

    if (claimed > 0) {
      console.log(
        `[credentials] claimed ${claimed} pre-account provider key(s) for the ` +
          'first signed-in user. No other account inherits them.'
      )
    }
  })

  return claimed
}

/** How many different accounts own a stored project on this machine. */
function distinctProjectOwners(): number {
  const owners = new Set<string>()
  for (const project of listAllProjects()) {
    if (project.userId) owners.add(project.userId)
  }
  return owners.size
}
