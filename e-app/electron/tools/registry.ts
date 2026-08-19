import type { AgentTool } from './types'
import { filesystemTools } from './filesystem'
import { terminalTools } from './terminal'
import { gitTools } from './git'
import { webTools } from './web'
import { overviewTools } from './overview'

/**
 * Every tool an agent can reach, grouped into families.
 *
 * Providers are handed a list and translate it into their own function schema;
 * they never define tools. Agents are granted families rather than individual
 * tools, because that is the decision a user actually wants to make: "can the
 * researcher run shell commands?" not "can it call terminal_run?".
 */

export type ToolFamily = 'filesystem' | 'terminal' | 'git' | 'web'

const FAMILIES: Record<ToolFamily, AgentTool[]> = {
  // Orientation belongs with filesystem: it is the cheap way to start reading.
  filesystem: [...overviewTools, ...filesystemTools],
  terminal: terminalTools,
  git: gitTools,
  web: webTools
}

export const TOOL_FAMILIES: { id: ToolFamily; label: string; blurb: string }[] = [
  { id: 'filesystem', label: 'Filesystem', blurb: 'Read, search, create and edit files' },
  { id: 'terminal', label: 'Terminal', blurb: 'Run builds, tests and commands' },
  { id: 'git', label: 'Git', blurb: 'Status, diff and history' },
  { id: 'web', label: 'Web', blurb: 'Search and fetch pages' }
]

const ALL: AgentTool[] = Object.values(FAMILIES).flat()
const BY_NAME = new Map(ALL.map((t) => [t.name, t]))

export function allTools(): AgentTool[] {
  return ALL
}

/** The tools an agent with these families is allowed to use. */
export function toolsForFamilies(families: string[]): AgentTool[] {
  const wanted = families.length > 0 ? families : Object.keys(FAMILIES)
  return wanted.flatMap((f) => FAMILIES[f as ToolFamily] ?? [])
}

export function getTool(name: string): AgentTool | undefined {
  return BY_NAME.get(name)
}
