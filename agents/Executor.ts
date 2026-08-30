import type { AgentConfig, AgentTask, RuntimeEventType } from './agent.types'
import type { Turn } from '../providers/provider.types'
import { resolveProvider, getProviderDefinition } from '../providers/registry'
import { readConfig } from '../credentials/secureStore'
import { getTool, toolsForCapabilities } from '../tools/registry'
import { teamTools } from '../tools/team'
import { isTeamLead } from '../projects/projectStore'
import { listAgents } from './agentStore'
import { existsSync } from 'node:fs'
import {
  getWorkspace,
  getWorkspaceRoot,
  type WorkspaceInfo
} from '../workspace/WorkspaceManager'
import { systemPromptFor } from './prompts'
import { BudgetTracker, budgetFor } from './budget'
import { systemBus } from './EventBus'
import { requestApproval, denyForExecution } from './approvals'
import { evaluateToolCall, recordPermission } from './permissionStore'
import { categoryInfo } from './permissionRules'
import { getAgent } from './agentStore'
import { activityForTool } from './activityMap'
import { report } from './activityStore'

/**
 * One agent, one task, one tool loop.
 *
 * Everything about an execution is scoped to its own object: its own budget,
 * its own turns, its own cancellation flag, its own id. Nothing is reachable
 * through a module-level variable, which is exactly why three of these can run
 * at once without their output landing in each other's sessions.
 *
 * Provider-independent by construction. It asks the registry for whichever
 * provider the agent is bound to, hands it that agent's permitted tools, runs
 * what the model asks for and feeds the results back. OpenAI and Gemini take
 * the identical path.
 */

/**
 * The tools that still work with no workspace folder open.
 *
 * Derived from the team tool list rather than spelled out, because it was
 * spelled out and drifted: `delegate_to_session` was added to the team tools
 * and never added here, so even once it was reachable it would still have
 * vanished for a project with no folder open.
 */
const TEAM_TOOLS = new Set(teamTools.map((t) => t.name))

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

export class Execution {
  private cancelled = false
  private readonly workspaceRoot: string | null

  constructor(
    readonly id: string,
    private readonly agent: AgentConfig,
    private readonly task: AgentTask,
    private readonly history: Turn[]
  ) {
    // An agent bound to a folder works there whatever the user has open, so a
    // task can never be run against a project it was not configured for.
    this.workspaceRoot = agent.workspace ?? getWorkspaceRoot()
  }

  /**
   * Ask the execution to stop.
   *
   * Takes effect at the next step or tool boundary rather than mid-request:
   * neither provider SDK gives a reliable way to abort a call already in
   * flight, and pretending otherwise would mean reporting a task as stopped
   * while it was still being billed.
   */
  cancel(): void {
    this.cancelled = true
    denyForExecution(this.id)
  }

  get isCancelled(): boolean {
    return this.cancelled
  }

  private checkCancelled(): void {
    if (this.cancelled) throw new CancelledError()
  }

  /** This execution's workspace, described the way the prompt wants it. */
  private workspaceInfo(): WorkspaceInfo {
    if (this.workspaceRoot === null) return { root: null, name: null, exists: false }
    if (this.workspaceRoot === getWorkspaceRoot()) return getWorkspace()
    return {
      root: this.workspaceRoot,
      name: this.workspaceRoot.split(/[\/]/).filter(Boolean).pop() ?? this.workspaceRoot,
      exists: existsSync(this.workspaceRoot)
    }
  }

  /**
   * Who this execution is acting for, when it is not the user.
   *
   * A delegated task is one agent working on another's behalf, and the person
   * being asked to approve a command should be told both names. Resolved
   * through `getAgent`, which is scoped to the open project, so a stale id
   * from a deleted agent reads as "nobody" rather than naming a stranger.
   */
  private requestedByName(): string | null {
    if (!this.task.originAgentId) return null
    return getAgent(this.task.originAgentId)?.name ?? null
  }

  private send(type: RuntimeEventType, fields: Record<string, unknown> = {}): void {
    systemBus.emit({
      type,
      agentId: this.agent.id,
      agentName: this.agent.name,
      taskId: this.task.id,
      parentTaskId: this.task.parentTaskId ?? undefined,
      executionId: this.id,
      correlationId: this.task.correlationId,
      depth: this.task.depth,
      ...fields
    })
  }

