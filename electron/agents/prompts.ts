import type { WorkspaceInfo } from '../workspace/WorkspaceManager'
import type { AgentConfig, AgentTask } from './agent.types'
import { getAgent, leadOf, listAgents, workersOf } from './agentStore'
import { agentRegistry } from './AgentRegistry'
import { groupContextFor } from './groupContext'
import { chainTasks } from './taskStore'
import { getActiveProject } from '../projects/projectStore'
import { agentSessions } from '../terminal/AgentSessionManager'
import { awarenessFor } from '../workspace/awareness'
import { limitsFor } from './limits'

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

/** `id (Name, Role)` for a list of agent ids, skipping any that have gone. */
function describe(ids: string[]): string[] {
  return ids
    .map((id) => {
      const other = getAgent(id)
      return other ? `${other.id} (${other.name}, ${other.role})` : null
    })
    .filter((x): x is string => x !== null)
}

/**
 * How this agent may work with the others.
 *
 * Stated explicitly, in both directions, because a model told only that a tool
 * exists will use it on everyone. Naming exactly who is reachable is what
 * turns the permission list into behaviour rather than a rejected tool call.
 *
 * Direction is stated too, and it is the part that changes behaviour most. A
 * connection is not symmetrical: one agent leads and the other works. Without
 * that, two connected agents are each equally entitled to reassign the job to
 * the other, which is exactly how a task ends up handed back and forth while
 * both of them bill for the round trip.
 */
function teamRules(agent: AgentConfig, canDelegate: boolean, isLead: boolean): string {
  if (!canDelegate) {
    return `You are working alone on this. You have no way to contact other agents; do not claim to have asked anyone for help.`
  }

  /*
   * The project's team lead is never "connected to nobody".
   *
   * Everything below reads the connections the user drew by hand. The lead's
   * reach does not come from those — `isTeamLead` lets it contact every agent
   * in its own project whether or not a single link exists — so running it
   * through the same code produced the fallback at the bottom of this
   * function: "the user has not connected you to anyone yet. Do the work
   * yourself."
   *
   * That sentence landed in the prompt immediately above the coordination
   * block telling the same agent to split the request up and hand the parts
   * out, and it landed first. A lead given both instructions did the obvious
   * thing with the contradiction and answered everything alone, which looked
   * exactly like delegation being broken.
   *
   * So the lead is told what it may actually do here, and the block below
   * tells it what to do with that. The roster it may reach is listed there
   * rather than twice.
   */
  if (isLead) {
    return `You coordinate this project, so you may contact every agent on it —
the user does not have to connect you to anyone first. The roster below lists
who exists, what they do and whether they are able to take work right now.`
  }

  const workers = describe(workersOf(agent.id))
  const leadId = leadOf(agent.id)
  const lead = leadId ? getAgent(leadId) : undefined
  const peers = describe(
    agent.canTalkTo.filter((id) => id !== leadId && !workersOf(agent.id).includes(id))
  )

  const parts: string[] = []

  if (lead) {
    parts.push(`You report to ${lead.name} (${lead.id}), who leads this work.

When you finish, use agent_message to report back to them: what you did, what
you found, and the real paths and commands behind it. Ask them if something is
ambiguous rather than guessing. Do not reassign the job you were given, and do
not hand work back to whoever just gave it to you.`)
  }

  if (workers.length > 0) {
    parts.push(`You lead these agents: ${workers.join('; ')}.

You may assign them work with delegate_task. Split the job by what genuinely
belongs to each of their roles, give complete instructions — they cannot see
your conversation — and say what you handed to whom. They work independently
and report back to you in their own time; you do not wait on a tool result.
Never delegate the whole task you were given: the part that is yours stays
yours.`)
  }

  if (peers.length > 0) {
    parts.push(`You may also contact: ${peers.join('; ')}. Use agent_message to
pass along a finding. You do not direct them and they do not direct you.`)
  }

  if (parts.length === 0) {
    return `You have team tools, but the user has not connected you to anyone yet. Do the work yourself.`
  }

  return parts.join('\n\n')
}

/**
 * The extra authority and expectations the project's team lead carries.
 *
 * Appended rather than replacing the ordinary rules, because the lead is still
 * an agent with a role and a workspace — it coordinates *as well as* working,
 * and a prompt that only described coordination produced an agent that
 * delegated everything and answered nothing itself.
 */
/*
 * Exported, though nothing calls it today.
 *
 * It is the coordination prompt, kept intact for whenever ALL AGENTS routes
 * to a lead again — see the note at its call site in `systemPromptFor`.
 * Exporting is what lets it survive `noUnusedLocals` without a suppression
 * comment that would read as an oversight rather than a decision.
 */
export function godAgentRules(team: string): string {
  return `You are the team lead for this project. When the user addresses the
whole team, the request comes to you.

Your job is to get the request answered, not to answer all of it yourself:

1. Work out what the request actually needs doing.
2. Look at who is available — call team_status if you need it fresh.
3. Split the work along the team's real roles and hand the parts out with
   delegate_task, or delegate_to_session for a running CLI session.
4. Do the part that is genuinely yours.
5. Say plainly what you took on and what you handed to whom.

Delegate whenever another agent is better suited or the work can genuinely run
in parallel. Do not delegate what it would be faster to do yourself, do not
hand the same thing to two agents, and never delegate the entire request
untouched — that is not coordination, it is forwarding.

Your teammates report back in their own sessions rather than as tool results,
so do not wait on them. Finish your own part, state what is still outstanding
and who has it, and give the user the best answer you can now.

If the roster below shows nobody who can take work — everyone unspawned or
disabled — then do the whole thing yourself, but say so in your first sentence
and name who was unavailable. Doing it all silently is the one outcome to
avoid: the user asked the team and has no way to tell from the answer that
there was nobody to hand it to.

The team, as it stands:
${team}`
}

