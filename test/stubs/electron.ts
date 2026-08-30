import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Enough of Electron to run the stores outside Electron.
 *
 * The integration checks exercise the real agent store, project store,
 * permission store, group chats and automation runner — not copies of them —
 * which means they have to satisfy the same imports the application does. All
 * of those reach Electron for exactly two things: a place to put files, and
 * the OS keychain.
 *
 * `userData` is a fresh temporary directory per run, so a check can never read
 * or corrupt a real installation's state, and two runs cannot see each other.
 *
 * `safeStorage` reports as unavailable rather than pretending to encrypt.
 * Every caller already handles that — it is the state a Linux box with no
 * keyring is in — and a stub that faked encryption would be the one place in
 * the codebase where a credential was written in plain text.
 */

const userData = mkdtempSync(join(tmpdir(), 'backstage-test-'))

export const app = {
  getPath(name: string): string {
    return name === 'userData' ? userData : userData
  },
  getName(): string {
    return 'backstage-test'
  },
  getVersion(): string {
    return '0.0.0-test'
  },
  on(): void {},
  quit(): void {}
}

export const safeStorage = {
  isEncryptionAvailable(): boolean {
    return false
  },
  encryptString(): Buffer {
    throw new Error('Encryption is not available in the test stub.')
  },
  decryptString(): string {
    throw new Error('Encryption is not available in the test stub.')
  }
}

export const dialog = {
  async showOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }> {
    return { canceled: true, filePaths: [] }
  }
}

export const shell = {
  async openExternal(): Promise<void> {}
}

export const BrowserWindow = {
  getAllWindows(): unknown[] {
    return []
  }
}

export const ipcMain = {
  handle(): void {},
  removeHandler(): void {}
}

/** Where this run's state went, so a check can inspect or clear it. */
export const TEST_USER_DATA = userData

export default { app, safeStorage, dialog, shell, BrowserWindow, ipcMain }