  /** Run to completion. Returns the agent's final prose. */
  async run(): Promise<string> {
    const def = getProviderDefinition(this.agent.providerId)
    /*
     * Resolved per run, never cached. The credential belongs to whoever is
     * signed in *now* — so an execution queued before a sign-out cannot go out
     * on the previous account's key, and the message tells the user which of
     * the three things to fix rather than a generic "not connected".
     */
    const { provider, message } = resolveProvider(this.agent.providerId)
    if (!def || !provider) {
      throw new Error(message ?? `${this.agent.providerId} is not connected.`)
    }

    const model = this.agent.modelId ?? readConfig(this.agent.providerId).selectedModel
    if (!model) throw new Error(`No model is selected for ${def.name}.`)

    /*
     * Capabilities decide the toolset, then the workspace decides what is
     * usable: without a folder open there is nothing local to act on, but web
     * and team tools still work.
     */
    /*
     * The team lead can always reach its team.
     *
     * A capability normally comes from a checkbox, but this one comes from the
     * project's `godAgentId` — the user nominating somebody to receive ALL
     * AGENTS requests and split them up. Deriving it from the agent's *role
     * string* instead, which is what happened before, made the whole feature a
     * lottery on wording: "Team Lead" matched the keyword and got the tool,
     * "Consulting Detective" did not, so a Sherlock project's lead silently
     * answered every whole-team request alone while a detective project's
     * delegated properly. Which theme you picked decided whether the product's
     * headline feature worked.
     */
    const tools = toolsForCapabilities(
      this.agent.capabilities,
      isTeamLead(this.agent.id) ? ['agents.talk'] : []
    ).filter(
      (t) =>
        this.workspaceRoot !== null ||
        t.name.startsWith('web_') ||
        TEAM_TOOLS.has(t.name)
    )
    const allowed = new Set(tools.map((t) => t.name))
    const specs = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }))

    /*
     * One line per turn, in the main process console.
     *
     * Written because three separate causes of "the lead did not delegate"
     * were indistinguishable from the outside — it is not the lead, it has no
     * delegate_task, or it has nobody spawned to hand work to — and each one
     * produces the same visible outcome: one agent quietly answering
     * everything. Each is a single fact the runtime knows and was not saying.
     *
     * Kept to one line and to facts already on screen elsewhere: no prompt
     * text, no tool arguments, nothing that could carry a key or a file's
     * contents.
     */
    if (isTeamLead(this.agent.id) || tools.some((t) => TEAM_TOOLS.has(t.name))) {
      const others = listAgents()
        .filter((a) => a.id !== this.agent.id)
        .map((a) => `${a.name}:${a.spawned ? 'spawned' : 'NOT-SPAWNED'}`)
      console.log(
        `[backstage] ${this.agent.name} lead=${isTeamLead(this.agent.id) ? 'YES' : 'no'}` +
          ` delegate_task=${allowed.has('delegate_task') ? 'yes' : 'NO'}` +
          ` model=${model}` +
          ` team=[${others.join(' ') || 'nobody else in this project'}]`
      )
    }

    const turns: Turn[] = [...this.history, { role: 'user', content: this.task.prompt }]
    const system = systemPromptFor(
      this.agent,
      /*
       * The workspace this execution is actually pointed at, which is not
       * necessarily the one the user has open — an agent bound to a folder
       * works there regardless. Describing the global one here told a bound
       * agent it was in a project its own tools could not reach.
       */
      this.workspaceInfo(),
      tools.map((t) => t.name),
      // The task, so a delegated agent is told what larger job it is part of.
      this.task
    )
    /*
     * The team lead never runs on the tightest budget.
     *
     * A role matching "lead", "manager" or "director" is given the `quick`
     * profile — 12 steps, 20 tool calls, 90 seconds — on the reasoning that a
     * coordinator should answer briefly. But the profile is a *budget*, not a
     * writing style, and the project's lead has strictly the most to do of
     * anybody: orient in the workspace, check who is available, call
     * delegate_task once per teammate, and then still do its own part of the
     * work. Twelve steps does not cover that, and running out does not look
     * like running out — the runtime asks for a final answer, so it looks like
     * a lead that chose to do everything itself.
     *
     * Raised to at least `normal`, never lowered: an agent explicitly
     * configured for `deep` keeps it.
     */
    const profile =
      isTeamLead(this.agent.id) && this.agent.profile === 'quick'
        ? 'normal'
        : this.agent.profile
    const tracker = new BudgetTracker(budgetFor(profile))

    for (;;) {
      this.checkCancelled()

      const stop = tracker.exhausted()
      if (stop) {
        /*
         * Out of budget. Rather than surfacing the limit as if it were the
         * model's answer, ask for the best conclusion from what it already
         * has. The user gets findings, not an error about step counts.
         */
        return await this.wrapUp(provider, def, model, system, turns, stop)
      }

      tracker.nextStep()
      /*
       * A model call is in flight. Reported as an activity rather than as a
       * status string, so the world, the chat header and the timeline all
       * learn it from the same place — and so it is `thinking` and not
       * `working`, which is a distinction the user can see in the pose.
       *
       * Only the fact that reasoning is happening. Never its contents: no
       * partial text, no tool plan, nothing from the model's own output goes
       * into an activity.
       */
      report(
        this.agent.id,
        /*
         * A team lead pulling its delegates' answers together is doing
         * something the user asked to see by name (§46). It is still a model
         * call, so it is still `thinking` — only the label changes, and it
         * changes on a fact the runtime already carries rather than on a
         * guess about what the prompt contains.
         */
        this.task.part === 'synthesis'
          ? { type: 'analyzing', label: 'SYNTHESISING' }
          : { type: 'thinking' }
      )

      let result
      try {
        /*
         * Deltas are forwarded straight out as events. Nothing accumulates
         * them here: the provider returns the complete text when the call
         * resolves, and that is what gets remembered and acted on. Treating
         * the assembled fragments as the answer would mean the transcript
         * depended on every chunk having arrived, which is not something a
         * network can promise.
         */
        result = await provider.generateTurn({
          model,
          system,
          turns,
          tools: specs,
          /*
           * Who is asking. Used only to label the provider's own log lines, so
           * two agents running at once can be told apart in one console.
           */
          identity: {
            agentId: this.agent.id,
            agentName: this.agent.name,
            executionId: this.id
          },
          onDelta: (chunk) => {
            // A cancelled execution stops narrating immediately, even though
            // the request it is attached to cannot be recalled mid-flight.
            if (this.cancelled) return
            this.send('agent.message.delta', { message: chunk, model })
          }
        })
      } catch (err) {
        throw new Error(def.normalise(err).message)
      }

      this.checkCancelled()

      if (!result.toolCalls || result.toolCalls.length === 0) {
        const text = (result.text ?? '').trim()
        if (!text) throw new Error('The model returned an empty response.')
        return text
      }

      turns.push({
        role: 'assistant',
        content: result.text,
        toolCalls: result.toolCalls,
        providerData: result.providerData
      })

      if (result.text?.trim()) {
        /*
         * Through the activity store like everything else. This was the last
         * place that wrote a status directly, and one direct write is all it
         * takes for the badge over a character's head to disagree with the
         * roster beside it.
         */
        report(this.agent.id, { type: 'reporting' })
        this.send('agent.message', { message: result.text.trim(), model })
      }

      for (const call of result.toolCalls) {
        this.checkCancelled()
        const tool = getTool(call.name)

        if (!tool || !allowed.has(tool.name)) {
          /*
           * Withheld rather than missing. Saying which tools it does have
           * makes the model pick a different route instead of asking again.
           */
          turns.push({
            role: 'tool',
            toolCallId: call.id,
            toolName: call.name,
            isError: true,
            content: `Error: you do not have a tool named ${call.name}. Available: ${
              tools.map((t) => t.name).join(', ') || 'none'
            }.`
          })
          continue
        }

        // Refuse work already done, and say why, so the model changes course.
        const repeat = tracker.useTool(call.name, call.arguments)
        if (repeat) {
          turns.push({
            role: 'tool',
            toolCallId: call.id,
            toolName: call.name,
            isError: true,
            content: `Error: ${repeat}`
          })
          this.send('agent.tool.failed', {
            tool: tool.name,
            activity: 'repeated the same call and was stopped.'
          })
          continue
        }

        const action = tool.describe?.(call.arguments) ?? tool.label
        const present = presentTense(action)

        /*
         * What this call actually is, in the interface's vocabulary.
         *
         * Derived from the tool name and its arguments by `activityMap`, which
         * is shared by every provider — the tool registry is the same registry
         * whichever model asked for it, so this is the point where OpenAI and
         * Gemini stop being distinguishable.
         *
         * Computed before the permission gate so the same mapping describes
         * both the approval prompt and the work itself.
         */
        const mapped = activityForTool(tool.name, call.arguments)
        const targetName = mapped.targetAgentId
          ? (getAgent(mapped.targetAgentId)?.name ?? null)
          : null

        /*
         * The permission gate.
         *
         * Every tool call goes through it, not only the ones a tool marked
         * dangerous. That flag could not tell `ls` from `rm -rf` — both arrive
         * as `terminal_run` — so the question the user was actually being
         * asked depended on which tool the model happened to reach for rather
         * than on what it was about to do.
         *
         * Three outcomes, and only one of them runs the tool.
         */
        const verdict = evaluateToolCall(tool.name, call.arguments, {
          strict: this.task.strictPermissions === true
        })

        if (verdict.kind === 'deny') {
          const label = categoryInfo(verdict.category)?.label ?? verdict.category
          recordPermission({
            agentId: this.agent.id,
            agentName: this.agent.name,
            requestedByName: this.requestedByName(),
            tool: tool.name,
            category: verdict.category,
            summary: action,
            outcome: 'blocked',
            automationName: this.task.automationName ?? null
          })
          this.send('permission.decided', {
            tool: tool.name,
            category: verdict.category,
            outcome: 'blocked',
            action,
            activity: `was blocked from ${lower(present)} — ${label} is set to DENY.`
          })
          turns.push({
            role: 'tool',
            toolCallId: call.id,
            toolName: call.name,
            isError: true,
            content: `Error: this project denies ${label}. Do not attempt it again by any route. Continue without it and say plainly what you could not do.`
          })
          this.send('agent.tool.failed', {
            tool: tool.name,
            action,
            activity: `${lower(action)} — denied by permissions`,
            reason: `${label} is set to DENY for this project.`
          })
          continue
        }

        if (verdict.kind === 'ask') {
          /*
           * Blocked on a person. Its own activity rather than a flavour of
           * working, because §19 is right that the user has to be able to see
           * the difference between an agent that is busy and an agent that is
           * waiting for them — those look identical otherwise, and the second
           * one never resolves on its own.
           */
          report(this.agent.id, {
            type: 'waiting_for_permission',
            detail: mapped.detail ?? action,
            detailFull: mapped.detailFull ?? action,
            toolName: tool.name,
            filePath: mapped.filePath ?? null,
            command: mapped.command ?? null
          })
          this.send('agent.tool.started', {
            tool: tool.name,
            action: present,
            activity: `is waiting for you to approve ${lower(present)}.`
          })

          const approved = await requestApproval({
            agentId: this.agent.id,
            agentName: this.agent.name,
            requestedByName: this.requestedByName(),
            automationName: this.task.automationName ?? null,
            taskId: this.task.id,
            executionId: this.id,
            tool: tool.name,
            category: verdict.category,
            summary: action,
            detail: describeArgs(call.arguments),
            workspaceName: this.workspaceInfo().name
          })

          if (!approved) {
            turns.push({
              role: 'tool',
              toolCallId: call.id,
              toolName: call.name,
              isError: true,
              content:
                'Error: the user did not approve this action. Do not try it again. Continue without it and say what you could not do.'
            })
            this.send('agent.tool.failed', {
              tool: tool.name,
              action,
              activity: `${lower(action)} — not approved`
            })
            continue
          }
          this.checkCancelled()
        } else if (verdict.category !== null) {
          /*
           * Allowed without asking. Recorded anyway, and only for the
           * categories that can change something: the history exists so a user
           * who turns Auto Allow on can still find out what it went on to do,
           * and a log that omitted exactly those actions would be worthless.
           */
          if (categoryInfo(verdict.category)?.impactful) {
            recordPermission({
              agentId: this.agent.id,
              agentName: this.agent.name,
              requestedByName: this.requestedByName(),
              tool: tool.name,
              category: verdict.category,
              summary: action,
              outcome: verdict.reason,
              automationName: this.task.automationName ?? null
            })
          }
        }

        report(this.agent.id, {
          type: mapped.type,
          label: mapped.label,
          detail: mapped.detail,
          detailFull: mapped.detailFull,
          toolName: tool.name,
          filePath: mapped.filePath ?? null,
          command: mapped.command ?? null,
          targetAgentId: mapped.targetAgentId ?? null,
          targetAgentName: targetName
        })
        this.send('agent.working', { tool: tool.name, action: present, model })
        this.send('agent.tool.started', {
          tool: tool.name,
          action: present,
          activity: `${lower(present)}…`
        })

        let output: string
        let ok = false
        /** The tool's own error text, so the user is told why, not just that. */
        let failure: string | null = null
        try {
          const res = await tool.execute(call.arguments, {
            workspaceRoot: this.workspaceRoot ?? '',
            agentId: this.agent.id,
            agentName: this.agent.name,
            taskId: this.task.id,
            executionId: this.id,
            correlationId: this.task.correlationId,
            depth: this.task.depth,
            onFileChange: (kind, path) => {
              this.send(`file.${kind}` as RuntimeEventType, {
                path,
                activity: `${kind} ${path}`
              })
            }
          })
          ok = res.success
          failure = res.success ? null : (res.error ?? 'the tool failed.')
          output = res.success
            ? (res.output ?? '(no output)')
            : `Error: ${failure}`
        } catch (err) {
          failure = err instanceof Error ? err.message : 'the tool threw.'
          output = `Error: ${failure}`
        }

        this.send(ok ? 'agent.tool.completed' : 'agent.tool.failed', {
          tool: tool.name,
          action,
          activity: ok ? lower(action) : `${lower(action)} — failed`,
          /*
           * Why it failed, not just that it did.
           *
           * The model was always told — the error goes back to it as the tool
           * result — but the user was not. A refused delegation therefore
           * rendered as a red "asked Lisbon for help — failed" and nothing
           * else, so the two things that actually stop a team working, "Lisbon
           * has not been spawned into the workspace" and "permission denied",
           * were invisible to the one person who could fix either.
           */
          reason: ok ? undefined : (failure ?? undefined)
        })

        // The result goes back either way: a failure is information the model
        // needs, not a reason to abandon the task.
        turns.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
          isError: !ok,
          content: output
        })
      }
    }
  }

  /**
   * One final call with tools withheld, so the model must answer in prose from
   * what it has gathered.
   */
  private async wrapUp(
    provider: NonNullable<ReturnType<typeof resolveProvider>['provider']>,
    def: NonNullable<ReturnType<typeof getProviderDefinition>>,
    model: string,
    system: string,
    turns: Turn[],
    reason: string
  ): Promise<string> {
    turns.push({
      role: 'user',
      content: `You have reached this task's ${reason}. Stop investigating and answer now, using only what you have already found. Be explicit about what you verified and what remains unchecked.`
    })

    try {
      const final = await provider.generateTurn({
        model,
        system,
        turns,
        tools: [],
        identity: {
          agentId: this.agent.id,
          agentName: this.agent.name,
          executionId: this.id
        }
      })
      const text = (final.text ?? '').trim()
      if (text) return text
    } catch (err) {
      throw new Error(def.normalise(err).message)
    }
    throw new Error(
      `Reached this task's ${reason} without reaching a conclusion. Try a narrower task, or give this agent a Deep execution profile.`
    )
  }
}

/** "Read package.json" -> "Reading package.json", for a live status line. */
function presentTense(action: string): string {
  const map: [RegExp, string][] = [
    [/^Read /, 'Reading '],
    [/^Listed /, 'Listing '],
    [/^Searched /, 'Searching '],
    [/^Created /, 'Creating '],
    [/^Edited /, 'Editing '],
    [/^Ran /, 'Running '],
    [/^Checked /, 'Checking '],
    [/^Fetched /, 'Fetching '],
    [/^Surveyed /, 'Surveying '],
    [/^Committed /, 'Committing '],
    [/^Asked /, 'Asking '],
    [/^Messaged /, 'Messaging ']
  ]
  for (const [re, replacement] of map) {
    if (re.test(action)) return action.replace(re, replacement)
  }
  return action
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** The arguments, readable, for an approval prompt. */
function describeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return '(no arguments)'
  return entries
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      const shown = text.length > 600 ? `${text.slice(0, 600)}…` : text
      return `${key}: ${shown}`
    })
    .join('\n')
}
