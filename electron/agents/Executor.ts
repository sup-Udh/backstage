import type { AgentConfig, AgentTask, RuntimeEventType } from './agent.types'
import type { Turn } from '../providers/provider.types'
import { getProvider, getProviderDefinition } from '../providers/registry'
import { readConfig } from '../credentials/secureStore'
import { getTool, toolsForCapabilities } from '../tools/registry'
import { isTeamLead } from '../projects/projectStore'
import { getWorkspace, getWorkspaceRoot } from '../workspace/WorkspaceManager'
import { systemPromptFor } from './prompts'
import { BudgetTracker, budgetFor } from './budget'
import { systemBus } from './EventBus'
import { agentRegistry } from './AgentRegistry'
import { requestApproval, denyForExecution } from './approvals'

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
    const provider = getProvider(this.agent.providerId)
    if (!def || !provider) {
      throw new Error(
        `${this.agent.providerId} is not connected. Add its API key in Connections.`
      )
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
        t.name === 'delegate_task' ||
        t.name === 'agent_message' ||
        t.name === 'team_status'
    )
    const allowed = new Set(tools.map((t) => t.name))
    const specs = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }))

    const turns: Turn[] = [...this.history, { role: 'user', content: this.task.prompt }]
    const system = systemPromptFor(
      this.agent,
      getWorkspace(),
      tools.map((t) => t.name)
    )
    const tracker = new BudgetTracker(budgetFor(this.agent.profile))

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
      agentRegistry.progress(this.agent.id, this.id, 'thinking', 'Thinking')

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
        toolCalls: result.toolCalls
      })

      if (result.text?.trim()) {
        agentRegistry.progress(this.agent.id, this.id, 'talking', 'Reporting back')
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

        if (tool.requiresApproval) {
          agentRegistry.progress(this.agent.id, this.id, 'waiting', `Waiting: ${present}`)
          this.send('agent.tool.started', {
            tool: tool.name,
            action: present,
            activity: `is waiting for you to approve ${lower(present)}.`
          })

          const approved = await requestApproval({
            agentId: this.agent.id,
            agentName: this.agent.name,
            taskId: this.task.id,
            executionId: this.id,
            tool: tool.name,
            summary: action,
            detail: describeArgs(call.arguments)
          })

          if (!approved) {
            turns.push({
              role: 'tool',
              toolCallId: call.id,
              toolName: call.name,
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
        }

        agentRegistry.progress(this.agent.id, this.id, 'working', present)
        this.send('agent.working', { tool: tool.name, action: present, model })
        this.send('agent.tool.started', {
          tool: tool.name,
          action: present,
          activity: `${lower(present)}…`
        })

        let output: string
        let ok = false
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
          output = res.success
            ? (res.output ?? '(no output)')
            : `Error: ${res.error ?? 'the tool failed.'}`
        } catch (err) {
          output = `Error: ${err instanceof Error ? err.message : 'the tool threw.'}`
        }

        this.send(ok ? 'agent.tool.completed' : 'agent.tool.failed', {
          tool: tool.name,
          action,
          activity: ok ? lower(action) : `${lower(action)} — failed`
        })

        // The result goes back either way: a failure is information the model
        // needs, not a reason to abandon the task.
        turns.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
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
    provider: NonNullable<ReturnType<typeof getProvider>>,
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
      const final = await provider.generateTurn({ model, system, turns, tools: [] })
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
