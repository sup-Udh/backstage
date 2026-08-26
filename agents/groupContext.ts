import { getAgent, groupOf, threadIdFor } from './agentStore'
import { agentRegistry } from './AgentRegistry'
import { conversationStore } from './conversationStore'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'

/**
 * The group, described for a prompt.
 *
 * Deliberately its own module rather than living in `threads.ts` beside the
 * rest of the group logic. `threads.ts` imports the orchestrator in order to
 * post into a thread, the orchestrator imports the executor, and the executor
 * imports the prompt builder — so putting this there closes a cycle, and one
 * whose modules all construct singletons at load time.
 *
 * Nothing here posts, submits or writes. It reads the group and renders it as
 * text, which is why it can sit below all of that.
 */

/** How many group lines to put in a prompt. Enough for context, not a log. */
const GROUP_HISTORY = 6

/**
 * Who this agent is working with, as structured facts.
 *
 * Handed to the model rather than left to be inferred from chat history. An
 * agent working with two teammates has to know who they are, what they do and
 * what they are doing *now* — and history only carries whoever happens to have
 * spoken recently, which is why an agent that had not heard from a teammate
 * all session would answer as though it were alone.
 *
 * Returns an empty string for an agent with no group, so the caller can
 * concatenate it without deciding whether to.
 */
export function groupContextFor(agentId: string): string {
  const members = groupOf(agentId)
  if (members.length < 2) return ''

  const names = members.map((id) => getAgent(id)?.name ?? id)

  const others = members
    .filter((id) => id !== agentId)
    .map((id) => {
      const member = getAgent(id)
      if (!member) return null
      const state = agentRegistry.get(id)
      const doing = state.action ? ` — currently ${state.action}` : ''
      return `  ${member.name} (${member.id}), ${member.role}: ${state.status}${doing}`
    })
    .filter((line): line is string => line !== null)

  const recent = conversationStore
    .load(getWorkspaceRoot() ?? 'no-workspace', threadIdFor(members))
    .slice(-GROUP_HISTORY)
    .map(
      (m) =>
        `  ${m.fromName ?? (m.kind === 'user' ? 'The user' : (getAgent(m.agentId)?.name ?? m.agentId))}: ${m.text}`
    )

  return [
    `You are in a group of ${members.length}: ${names.join(', ')}.`,
    'The other members are:',
    ...others,
    ...(recent.length > 0 ? ['Recently in the group conversation:', ...recent] : [])
  ].join('\n')
}
