import type { AgentTool } from './types'
import type { CapabilityId } from '../../src/shared/agents'
import { filesystemTools } from './filesystem'
import { terminalTools } from './terminal'
import { gitTools } from './git'
import { webTools } from './web'
import { overviewTools } from './overview'
import { teamTools } from './team'

/**
 * Every tool an agent can reach, and the capability each one requires.
 *
 * Providers are handed a list and translate it into their own function schema;
 * they never define tools. Agents are granted capabilities rather than
 * individual tools, because that is the decision a user actually wants to
 * make: "may the researcher run shell commands?" not "may it call
 * terminal_run?".
 *
 * The mapping is exhaustive and fails closed: a tool with no capability
 * recorded here is granted to nobody. Adding a tool without deciding who may
 * use it therefore makes it unreachable rather than universal, which is the
 * safe direction for that mistake to fail in.
 */

const ALL: AgentTool[] = [
  ...overviewTools,
  ...filesystemTools,
  ...terminalTools,
  ...gitTools,
  ...webTools,
  ...teamTools
]

const REQUIRES: Record<string, CapabilityId> = {
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

const BY_NAME = new Map(ALL.map((t) => [t.name, t]))

export function allTools(): AgentTool[] {
  return ALL
}

export function capabilityFor(toolName: string): CapabilityId | null {
  return REQUIRES[toolName] ?? null
}

/**
 * The tools an agent holding these capabilities may use.
 *
 * An empty capability list grants nothing. That is deliberate: the previous
 * behaviour treated "no families selected" as "every family", which meant the
 * least-configured agent was the most powerful one.
 */
export function toolsForCapabilities(capabilities: CapabilityId[]): AgentTool[] {
  const granted = new Set<CapabilityId>(capabilities)
  return ALL.filter((tool) => {
    const needed = REQUIRES[tool.name]
    return needed !== undefined && granted.has(needed)
  })
}

export function getTool(name: string): AgentTool | undefined {
  return BY_NAME.get(name)
}
