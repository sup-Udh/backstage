import chokidar, { type FSWatcher } from 'chokidar'
import { EventEmitter } from 'node:events'
import { getWorkspaceRoot, toRelative } from './WorkspaceManager'

/**
 * Watches the workspace for changes made outside the app.
 *
 * This is what makes an external CLI agent feel integrated: when Claude Code
 * edits a file in its own PTY, nothing in the React app knows about it. The
 * watcher is the only honest way to notice, and it is what lets the activity
 * feed report a real edit rather than an invented one.
 *
 * Events are debounced because editors and build tools write in bursts — a
 * single save can fire several times, and a build can touch hundreds of files.
 */

export type FileChangeKind = 'created' | 'modified' | 'deleted'

export interface FileChange {
  kind: FileChangeKind
  path: string
  at: number
}

/*
 * `release` earns its place here for a second reason beyond noise.
 *
 * On Windows chokidar watches a directory by holding an open handle on it
 * (ReadDirectoryChangesW). electron-builder packages into `release/
 * win-unpacked.tmp` and then *renames* that directory into place — and a
 * directory with an open handle cannot be renamed, so the rename fails with
 * EPERM and the whole build dies. A Backstage instance left running with its
 * own repository open as the project was therefore enough to make `npm run
 * dist` fail every time, from inside the product being packaged.
 */
const IGNORED = /(^|[\\/])(\.git|node_modules|dist|out|build|release|\.next|coverage|__pycache__|target|\.venv|\.cache)([\\/]|$)/

/** Collapse bursts, and cap how many changes one burst can report. */
const DEBOUNCE_MS = 400
const MAX_PER_BURST = 12

class Watcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private pending = new Map<string, FileChangeKind>()
  private timer: NodeJS.Timeout | null = null
  private root: string | null = null

  /** Point the watcher at the current workspace, replacing any previous one. */
  sync(): void {
    const next = getWorkspaceRoot()
    if (next === this.root) return
    this.stop()
    this.root = next
    if (!next) return

    this.watcher = chokidar.watch(next, {
      ignored: (p: string) => IGNORED.test(p),
      ignoreInitial: true,
      persistent: true,
      depth: 8,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    })

    this.watcher.on('add', (p) => this.queue('created', p))
    this.watcher.on('change', (p) => this.queue('modified', p))
    this.watcher.on('unlink', (p) => this.queue('deleted', p))
    this.watcher.on('error', () => {
      // A watch error should never take the app down; the feed just goes quiet.
    })
  }

  private queue(kind: FileChangeKind, absPath: string): void {
    this.pending.set(toRelative(absPath), kind)
    if (this.timer) return
    this.timer = setTimeout(() => {
      const at = Date.now()
      const changes: FileChange[] = [...this.pending.entries()]
        .slice(0, MAX_PER_BURST)
        .map(([path, k]) => ({ kind: k, path, at }))
      const total = this.pending.size
      this.pending.clear()
      this.timer = null
      if (changes.length > 0) this.emit('changes', { changes, total })
    }, DEBOUNCE_MS)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending.clear()
    void this.watcher?.close()
    this.watcher = null
  }
}

export const fileWatcher = new Watcher()
