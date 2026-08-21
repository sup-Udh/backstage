import type { AgentConfig, CapabilityId } from './agent.types'
import { CAPABILITIES } from '../../src/shared/capabilities'

/**
 * What each withheld capability stops the agent doing, in its own words.
 *
 * Phrased as the consequence rather than the permission, because the model has
 * to act on it: "you cannot create or edit files" is something it can obey,
 * where "you lack files.write" is a fact about a checkbox it has never seen.
 * The label is the one the Agents page actually shows, so the remedy the agent
 * states is the control the user will actually find.
 */
export const WITHHELD: Record<CapabilityId, string> = {
  'files.read': 'read, list or search any file in the project',
  'files.write': 'create, write or edit any file',
  'terminal.execute': 'run any command, build, test or script',
  'git.read': 'inspect git status, diffs or history',
  'git.commit': 'stage or commit anything',
  'web.search': 'search the web or fetch a page',
  'agents.talk': 'contact, message or delegate to any teammate'
}

/**
 * The capabilities this agent does not have, and what to say about them.
 *
 * This block exists because of a specific, silent failure. A tool an agent
 * lacks is simply absent from its tool list — the model is never told the
 * capability exists, so it does not know it is missing anything. Asked to
 * build a website by an agent with no `files.write`, it therefore did the only
 * thing it could think of: it wrote the entire contents of index.html and
 * styles.css into the chat as text and reported success. Nothing was created,
 * nothing failed, and the user had no way to find out why.
 *
 * An agent that knows what it cannot do says so in one line and names the
 * switch. That is the difference between a limit and a mystery.
 */
export function limitsFor(agent: AgentConfig, isLead: boolean): string | null {
  /*
   * Effective capabilities, not stored ones. The project's team lead can talk
   * to its team whether or not the box is ticked, so listing that as a
   * limitation would have the lead announce it cannot reach the people it is
   * about to delegate to.
   */
  const held = new Set<CapabilityId>(agent.capabilities)
  if (isLead) held.add('agents.talk')

  const missing = CAPABILITIES.filter((c) => !held.has(c.id))
  if (missing.length === 0) return null

  const lines = missing.map((c) => `  - ${WITHHELD[c.id]} (needs "${c.label}")`)

  return `The user has not granted you every permission. You cannot:

${lines.join('\n')}

These are not tools you are choosing not to use — you do not have them, and
there is no way around them. So:

- Never claim, imply or plan to do any of the above.
- If the task needs one, say so plainly in your first sentence, name the
  permission the user has to switch on for you, and tell them it is on the
  Agents page under your name. Then do as much of the task as you genuinely can
  with what you do have.
- In particular, if you cannot write files, do not paste file contents into the
  conversation as a substitute for creating them and then describe the work as
  done. Say that you cannot create the files, and why.`
}
