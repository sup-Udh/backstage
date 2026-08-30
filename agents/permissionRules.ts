import type {
  PermissionCategory,
  PermissionCategoryInfo,
  PermissionDecision
} from '../src/shared/agents'

/**
 * Which permission question a tool call actually asks.
 *
 * Pure functions over plain data, with no store, no Electron and no I/O — the
 * same discipline `relationships.ts` and `toolCapabilities.ts` hold to, and
 * for the same reason: this is a security rule, and a security rule that can
 * only be exercised by booting the whole application is one that never gets
 * tested.
 *
 * The idea it exists to express is that a tool is not a decision.
 * `terminal_run` is how an agent lists a directory, deletes a folder, installs
 * a dependency and starts a dev server, and treating those as one question —
 * which is what a per-tool `requiresApproval` flag does — means the user can
 * only answer all four the same way. So the category is derived from the tool
 * *and* its arguments, and `npm install` is a different question from `ls`.
 *
 * Classification is conservative by construction. Anything no pattern
 * recognises falls to `commands.run`, which asks by default: an unrecognised
 * command is the one most likely to deserve a look.
 */

/* --------------------------------------------------------- the categories -- */

export const PERMISSION_CATEGORIES: PermissionCategoryInfo[] = [
  {
    id: 'files.read',
    group: 'Files',
    label: 'Read files',
    blurb: 'Open, list and search files in the project folder.',
    impactful: false,
    fallback: 'allow'
  },
  {
    id: 'files.write',
    group: 'Files',
    label: 'Write files',
    blurb: 'Create new files and edit existing ones.',
    impactful: true,
    fallback: 'allow'
  },
  {
    id: 'files.delete',
    group: 'Files',
    label: 'Delete files',
    blurb: 'Remove files or folders from the project.',
    impactful: true,
    fallback: 'ask'
  },
  {
    id: 'commands.run',
    group: 'Execution',
    label: 'Run commands',
    blurb: 'Run a shell command that is not one of the categories below.',
    impactful: true,
    fallback: 'ask'
  },
  {
    id: 'packages.install',
    group: 'Execution',
    label: 'Install packages',
    blurb: 'npm, pip, cargo, gem — anything that adds or changes dependencies.',
    impactful: true,
    fallback: 'ask'
  },
  {
    id: 'services.start',
    group: 'Execution',
    label: 'Start local services',
    blurb: 'Dev servers, watchers and containers that keep running.',
    impactful: true,
    fallback: 'ask'
  },
  {
    id: 'git.ops',
    group: 'Project',
    label: 'Git operations',
    blurb: 'Commit, branch, merge, reset — anything that changes git state.',
    impactful: true,
    fallback: 'ask'
  },
  {
    id: 'config.modify',
    group: 'Project',
    label: 'Modify configuration',
    blurb: 'package.json, tsconfig, .env, CI files and other project settings.',
    impactful: true,
    fallback: 'ask'
  },
  {
    id: 'network',
    group: 'Project',
    label: 'Network and web',
    blurb: 'Fetch a page, or run a web search.',
    impactful: false,
    fallback: 'allow'
  }
]

const BY_ID = new Map(PERMISSION_CATEGORIES.map((c) => [c.id, c]))

export function categoryInfo(id: PermissionCategory): PermissionCategoryInfo | undefined {
  return BY_ID.get(id)
}

export function isImpactful(id: PermissionCategory): boolean {
  return BY_ID.get(id)?.impactful ?? true
}

/** The rules a project starts with, before the user changes anything. */
export function defaultRules(): Record<PermissionCategory, PermissionDecision> {
  const out = {} as Record<PermissionCategory, PermissionDecision>
  for (const c of PERMISSION_CATEGORIES) out[c.id] = c.fallback
  return out
}

export function isPermissionCategory(value: unknown): value is PermissionCategory {
  return typeof value === 'string' && BY_ID.has(value as PermissionCategory)
}

export function isPermissionDecision(value: unknown): value is PermissionDecision {
  return value === 'ask' || value === 'allow' || value === 'deny'
}

/* ------------------------------------------------------------ file paths -- */

/**
 * Paths whose contents decide how the project builds, runs or deploys.
 *
 * Editing one of these is not the same as editing a component, which is why it
 * gets its own category rather than counting as an ordinary write: somebody
 * happy for agents to edit their source is not necessarily happy for one to
 * rewrite `.env` or a CI workflow.
 */
