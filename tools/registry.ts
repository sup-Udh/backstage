import type { AgentTool } from './types'
import type { CapabilityId } from '../src/shared/agents'
import { capabilityForTool, mayUseTool } from './toolCapabilities'
import { reconcile } from './toolNames'
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

/*
 * The registry must match its own manifest.
 *
 * `mayUseTool` fails closed, so a tool registered here but missing from
 * `toolCapabilities.ts` is granted to nobody — it does not throw, it simply
 * never appears in any agent's tool list. That is how `delegate_to_session`
 * came to be described to every team lead in its system prompt while being
 * reachable by none of them.
 *
 * Checked at load rather than in a test alone, because the failure is silent
 * in production too: this turns "the tool quietly does not exist" into a
 * startup error that names it.
 */
{
  const { missing, unknown } = reconcile(ALL.map((t) => t.name))
  if (missing.length > 0 || unknown.length > 0) {
    const parts = [
      missing.length > 0 ? `registered in toolNames.ts but not built here: ${missing.join(', ')}` : '',
      unknown.length > 0 ? `built here but absent from toolNames.ts: ${unknown.join(', ')}` : ''
    ].filter(Boolean)
    throw new Error(`Tool registry does not match its manifest — ${parts.join('; ')}.`)
  }
  const uncapped = ALL.filter((t) => capabilityForTool(t.name) === null).map((t) => t.name)
  if (uncapped.length > 0) {
    throw new Error(
      `These tools have no capability in toolCapabilities.ts, so no agent can ever use them: ${uncapped.join(', ')}.`
    )
  }
}

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
