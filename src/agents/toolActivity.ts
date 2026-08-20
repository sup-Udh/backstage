/**
 * What an agent actually did, as something the conversation can show.
 *
 * The runtime already reports every tool call it makes — `agent.tool.started`
 * when one begins and `agent.tool.completed` or `.failed` when it ends, each
 * carrying the tool's name and a written description of that specific call.
 * Until now the chat threw all of it away and printed only the final prose,
 * so a five-minute investigation appeared as a wall of text with no evidence
 * of the work behind it.
 *
 * This turns that stream into structure. Nothing here invents activity: a run
 * exists because the main process said a tool ran, and it is marked finished
 * because the main process said it finished.
 */

export type ToolGroup = 'files' | 'terminal' | 'git' | 'web' | 'team' | 'other'

/**
 * Which heading a tool is filed under.
 *
 * Keyed by the registry's own tool names. A tool that is added without an
 * entry here still appears — under OTHER — rather than vanishing from the
 * transcript, because silently dropping evidence of work is worse than
 * filing it imprecisely.
 */
const GROUPS: Record<string, ToolGroup> = {
  workspace_overview: 'files',
  filesystem_list: 'files',
  filesystem_read: 'files',
  filesystem_search: 'files',
  filesystem_create: 'files',
  filesystem_edit: 'files',
  terminal_run: 'terminal',
  git_status: 'git',
  git_diff: 'git',
  git_log: 'git',
  git_commit: 'git',
  web_fetch: 'web',
  web_search: 'web',
  delegate_task: 'team',
  agent_message: 'team',
  team_status: 'team'
}

export function groupForTool(name: string): ToolGroup {
  return GROUPS[name] ?? 'other'
}

export const GROUP_LABEL: Record<ToolGroup, string> = {
  files: 'Files',
  terminal: 'Terminal',
  git: 'Git',
  web: 'Web',
  team: 'Team',
  other: 'Tools'
}

/** A small mark per group, in the product's existing status vocabulary. */
export const GROUP_GLYPH: Record<ToolGroup, string> = {
  files: '▤',
  terminal: '▸',
  git: '⑂',
  web: '⌖',
  team: '⇄',
  other: '◈'
}

export type ToolRunStatus = 'running' | 'ok' | 'failed'

/** One tool call, as it happened. */
export interface ToolRun {
  id: string
  agentId: string
  taskId?: string
  /** Registry name, e.g. `filesystem_read`. */
  tool: string
  group: ToolGroup
  /** The runtime's description of this specific call, e.g. "Read auth.ts". */
  action: string
  status: ToolRunStatus
  at: number
}

/**
 * Consecutive runs of the same kind, shown as one box.
 *
 * Grouping is by adjacency rather than by collecting every file operation in
 * the task together: the order tools ran in is information — read, then test,
 * then read again is a different story from six reads and one test — and
 * sorting by category would destroy it.
 */
export interface ToolBlock {
  id: string
  group: ToolGroup
  runs: ToolRun[]
  at: number
  /** True while any run in the block is still going. */
  running: boolean
  failed: number
}

export function blocksFrom(runs: ToolRun[]): ToolBlock[] {
  const blocks: ToolBlock[] = []
  for (const run of runs) {
    const last = blocks[blocks.length - 1]
    // A new task always starts a new box, even if it opens with the same tool.
    if (last && last.group === run.group && last.runs[0].taskId === run.taskId) {
      last.runs.push(run)
      last.running ||= run.status === 'running'
      if (run.status === 'failed') last.failed++
      continue
    }
    blocks.push({
      id: run.id,
      group: run.group,
      runs: [run],
      at: run.at,
      running: run.status === 'running',
      failed: run.status === 'failed' ? 1 : 0
    })
  }
  return blocks
}

/**
 * The line shown while an agent is mid-tool, phrased as a sentence about the
 * agent rather than as a status code.
 *
 * "Jane is reading auth.ts" tells the user what is happening; "THINKING" tells
 * them only that something is. The runtime already produces the present-tense
 * clause, so this is only ever assembling a sentence, never guessing at one.
 */
export function activityLine(name: string, action: string | null): string {
  if (!action) return `${name} is thinking…`
  const lowered = action.charAt(0).toLowerCase() + action.slice(1)
  return `${name} is ${lowered}…`
}
