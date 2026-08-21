import type { CapabilityId } from '../../src/shared/agents'

/**
 * Which capability each tool requires.
 *
 * Pure data, deliberately kept apart from the registry that uses it. The
 * registry imports every tool implementation, and those reach the agent store,
 * the workspace and Electron itself — so anything that wants to ask "may this
 * agent use `delegate_task`?" in a test had to boot half the application to
 * find out, and consequently nothing ever asked.
 *
 * That mattered. The rule that decides whether a team can collaborate at all
 * lives here and in `roleProfiles.ts`, and the two disagreed for every theme
 * whose job titles did not contain the word "lead". Both are now plain
 * functions over plain data, and `roleProfiles.test.ts` checks them against
 * every cast the product ships.
 *
 * The mapping is exhaustive and fails closed: a tool with no capability
 * recorded here is granted to nobody. Adding a tool without deciding who may
 * use it therefore makes it unreachable rather than universal, which is the
 * safe direction for that mistake to fail in.
 */
export const TOOL_CAPABILITIES: Record<string, CapabilityId> = {
  // Orientation is the cheap way to start reading, so it sits with reading.
  workspace_overview: 'files.read',
  filesystem_list: 'files.read',
  filesystem_read: 'files.read',
  filesystem_search: 'files.read',
  filesystem_create: 'files.write',
  filesystem_edit: 'files.write',
  terminal_run: 'terminal.execute',
  git_status: 'git.read',
  git_diff: 'git.read',
  git_log: 'git.read',
  git_commit: 'git.commit',
  web_fetch: 'web.search',
  web_search: 'web.search',
  delegate_task: 'agents.talk',
  agent_message: 'agents.talk',
  team_status: 'agents.talk'
}

export function capabilityForTool(toolName: string): CapabilityId | null {
  return TOOL_CAPABILITIES[toolName] ?? null
}

/**
 * Whether an agent holding these capabilities may use this tool.
 *
 * `alsoGranted` is for capabilities an agent holds because of the job the user
 * gave it rather than because of a checkbox — at present exactly one: the
 * project's team lead can talk to its team. That is not a loophole in the
 * permission model, it is the model catching up with a decision the user
 * already made explicitly somewhere else, and the alternative is what it
 * fixes: a lead that the permission check waves through and the toolset never
 * equips.
 */
export function mayUseTool(
  toolName: string,
  capabilities: readonly CapabilityId[],
  alsoGranted: readonly CapabilityId[] = []
): boolean {
  const needed = TOOL_CAPABILITIES[toolName]
  if (needed === undefined) return false
  return capabilities.includes(needed) || alsoGranted.includes(needed)
}
