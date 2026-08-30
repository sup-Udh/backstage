import type { ActivityType } from '../src/shared/activity'
import { ACTIVITY_LABEL, shortCommand, shortPath } from '../src/shared/activity'
import { splitCommands } from './permissionRules'

/**
 * What a tool call means, in the user's terms.
 *
 * The single mapping from the runtime's vocabulary to the interface's, and
 * the reason the interface never asks which provider is running. A provider's
 * only job is to call tools; the tools are the same tools whoever called
 * them, so the normalisation happens once, here, on the far side of every
 * provider.
 *
 * Pure, with no store, no Electron and no I/O — the same discipline
 * `relationships.ts` and `permissionRules.ts` hold to, and for the same
 * reason: this decides what a user is told an agent is doing, and a claim
 * about that should be checkable in a plain test rather than by running the
 * application and watching.
 *
 * The one rule that matters more than the rest: **nothing here invents a
 * detail**. If the arguments do not contain a path, the activity has no path
 * and the badge says WRITING FILE. A plausible-looking filename is worse than
 * no filename, because the user cannot tell the two apart.
 */

/** Everything an activity needs that a tool call can supply. */
export interface MappedActivity {
  type: ActivityType
  /** Overrides the vocabulary's label. Used where the tool is more specific. */
  label?: string
  detail: string | null
  detailFull: string | null
  filePath?: string | null
  command?: string | null
  targetAgentId?: string | null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/* -------------------------------------------------------------- commands -- */

/**
 * What a shell command is *for*.
 *
 * Deliberately a different question from the one `permissionRules` asks. That
 * module decides how dangerous a command is and errs towards the stricter
 * answer; this one decides what to call it and errs towards the plainer one.
 * `git log` is a read as far as permission goes and is still "GIT" on a
 * badge, because that is what a person watching would call it.
 *
 * They do share `splitCommands`, so a compound line is torn apart the same way
 * by both rather than by two parsers that will eventually disagree.
 */
export function activityForCommand(rawCommand: string): ActivityType {
  const parts = splitCommands(String(rawCommand ?? ''))
  const first = (parts[0] ?? '').trim()
  if (!first) return 'running_command'

  // Leading assignments and `sudo` hide the verb, exactly as they do for
  // permissions.
  const command = first
    .replace(/^(?:sudo|env|command)\s+/i, '')
    .replace(/^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+/, '')
    .trim()

  if (/^(npm|pnpm|yarn|bun)\s+(i|in|install|add|ci|update|up|upgrade|uninstall|remove)\b/i.test(command)) {
    return 'installing_dependency'
  }
  if (/^(pip3?|poetry|uv|pipenv|cargo|gem|bundle|composer)\s+(install|add|update|sync|remove)\b/i.test(command)) {
    return 'installing_dependency'
  }
  if (/^go\s+(get|install)\b/i.test(command)) return 'installing_dependency'

  if (/^(npm|pnpm|yarn|bun)\s+(run\s+)?(test|tests|jest|vitest|check)\b/i.test(command)) {
    return 'testing'
  }
  if (/^(jest|vitest|mocha|ava|pytest|phpunit|rspec|tox)\b/i.test(command)) return 'testing'
  if (/^(cargo|go|dotnet|mvn|gradle)\s+test\b/i.test(command)) return 'testing'
  if (/^python3?\s+-m\s+(pytest|unittest)\b/i.test(command)) return 'testing'

  if (/^(npm|pnpm|yarn|bun)\s+(run\s+)?(build|compile|bundle|dist)\b/i.test(command)) {
    return 'building'
  }
  if (/^(tsc|webpack|vite\s+build|next\s+build|rollup|esbuild|make)\b/i.test(command)) {
    return 'building'
  }
  if (/^(cargo|go|dotnet|mvn|gradle)\s+build\b/i.test(command)) return 'building'

  if (/^git\b/i.test(command)) return 'git_operation'

  if (/^(rm|rmdir|del|erase|rd|unlink|remove-item)\b/i.test(command)) return 'deleting_file'

  if (/^(grep|rg|ag|ack|find|fd)\b/i.test(command)) return 'searching_code'

  if (/^(curl|wget|http|httpie)\b/i.test(command)) return 'web_search'

  return 'running_command'
}

/* ----------------------------------------------------------------- tools -- */

/**
 * Which activity a tool call is.
 *
 * Keyed by the registry's own tool names, so a provider cannot influence the
 * answer — the name comes from `tools/registry.ts` and both provider adapters
 * hand the identical list to their models.
 *
 * A tool with no entry falls back to a generic working activity carrying the
 * tool's own name, rather than to nothing. Losing the fact that an agent is
 * doing *something* is worse than filing it imprecisely, and the tool name in
 * the detail line makes the gap obvious rather than invisible.
 */
export function activityForTool(
  toolName: string,
  args: Record<string, unknown> = {}
): MappedActivity {
  const path = str(args.path) ?? str(args.file) ?? str(args.filePath)
  const query = str(args.query) ?? str(args.pattern) ?? str(args.search)
  const command = str(args.command)

  switch (toolName) {
    case 'workspace_overview':
      return { type: 'inspecting_project', detail: null, detailFull: null }

    case 'filesystem_list':
      return {
        type: 'searching_files',
        label: 'LISTING',
        detail: path ? shortPath(path) : null,
        detailFull: path,
        filePath: path
      }

    case 'filesystem_read':
      return {
        type: 'reading_file',
        detail: path ? shortPath(path) : null,
        detailFull: path,
        filePath: path
      }

    case 'filesystem_search':
      return {
        type: 'searching_code',
        detail: query ?? (path ? shortPath(path) : null),
        detailFull: query ?? path,
        filePath: path
      }

    case 'filesystem_create':
      return {
        type: 'creating_file',
        detail: path ? shortPath(path) : null,
        detailFull: path,
        filePath: path
      }

    case 'filesystem_edit':
      return {
        type: 'writing_file',
        detail: path ? shortPath(path) : null,
        detailFull: path,
        filePath: path
      }

    case 'terminal_run': {
      /*
       * The command decides the activity, not the tool. `npm test` and
       * `npm install` arrive through the same tool and are not the same thing
       * to watch — which is the whole reason this file exists.
       */
      const type = command ? activityForCommand(command) : 'running_command'
      return {
        type,
        detail: command ? shortCommand(command) : null,
        detailFull: command,
        command
      }
    }

    case 'git_status':
      return { type: 'git_operation', detail: 'git status', detailFull: 'git status' }
    case 'git_diff':
      return {
        type: 'git_operation',
        detail: path ? `git diff ${shortPath(path)}` : 'git diff',
        detailFull: path ? `git diff ${path}` : 'git diff'
      }
    case 'git_log':
      return { type: 'git_operation', detail: 'git log', detailFull: 'git log' }
    case 'git_commit': {
      const message = str(args.message)
      return {
        type: 'git_operation',
        label: 'COMMITTING',
        detail: message ? shortCommand(message, 24) : null,
        detailFull: message
      }
    }

    case 'web_search':
      return { type: 'web_search', detail: query, detailFull: query }
    case 'web_fetch': {
      const url = str(args.url)
      return {
        type: 'web_search',
        label: 'FETCHING',
        detail: url ? hostOf(url) : null,
        detailFull: url
      }
    }

    case 'delegate_task':
    case 'delegate_to_session': {
      /*
       * The teammate's *name* is not in the arguments — the tool takes an id —
       * so the detail is filled in by the caller, which can resolve it. Left
       * null here rather than showing a raw id, which would be a detail that
       * is technically true and tells the user nothing.
       */
      const target = str(args.agentId) ?? str(args.sessionId) ?? str(args.target)
      return {
        type: 'delegating',
        detail: null,
        detailFull: null,
        targetAgentId: target
      }
    }

    case 'agent_message': {
      const target = str(args.agentId) ?? str(args.target)
      return {
        type: 'talking_to_agent',
        detail: null,
        detailFull: null,
        targetAgentId: target
      }
    }

    case 'team_status':
      return { type: 'analyzing', label: 'CHECKING TEAM', detail: null, detailFull: null }

    default:
      /*
       * An unmapped tool still reports that work is happening, and names the
       * tool so the omission is visible. Silence here would look identical to
       * an idle agent.
       */
      return {
        type: 'running_command',
        label: ACTIVITY_LABEL.running_command,
        detail: toolName,
        detailFull: toolName
      }
  }
}

/** The host of a URL, for a badge. Falls back to the raw string. */
function hostOf(url: string): string {
  const match = /^[a-z]+:\/\/([^/?#]+)/i.exec(url)
  return match ? match[1] : shortCommand(url, 24)
}