const CONFIG_PATTERNS: RegExp[] = [
  /(^|[\\/])package\.json$/i,
  /(^|[\\/])package-lock\.json$/i,
  /(^|[\\/])(pnpm-lock\.yaml|yarn\.lock)$/i,
  /(^|[\\/])tsconfig[^\\/]*\.json$/i,
  /(^|[\\/])\.env($|\.)/i,
  /(^|[\\/])[^\\/]*\.config\.(js|cjs|mjs|ts|mts|cts|json|yaml|yml)$/i,
  /(^|[\\/])\.github[\\/]workflows[\\/]/i,
  /(^|[\\/])(Dockerfile|docker-compose\.(yml|yaml))$/i,
  /(^|[\\/])(Cargo\.toml|pyproject\.toml|requirements\.txt|Gemfile|go\.mod)$/i,
  /(^|[\\/])\.(npmrc|babelrc|eslintrc[^\\/]*|prettierrc[^\\/]*|gitignore|gitattributes)$/i,
  /(^|[\\/])(electron\.vite\.config|vite\.config|webpack\.config)\./i
]

export function isConfigPath(path: string): boolean {
  const p = String(path ?? '').trim()
  if (!p) return false
  return CONFIG_PATTERNS.some((re) => re.test(p))
}

/* -------------------------------------------------------------- commands -- */

/**
 * Split a command line into the individual commands it will run.
 *
 * `npm run build && rm -rf dist` is two decisions, and classifying only the
 * first is how a delete gets through a "run commands" approval. Quotes are
 * respected so a separator inside a string does not split the line.
 */
export function splitCommands(command: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: string | null = null

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]

    if (quote) {
      current += ch
      if (ch === quote && command[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      current += ch
      continue
    }

    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      out.push(current)
      current = ''
      i++
      continue
    }
    if (ch === ';' || ch === '|' || ch === '\n') {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)

  return out.map((c) => c.trim()).filter((c) => c.length > 0)
}

/** Leading `VAR=value` assignments and `sudo`, which hide the real verb. */
function stripPrefixes(command: string): string {
  let rest = command.trim()
  for (;;) {
    const next = rest.replace(/^(sudo|env|command|npx\s+--yes|npx\s+-y)\s+/i, '')
    const assigned = next.replace(
      /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+/,
      ''
    )
    if (assigned === rest) return rest
    rest = assigned
  }
}

const DELETE_RE =
  /^(rm|rmdir|del|erase|rd|unlink|shred|trash|remove-item|ri)\b|\bgit\s+clean\b|\brimraf\b/i

const INSTALL_RE = new RegExp(
  [
    '^(npm|pnpm|yarn|bun)\\s+(i|in|install|add|ci|update|up|upgrade|uninstall|remove|rm)\\b',
    '^pip3?\\s+(install|uninstall)\\b',
    '^(poetry|uv|pipenv)\\s+(add|install|remove|sync)\\b',
    '^cargo\\s+(add|install|remove|update)\\b',
    '^(gem|bundle)\\s+(install|update|add)\\b',
    '^go\\s+(get|install)\\b',
    '^(apt|apt-get|brew|choco|winget|scoop|dnf|yum|pacman)\\s+(install|add|upgrade|update)\\b',
    '^composer\\s+(require|install|update)\\b',
    '^dotnet\\s+add\\s+package\\b'
  ].join('|'),
  'i'
)

const SERVICE_RE = new RegExp(
  [
    '^(npm|pnpm|yarn|bun)\\s+(run\\s+)?(dev|start|serve|preview|watch|storybook)\\b',
    '^(vite|next|nuxt|remix|astro|ng|expo)\\s+(dev|start|serve|preview)\\b',
    '^(docker|podman)\\s+(run|start|compose)\\b',
    '^docker-compose\\s+up\\b',
    '^(serve|http-server|live-server|nodemon|pm2|forever|concurrently)\\b',
    '^python3?\\s+-m\\s+http\\.server\\b',
    '^(rails|php)\\s+(server|serve|-S)\\b',
    '^(flask|uvicorn|gunicorn|hypercorn|daphne)\\b',
    '^(kubectl|minikube)\\s+(port-forward|start|tunnel)\\b'
  ].join('|'),
  'i'
)

const NETWORK_RE =
  /^(curl|wget|http|httpie|nc|ncat|telnet|ssh|scp|rsync|ftp|sftp|invoke-webrequest|iwr)\b/i

/**
 * Git subcommands that only look.
 *
 * Everything else under `git` changes the repository — including the ones that
 * look harmless and are not, like `git checkout` discarding a file. Listing
 * the safe ones and treating the rest as mutating is the direction this has to
 * fail in.
 */
