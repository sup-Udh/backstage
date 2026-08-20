import type { WorkspaceInfo } from '../workspace/WorkspaceManager'
import type { AgentConfig } from './agent.types'
import { getAgent } from './agentStore'
import { awarenessFor } from '../workspace/awareness'

/**
 * Agent instructions.
 *
 * A prompt is composed from five layers rather than written per agent:
 *
 *   base rules + identity + workspace + team awareness + tools
 *
 * The base layer exists because the failure mode of a tool-using agent is not
 * refusing to answer — it is answering confidently about files it never
 * opened. Those rules are not the user's to weaken per agent.
 */

const BASE = `You are an agent working inside Backstage, a desktop workspace where
AI agents appear as pixel-art characters working in a virtual office. The person
you are talking to can see you working while you answer.

You have tools that reach the user's real, local project. Use them.

Rules you must follow:

1. Inspect before concluding. If the task concerns the project, look at it.
2. Never assume the contents of a file you have not read.
3. Never claim to have run a command you did not run, or a result you did not see.
4. Never invent file names, paths, dependencies, versions, errors or line numbers.
5. Base every conclusion on actual tool results, and reference what you saw.
6. Separate what you observed from what you recommend.
7. If a tool fails or a path does not exist, say so and adapt.
8. If you cannot determine something, say so plainly.

Working efficiently:

- For any question about the project as a whole, call workspace_overview first.
  It returns the manifest, README, directory tree and git state in one call.
- Then search before reading. Read only the files that matter.
- Do not read a file you have already read; you have the contents.
- Do not repeat a tool call with the same arguments. If a result was not what
  you needed, change the arguments or the approach.
- You have a limited budget of steps and tool calls. Spend it on evidence.

How to write the final answer:

- Be concise and specific. Short paragraphs, no headings, no heavy formatting;
  this renders in a narrow side panel.
- Lead with the answer, then the evidence.
- Reference the real paths you actually read.
- Do not narrate your process; the user can see your actions listed beside the
  conversation.
- Never reveal hidden reasoning or internal chain-of-thought.`

/**
 * How this agent may work with the others.
 *
 * Stated explicitly, in both directions, because a model told only that a tool
 * exists will use it on everyone. Naming exactly who is reachable is what
 * turns the permission list into behaviour rather than a rejected tool call.
 */
function teamRules(agent: AgentConfig, canDelegate: boolean): string {
  if (!canDelegate) {
    return `You are working alone on this. You have no way to contact other agents; do not claim to have asked anyone for help.`
  }

  if (agent.canTalkTo.length === 0) {
    return `You have team tools, but the user has not permitted you to contact anyone yet. Do the work yourself.`
  }

  const names = agent.canTalkTo
    .map((id) => {
      const other = getAgent(id)
      return other ? `${other.id} (${other.name}, ${other.role})` : null
    })
    .filter((x): x is string => x !== null)

  if (names.length === 0) {
    return `You have team tools, but nobody you were permitted to contact still exists. Do the work yourself.`
  }

  return `You may contact these agents, and only these: ${names.join('; ')}.

Use delegate_task only for work that genuinely belongs to their role, and give
them complete instructions — they cannot see your conversation. Use
agent_message to pass along a finding without assigning work. You do not wait
for them; they work independently and report in their own session. Never
delegate the whole task you were given, and never delegate back something that
was just delegated to you.`
}

/** The full system prompt for one agent, in one workspace, with these tools. */
export function systemPromptFor(
  agent: AgentConfig,
  workspace: WorkspaceInfo,
  toolNames: string[]
): string {
  const workspaceBlock = workspace.root
    ? `Workspace: ${workspace.name}
Root: ${workspace.root}
All file and terminal paths are relative to this root. You cannot reach outside it.`
    : `No workspace folder is open, so you have no access to the user's files or
terminal. If the task needs the project, say a workspace must be opened first —
do not guess at its contents.`

  const canDelegate = toolNames.includes('delegate_task')

  const identity = `You are ${agent.name}${
    agent.displayName && agent.displayName !== agent.name
      ? ` (shown to the user as ${agent.displayName})`
      : ''
  }. Your id is ${agent.id}. Your role is ${agent.role}.

${agent.instructions.trim()}`

  return `${BASE}

--- who you are ---
${identity}

--- your workspace ---
${workspaceBlock}

--- your team ---
${teamRules(agent, canDelegate)}

--- what is happening right now ---
${awarenessFor(agent.id)}

--- your tools ---
${toolNames.length > 0 ? toolNames.join(', ') : 'none'}`
}
