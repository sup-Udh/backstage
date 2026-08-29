import type { AgentTask, RuntimeEvent } from './agent.types'
import type { Turn } from '../providers/provider.types'
import { getAgent } from './agentStore'
import { orchestrator, wasRejected } from './AgentOrchestrator'
import { systemBus } from './EventBus'
import { listCollaboration } from './collaborationStore'
import { chainSettled, chainTasks, getTask } from './taskStore'
import { getActiveProject } from '../projects/projectStore'

/**
 * ALL AGENTS mode.
 *
 * Talking to the whole team used to mean running every agent over the same
 * prompt in turn, each one seeing the last one's answer. That produced five
 * overlapping essays on one question and cost five model calls to do it —
 * everybody answering everything is not a team, it is the same work five times.
 *
 * So the request goes to one agent: the project's team lead. They read it,
 * decide what it actually needs, hand the parts out to whoever should do them,
 * do their own part, and then pull the results together into one answer.
 *
 * There is deliberately very little machinery here. Delegation already exists —
 * `delegate_task` emits an event, `AgentOrchestrator.onDelegated` turns it into
 * a real child task carrying `parentTaskId`, and the depth and chain caps
 * already bound it. This class adds exactly two things on top: routing the
 * request to the lead, and asking the lead for a final answer once everything
 * it handed out has come back.
 */

/** One in-flight team request, waiting for its chain to finish. */
interface Pending {
  rootTaskId: string
  leadId: string
  correlationId: string
  caseId: string | null
  request: string
  /** Set the moment synthesis is submitted, so it can only happen once. */
  synthesised: boolean
}

/**
 * How many team requests to track at once.
 *
 * A request whose chain never settles — an agent stuck, a session that never
 * returns — would otherwise sit here forever. The oldest is dropped rather
 * than retained: losing the final synthesis of a request from an hour ago is a
 * far smaller problem than a map that grows for the life of the process.
 */
const MAX_PENDING = 24

export interface TeamRunResult {
  taskId: string
  leadId: string
  leadName: string
}

class GodAgent {
  private pending = new Map<string, Pending>()

  constructor() {
    systemBus.on((event) => this.onEvent(event))
  }

  /**
   * Which agent coordinates this project, if it can actually take work.
   *
   * Returns null rather than throwing when there is no usable lead, so the
   * caller can fall back to broadcasting. A project whose lead was deleted or
   * never spawned must still answer "talk to everyone" somehow — refusing
   * would make the whole surface unusable over a setting the user may not
   * even know exists.
   */
  lead(): { id: string; name: string } | null {
    const project = getActiveProject()
    if (!project?.godAgentId) return null

    const agent = getAgent(project.godAgentId)
    if (!agent || !agent.enabled || !agent.spawned) return null
    return { id: agent.id, name: agent.name }
  }

  /**
   * Send a whole-team request to the lead.
   *
   * The prompt is the user's own words, unwrapped. The lead already knows it
   * coordinates — that is in its system prompt, along with the current roster —
   * and restating it here would put instructions in the conversation where the
   * user can see them being talked to instead of asked.
   */
  run(
    prompt: string,
    origin: 'user' | 'trigger' = 'user',
    /**
     * The conversation so far, as the renderer holds it.
     *
     * Passed through rather than left to the lead's own stored memory because
     * a follow-up — "and the licence?" — is unanswerable without it, and the
     * lead is now the only agent that sees a whole-team request.
     */
    history?: Turn[]
  ): TeamRunResult | { error: string } {
    const lead = this.lead()
    if (!lead) return { error: 'This project has no team lead that can take work.' }

    const result = orchestrator.submit({
      agentId: lead.id,
      prompt,
      origin,
      history: history && history.length > 0 ? history : undefined
    })
    if (wasRejected(result)) return { error: result.error }

    this.remember({
      rootTaskId: result.id,
      leadId: lead.id,
      correlationId: result.correlationId,
      caseId: result.caseId,
      request: prompt,
      synthesised: false
    })

    return { taskId: result.id, leadId: lead.id, leadName: lead.name }
  }

  private remember(entry: Pending): void {
    if (this.pending.size >= MAX_PENDING) {
      const oldest = this.pending.keys().next().value
      if (oldest !== undefined) this.pending.delete(oldest)
    }
    this.pending.set(entry.rootTaskId, entry)
  }