/**
 * The wider job a delegated task belongs to.
 *
 * Without this, an agent handed work by the team lead received the
 * instructions and nothing else: not what the user originally asked, not who
 * asked it, not who else was working on it. It answered a question with no
 * idea it was one third of an answer — and, worse, `teamRules` told it in the
 * same prompt that nobody was connected to it and it should work alone, which
 * is exactly the opposite of what had just happened.
 *
 * Built from the task chain rather than from chat history, because a worker
 * has no chat history with the lead: the hand-off is a task, and the task
 * ledger is where its shape is actually recorded.
 *
 * Returns null for ordinary work — a task the user asked for directly is not
 * part of a mission and describing it as one would be inventing a team effort
 * around a single question.
 */
function missionBlock(task: AgentTask): string | null {
  if (!task.parentTaskId || !task.originAgentId) return null

  const lead = getAgent(task.originAgentId)
  if (!lead) return null

  const chain = chainTasks(task.correlationId)
  const root = chain.find((t) => t.depth === 0)
  const peers = chain.filter((t) => t.id !== task.id && t.depth > 0)

  const lines: string[] = [
    `You are one part of a job ${lead.name} is coordinating.`
  ]

  if (root) {
    lines.push(`
What the user asked the team:
${root.prompt.trim()}`)
  }

  lines.push(`
Your part of it: ${task.title}

${lead.name} (${lead.id}) split the work and will write the team's single
answer from what comes back. Do your part and report what you actually found —
the paths you read, the commands you ran, the result you saw. Do not attempt
the other parts, and do not answer the whole question: somebody else is
already on the rest of it, and two agents answering the same thing is what
this split exists to avoid.`)

  if (peers.length > 0) {
    const others = peers
      .map((t) => {
        const who = getAgent(t.agentId)
        return who ? `  ${who.name} (${who.role}): ${t.title}` : null
      })
      .filter((line): line is string => line !== null)
    if (others.length > 0) {
      lines.push(`
Also working on this:
${others.join('\n')}`)
    }
  }

  lines.push(`
Your findings reach ${lead.name} automatically when you finish, so there is
nothing to send. Use agent_message only if you need to tell them something
before then — a blocker, or a question you cannot answer yourself.`)

  return lines.join('\n')
}

/** The full system prompt for one agent, in one workspace, with these tools. */
export function systemPromptFor(
  agent: AgentConfig,
  workspace: WorkspaceInfo,
  toolNames: string[],
  /** The task about to run, when there is one. Supplies the mission context. */
  task?: AgentTask
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

  const project = getActiveProject()
  const isLead = project?.godAgentId === agent.id

  /*
   * The group block is omitted entirely for an agent with no group, rather
   * than included as "you have no group". A heading with nothing under it is
   * something a model will try to make use of.
   */
  const group = groupContextFor(agent.id)
  const limits = limitsFor(agent, isLead)
  const mission = task ? missionBlock(task) : null

  return [
    BASE,
    '',
    '--- who you are ---',
    identity,
    '',
    '--- your workspace ---',
    workspaceBlock,
    ...(limits ? ['', '--- what you cannot do ---', limits] : []),
    '',
    '--- your team ---',
    /*
     * On a mission, the mission *is* the team situation. The generic rules
     * would otherwise tell an agent that was just handed work by the lead that
     * nobody is connected to it and it should work alone.
     */
    mission ?? teamRules(agent, canDelegate, isLead),
    /*
     * The coordination block is deliberately not included any more.
     *
     * It opened with "when the user addresses the whole team, the request
     * comes to you", and that stopped being true when ALL AGENTS went back to
     * reaching every agent directly. Leaving it in would tell one agent it
     * owned every whole-team request while the other three were answering the
     * same request independently — which is the "Jane takes over everything"
     * behaviour, now stated in the prompt as fact.
     *
     * `godAgentRules` and `teamRoster` are kept for whenever the routing is
     * restored; putting this line back is all that is needed. The lead keeps
     * its permissions in the meantime — it may still reach anyone in the
     * project — it is simply no longer told it is the team's front door.
     */
    ...(group ? ['', '--- your group ---', group] : []),
    '',
    '--- what is happening right now ---',
    awarenessFor(agent.id),
    '',
    '--- your tools ---',
    toolNames.length > 0 ? toolNames.join(', ') : 'none'
  ].join('\n')
}

/**
 * Every worker in the project, as the lead needs to see them.
 *
 * Agents and CLI sessions in one list, because to a coordinator they are the
 * same thing: something that can be given a task and will report back. The
 * distinction that matters is which tool reaches them, so each line says.
 */
export function teamRoster(leadId: string): string {
  const lines: string[] = []

  for (const agent of listAgents()) {
    if (agent.id === leadId) continue
    const state = agentRegistry.get(agent.id)
    const presence = agent.spawned ? state.status : 'not spawned — cannot take work'
    const doing = state.action ? ` — currently ${state.action}` : ''
    const queued = state.queued > 0 ? `, ${state.queued} queued` : ''
    lines.push(
      `  ${agent.name} (${agent.id}), ${agent.role}: ${presence}${doing}${queued} — delegate_task`
    )
  }

  for (const session of agentSessions.active()) {
    lines.push(
      `  ${session.name} (${session.id}), ${session.provider ?? 'cli'} session: ${session.status} — delegate_to_session`
    )
  }

  return lines.length > 0 ? lines.join('\n') : '  You are the only worker in this project.'
}