const GIT_READONLY = new Set([
  'status',
  'log',
  'diff',
  'show',
  'blame',
  'shortlog',
  'describe',
  'remote',
  'ls-files',
  'ls-remote',
  'rev-parse',
  'rev-list',
  'reflog',
  'whatchanged',
  'cat-file',
  'grep'
])

/** Commands that only read the filesystem. */
const READ_RE =
  /^(ls|dir|cat|type|head|tail|less|more|find|grep|rg|fd|wc|stat|file|tree|pwd|which|where|echo|printf|du|df|diff|cmp|realpath|basename|dirname|sort|uniq|awk|jq|get-content|get-childitem|gci|select-string)\b/i

/** What a single shell command asks permission for. */
export function categoriseCommand(rawCommand: string): PermissionCategory {
  const command = stripPrefixes(String(rawCommand ?? ''))
  if (!command) return 'commands.run'

  /*
   * Order matters. `npm uninstall` is a dependency decision rather than a
   * delete one, so the install test runs first; a delete is a delete whatever
   * else the line looks like, so it runs before everything that follows.
   */
  if (INSTALL_RE.test(command)) return 'packages.install'
  if (DELETE_RE.test(command)) return 'files.delete'
  if (SERVICE_RE.test(command)) return 'services.start'
  if (NETWORK_RE.test(command)) return 'network'

  const git = /^git\s+(?:-[^\s]+\s+)*([a-z-]+)/i.exec(command)
  if (git) {
    return GIT_READONLY.has(git[1].toLowerCase()) ? 'files.read' : 'git.ops'
  }

  // A redirection writes a file whatever the verb in front of it was.
  if (/(^|[^>])>>?\s*[^\s>]/.test(command)) return 'files.write'

  if (READ_RE.test(command)) return 'files.read'

  return 'commands.run'
}

/**
 * How much a person would want to be told, lowest first.
 *
 * Used to pick one category for a command line that runs several commands:
 * deleting beats installing beats starting a service, and a plain read loses
 * to everything.
 */
const SEVERITY: PermissionCategory[] = [
  'files.read',
  'network',
  'files.write',
  'config.modify',
  'services.start',
  'git.ops',
  'commands.run',
  'packages.install',
  'files.delete'
]

/** The strictest category anything on this command line asks for. */
export function categoriseCommandLine(command: string): PermissionCategory {
  const parts = splitCommands(String(command ?? ''))
  if (parts.length === 0) return 'commands.run'

  let worst: PermissionCategory = 'files.read'
  for (const part of parts) {
    const category = categoriseCommand(part)
    if (SEVERITY.indexOf(category) > SEVERITY.indexOf(worst)) worst = category
  }
  return worst
}

/* ----------------------------------------------------------------- tools -- */

/** Tools whose category never depends on their arguments. */
const FIXED: Record<string, PermissionCategory> = {
  workspace_overview: 'files.read',
  filesystem_list: 'files.read',
  filesystem_read: 'files.read',
  filesystem_search: 'files.read',
  git_status: 'files.read',
  git_diff: 'files.read',
  git_log: 'files.read',
  git_commit: 'git.ops',
  web_fetch: 'network',
  web_search: 'network'
}

/**
 * Tools this system deliberately does not gate.
 *
 * Talking to a teammate is already governed by two controls that are stricter
 * than a permission category and were built for it: the relationship graph,
 * which decides who may contact whom at all, and the chain limits, which
 * decide how far and how often. Adding a third would not make delegation safer,
 * it would only make it ask twice.
 */
const UNGATED = new Set([
  'delegate_task',
  'delegate_to_session',
  'agent_message',
  'team_status'
])

/**
 * Which permission this tool call asks for, or null if it is not gated.
 *
 * Null is returned only for the names listed above and never as a fallback: a
 * tool added without a line in this file falls to `commands.run`, which asks.
 * That is the direction the mistake has to fail in.
 */
export function categoriseToolCall(
  toolName: string,
  args: Record<string, unknown> = {}
): PermissionCategory | null {
  if (UNGATED.has(toolName)) return null

  const fixed = FIXED[toolName]
  if (fixed) return fixed

  if (toolName === 'filesystem_create' || toolName === 'filesystem_edit') {
    const path = typeof args.path === 'string' ? args.path : ''
    return isConfigPath(path) ? 'config.modify' : 'files.write'
  }

  if (toolName === 'terminal_run') {
    const command = typeof args.command === 'string' ? args.command : ''
    return categoriseCommandLine(command)
  }

  return 'commands.run'
}
