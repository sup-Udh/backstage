import type { AgentTool } from './types'
import type { CapabilityId } from '../../src/shared/agents'
import { capabilityForTool, mayUseTool } from './toolCapabilities'
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
 * Which capability each tool requires is `toolCapabilities.ts`, kept separate
 * so it can be checked without booting the application — this module reaches
 * the agent store, the workspace and Electron through the tools it collects.
 */

const ALL: AgentTool[] = [
  ...overviewTools,
  ...filesystemTools,
  ...terminalTools,
  ...gitTools,
  ...webTools,
  ...teamTools
]

const BY_NAME = new Map(ALL.map((t) => [t.name, t]))

export function allTools(): AgentTool[] {
  return ALL
}

export function capabilityFor(toolName: string): CapabilityId | null {
  return capabilityForTool(toolName)
}

/**
 * The tools an agent holding these capabilities may use.
 *
 * An empty capability list grants nothing. That is deliberate: the previous
 * behaviour treated "no families selected" as "every family", which meant the
 * least-configured agent was the most powerful one.
 *
 * `alsoGranted` is for capabilities an agent holds because of the job the user
 * gave it rather than because of a checkbox — at present exactly one: the
 * project's team lead can talk to its team. That is not a loophole in the
 * permission model, it is the model catching up with a decision the user
 * already made explicitly somewhere else, and the alternative is what this
 * fixes: a lead that the permission check waves through and the toolset never
 * equips.
 */
export function toolsForCapabilities(
  capabilities: CapabilityId[],
  alsoGranted: readonly CapabilityId[] = []
): AgentTool[] {
  return ALL.filter((tool) => mayUseTool(tool.name, capabilities, alsoGranted))
}

export function getTool(name: string): AgentTool | undefined {
  return BY_NAME.get(name)
}
