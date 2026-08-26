/**
 * Every tool the agent runtime registers, by name.
 *
 * Pure data, for the same reason `toolCapabilities.ts` is pure data: the
 * registry imports every tool implementation, and those reach the agent store,
 * the terminal manager and Electron itself. Anything wanting to ask a question
 * about the *set* of tools — "does each one have a capability?" — had to boot
 * half the application to find out, so nothing asked, and `delegate_to_session`
 * shipped registered, documented in the team lead's system prompt, and
 * reachable by nobody.
 *
 * This is the manifest that makes the question answerable in a plain test.
 * `registry.ts` checks its assembled tool list against it on load, so the two
 * cannot drift: adding a tool without listing it here fails at startup with
 * the name of the tool, rather than silently granting it to no one.
 */
export const TOOL_NAMES = [
  // overview
  'workspace_overview',
  // filesystem
  'filesystem_list',
  'filesystem_read',
  'filesystem_search',
  'filesystem_create',
  'filesystem_edit',
  // terminal
  'terminal_run',
  // git
  'git_status',
  'git_diff',
  'git_log',
  'git_commit',
  // web
  'web_fetch',
  'web_search',
  // team
  'delegate_task',
  'delegate_to_session',
  'agent_message',
  'team_status'
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

/**
 * Which registered names are missing from a mapping, and which are strangers.
 *
 * Returned as data rather than thrown, so both callers can use it: the
 * registry turns it into a startup error naming the tool, and the test turns
 * it into a failing assertion naming the same one.
 */
export function reconcile(names: readonly string[]): {
  missing: string[]
  unknown: string[]
} {
  const registered = new Set<string>(TOOL_NAMES)
  const given = new Set(names)
  return {
    missing: [...registered].filter((n) => !given.has(n)),
    unknown: [...given].filter((n) => !registered.has(n))
  }
}
