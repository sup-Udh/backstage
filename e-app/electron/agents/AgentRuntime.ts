import type { AgentConfig, RuntimeEvent, RuntimeEventType } from './agent.types'
import type { Turn } from '../providers/provider.types'
import { getProvider, getProviderDefinition } from '../providers/registry'
import { readConfig } from '../credentials/secureStore'
import { getTool, toolsForFamilies } from '../tools/registry'
import { getWorkspace, getWorkspaceRoot } from '../workspace/WorkspaceManager'
import { systemPromptFor } from './prompts'
import { BudgetTracker, budgetFor } from './execution'
import { conversationStore } from './conversationStore'

/**
 * The agent runtime: one task, one or more agents, a tool loop each.
 *
 * Provider-independent by construction — it asks the registry for whichever
 * provider the agent is bound to, hands it that agent's permitted tools, runs
 * what the model asks for and feeds the results back. OpenAI and Gemini take
 * the identical path.
 *
 * The lifecycle is uniform too: an agent is activated when assigned and
 * returns to idle when finished. It is never removed — once someone has been
 * brought into the office they stay, which is what makes the world fill up
 * with the user's team over a session.
 */

export type EventSink = (event: RuntimeEvent) => void

export class AgentRuntime {
  private queues: Record<string, { taskId: string; prompt: string; history: Turn[]; depth?: number; parentTaskId?: string }[]> = {}
  private activeAgents = new Set<string>()

  constructor(private emit: EventSink) {}

  private send(type: RuntimeEventType, fields: Partial<RuntimeEvent> = {}): void {
    this.emit({ type, at: Date.now(), ...fields })
  }

  /**
   * Run a task. Concurrently broadcasts the task to all targeted agents.
   * If an agent is already busy, the task is added to their queue.
   */
  async runTask(
    taskId: string,
    prompt: string,
    agents: AgentConfig[],
    history: Turn[],
    depth: number = 0,
    parentTaskId?: string
  ): Promise<void> {
    if (agents.length === 0) return

    const title = prompt.trim().replace(/\s+/g, ' ').slice(0, 60)

    for (const agent of agents) {
      this.send('task.created', { taskId, parentTaskId, depth, agentId: agent.id, agentName: agent.name, task: title, activity: `New task: ${title}` })
      
      if (!this.queues[agent.id]) {
        this.queues[agent.id] = []
      }
      this.queues[agent.id].push({ taskId, prompt, history, depth, parentTaskId } as any)
      this.processQueue(agent)
    }
  }

  private async processQueue(agent: AgentConfig): Promise<void> {
    if (this.activeAgents.has(agent.id)) return
    
    const queue = this.queues[agent.id]
    if (!queue || queue.length === 0) return

    this.activeAgents.add(agent.id)
    const taskDef = queue.shift()!

    const { taskId, prompt, history } = taskDef

    try {
      this.send('agent.activated', {
        taskId,
        parentTaskId: taskDef.parentTaskId,
        depth: taskDef.depth,
        agentId: agent.id,
        agentName: agent.name,
        activity: 'joined the task.'
      })
      this.send('agent.thinking', {
        taskId,
        parentTaskId: taskDef.parentTaskId,
        depth: taskDef.depth,
        agentId: agent.id,
        agentName: agent.name,
        action: 'Reading the brief'
      })

      try {
        const text = await this.loop(taskId, prompt, agent, history)

        this.send('agent.completed', {
          taskId,
          agentId: agent.id,
          agentName: agent.name,
          activity: 'finished.',
          message: text
        })

        // Persist message to ConversationStore
        const workspaceRoot = getWorkspaceRoot() || 'default'
        conversationStore.append(workspaceRoot, agent.id, {
          id: Date.now().toString(),
          role: 'agent',
          agentId: agent.id,
          text,
          timestamp: Date.now()
        })

        this.send('task.completed', { taskId, agentId: agent.id, agentName: agent.name, task: prompt.slice(0, 60), activity: 'Task closed.' })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong while working.'
        this.send('agent.failed', {
          taskId,
          agentId: agent.id,
          agentName: agent.name,
          activity: 'could not finish.',
          message
        })
        this.send('task.failed', { taskId, agentId: agent.id, agentName: agent.name, task: prompt.slice(0, 60), activity: 'Task failed.' })
      } finally {
        /*
         * Back to idle, still in the room. The character stays at its desk
         * so the office accumulates the user's team rather than emptying
         * after every task.
         */
        this.send('agent.idle', {
          taskId,
          agentId: agent.id,
          agentName: agent.name
        })
      }
    } finally {
      this.activeAgents.delete(agent.id)
      // Check for more tasks in this agent's queue
      void this.processQueue(agent)
    }
  }