  /**
   * Watch for a team request finishing.
   *
   * Every task ending is a candidate, because the last one to finish might be
   * the lead's own or the third agent it delegated to — there is no way to
   * know which in advance, so each ending re-asks the same question of every
   * request still outstanding: has everything descended from it stopped?
   */
  private onEvent(event: RuntimeEvent): void {
    if (!SETTLES.has(event.type)) return

    for (const entry of [...this.pending.values()]) {
      if (entry.synthesised) continue

      const root = getTask(entry.rootTaskId)
      if (!root) {
        // Aged out of the bounded ledger; there is nothing left to report on.
        this.pending.delete(entry.rootTaskId)
        continue
      }

      if (root.status !== 'completed') {
        /*
         * The lead itself failed or was stopped. There is no answer to pull
         * together and asking it again would most likely fail the same way, so
         * the request is closed out rather than retried.
         */
        if (root.status === 'failed' || root.status === 'cancelled') {
          this.pending.delete(entry.rootTaskId)
        }
        continue
      }

      if (!chainSettled(entry.correlationId)) continue

      const delegated = chainTasks(entry.correlationId).filter(
        (t) => t.id !== entry.rootTaskId
      )
      const sessions = this.sessionsGiven(entry)

      /*
       * Nothing was handed out, so the lead's own answer *is* the answer.
       * Asking it to summarise itself would bill a second call to restate what
       * the user has already read.
       */
      if (delegated.length === 0 && sessions.length === 0) {
        this.pending.delete(entry.rootTaskId)
        continue
      }

      entry.synthesised = true
      this.synthesise(entry, delegated, sessions)
      this.pending.delete(entry.rootTaskId)
    }
  }

  /** CLI sessions this request handed work to, by name. */
  private sessionsGiven(entry: Pending): string[] {
    return [
      ...new Set(
        listCollaboration(200)
          .filter(
            (m) =>
              m.correlationId === entry.correlationId &&
              m.receiverAgentId.startsWith('cli-')
          )
          .map((m) => m.receiverName)
      )
    ]
  }

  /**
   * Ask the lead for the final answer.
   *
   * Submitted as a fresh request rather than as part of the original chain: it
   * carries its own correlation id, so it cannot re-trigger the check that
   * produced it, and it keeps the original case id so the whole investigation
   * stays in one place on the Cases page.
   *
   * The results are handed over as text rather than left for the lead to fetch,
   * because a delegate reports into its own session — the lead has no way to
   * read it, and asking it to would be asking it to invent one.
   */
  private synthesise(entry: Pending, delegated: AgentTask[], sessions: string[]): void {
    const findings = delegated
      .map((t) => {
        const who = getAgent(t.agentId)?.name ?? t.agentId
        if (t.status === 'completed' && t.result) {
          return `${who} was asked to: ${t.title}\n${t.result}`
        }
        return `${who} was asked to: ${t.title}\n(did not finish: ${t.error ?? t.status})`
      })
      .join('\n\n')

    const outstanding =
      sessions.length > 0
        ? `\n\nStill working in their own terminals, with no result available here: ${sessions.join(', ')}. Mention what you handed them; do not guess at what they found.`
        : ''

    const prompt = `The user asked the team:

${entry.request}

You handed parts of it out. Here is what came back:

${findings}${outstanding}

Write the single answer to the user's original question — you are the only one
answering them, so this has to stand on its own. Combine what your teammates
reported with your own work, say plainly where they disagree or where something
did not finish, and do not repeat the same finding twice.

Attribute as you go. The user cannot see your teammates' replies, only yours, so
name whoever established each part in the sentence that carries it — "Michael
read LICENSE.md and it is MIT", not "the licence is MIT". Keep it to who found
what; do not narrate the hand-offs themselves.`

    const result = orchestrator.submit({
      agentId: entry.leadId,
      prompt,
      title: `Answer: ${truncate(entry.request)}`,
      /*
       * The user's, because this is the answer to the user's question rather
       * than automatic agent-to-agent chatter. It is also what exempts it from
       * the chain guards — correctly, since it is submitted exactly once per
       * request and never itself synthesised.
       */
      origin: 'user',
      caseId: entry.caseId,
      /*
       * Marked, so the interface can lead with it.
       *
       * Without this the team's final answer is indistinguishable from the
       * four replies above it — same agent, same shape, same transcript — and
       * the user is left to work out which of five messages was the one
       * written to answer their question.
       */
      part: 'synthesis'
    })

    if (wasRejected(result)) {
      systemBus.emit({
        type: 'task.failed',
        agentId: entry.leadId,
        agentName: getAgent(entry.leadId)?.name,
        correlationId: entry.correlationId,
        reason: `Could not pull the team's findings together: ${result.error}`
      })
    }
  }
}

/** Events after which a chain might have finished. */
const SETTLES = new Set<RuntimeEvent['type']>([
  'task.completed',
  'task.failed',
  'task.cancelled'
])

function truncate(text: string): string {
  const flat = text.trim().replace(/\s+/g, ' ')
  return flat.length > 48 ? `${flat.slice(0, 47)}…` : flat
}

export const godAgent = new GodAgent()