  /** The tool loop for one agent. Returns its final prose. */
  private async loop(
    taskId: string,
    prompt: string,
    agent: AgentConfig,
    history: Turn[]
  ): Promise<string> {
    const def = getProviderDefinition(agent.providerId)
    const provider = getProvider(agent.providerId)
    if (!def || !provider) throw new Error(`${agent.providerId} is not connected.`)

    const model = agent.modelId ?? readConfig(agent.providerId).selectedModel
    if (!model) throw new Error(`No model selected for ${def.name}.`)

    const workspaceRoot = getWorkspaceRoot()
    const tools = toolsForFamilies(agent.tools).filter(
      // Without a workspace there is nothing local to act on; web still works.
      (t) => workspaceRoot !== null || t.name.startsWith('web_')
    )
    const specs = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }))

    const turns: Turn[] = [...history, { role: 'user', content: prompt }]
    const system = systemPromptFor(
      agent,
      getWorkspace(),
      tools.map((t) => t.name)
    )
    const tracker = new BudgetTracker(budgetFor(agent.profile))

    for (;;) {
      const stop = tracker.exhausted()
      if (stop) {
        /*
         * Out of budget. Rather than surfacing the limit as if it were the
         * model's answer, ask for the best conclusion from what it already
         * has. The user gets findings, not an error about step counts.
         */
        return await this.wrapUp(provider, def, model, system, turns, specs, stop)
      }

      tracker.nextStep()

      let result
      try {
        result = await provider.generateTurn({ model, system, turns, tools: specs })
      } catch (err) {
        throw new Error(def.normalise(err).message)
      }

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
        this.send('agent.message', {
          taskId,
          agentId: agent.id,
          agentName: agent.name,
          message: result.text.trim()
        })
      }

      for (const call of result.toolCalls) {
        const tool = getTool(call.name)

        if (!tool || !tools.includes(tool)) {
          turns.push({
            role: 'tool',
            toolCallId: call.id,
            toolName: call.name,
            content: `Error: you do not have a tool named ${call.name}. Available: ${tools.map((t) => t.name).join(', ')}.`
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
            taskId,
            agentId: agent.id,
            agentName: agent.name,
            tool: tool.name,
            activity: 'repeated the same call and was stopped.'
          })
          continue
        }

        const action = tool.describe?.(call.arguments) ?? tool.label
        this.send('agent.working', {
          taskId,
          agentId: agent.id,
          agentName: agent.name,
          model,
          tool: tool.name,
          action: presentTense(action)
        })
        this.send('agent.tool.started', {
          taskId,
          agentId: agent.id,
          agentName: agent.name,
          tool: tool.name,
          action: presentTense(action),
          activity: `${lower(presentTense(action))}…`
        })

        let output: string
        let ok = false
        try {
          const res = await tool.execute(call.arguments, {
            workspaceRoot: workspaceRoot ?? '',
            agentId: agent.id,
            taskId,
            onFileChange: (kind, path) => {
              this.send(`file.${kind}` as RuntimeEventType, {
                taskId,
                agentId: agent.id,
                agentName: agent.name,
                path,
                activity: `${kind} ${path}`
              })
            }
          })
          ok = res.success
          output = res.success
            ? res.output ?? '(no output)'
            : `Error: ${res.error ?? 'the tool failed.'}`
        } catch (err) {
          output = `Error: ${err instanceof Error ? err.message : 'the tool threw.'}`
        }

        this.send(ok ? 'agent.tool.completed' : 'agent.tool.failed', {
          taskId,
          agentId: agent.id,
          agentName: agent.name,
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
    provider: ReturnType<typeof getProvider>,
    def: ReturnType<typeof getProviderDefinition>,
    model: string,
    system: string,
    turns: Turn[],
    _specs: unknown,
    reason: string
  ): Promise<string> {
    if (!provider || !def) throw new Error('Provider unavailable.')
    void _specs

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
    [/^Surveyed /, 'Surveying ']
  ]
  for (const [re, replacement] of map) {
    if (re.test(action)) return action.replace(re, replacement)
  }
  return action
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}
