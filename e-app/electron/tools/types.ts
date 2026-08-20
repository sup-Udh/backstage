/**
 * The tool contract.
 *
 * Every capability an agent has — reading a file, running a command, checking
 * git — is a tool with this shape. Providers never define tools; they are
 * handed the registry and asked to expose it in whatever format their API
 * wants, so adding a tool makes it available to every provider at once.
 */

export interface ToolContext {
  workspaceRoot: string
  agentId: string
  agentName: string
  taskId: string
  executionId: string
  /**
   * Ties everything descended from one originating request together. Carried
   * into any agent-to-agent message a tool sends, so a chain can be counted
   * and capped however far it branches.
   */
  correlationId: string
  /** How many agent-to-agent hops deep this execution already is. */
  depth: number
  /** Emitted by tools that change the workspace, for the activity feed. */
  onFileChange?: (kind: 'created' | 'modified' | 'deleted', path: string) => void
}

export interface ToolResult {
  success: boolean
  output?: string
  error?: string
  metadata?: {
    path?: string
    exitCode?: number
    durationMs?: number
    truncated?: boolean
  }
}

/** JSON Schema for the tool's arguments, as the model will see it. */
export interface ToolSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

export interface AgentTool {
  /** Snake_case, because that is what both provider APIs accept. */
  name: string
  /** Human label for the activity feed, e.g. "Reading a file". */
  label: string
  description: string
  inputSchema: ToolSchema
  /**
   * Whether running this needs the user to say yes first. Read-only tools are
   * automatic; anything that can destroy work is not.
   */
  requiresApproval?: boolean
  /** A short activity line describing this specific call. */
  describe?: (input: Record<string, unknown>) => string
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

/** Cap on any single tool's output, so one call cannot blow the context. */
export const MAX_OUTPUT_CHARS = 24_000

export function truncate(text: string, limit = MAX_OUTPUT_CHARS): {
  text: string
  truncated: boolean
} {
  if (text.length <= limit) return { text, truncated: false }
  return {
    text:
      text.slice(0, limit) +
      `\n\n… output truncated at ${limit} characters (${text.length} total).`,
    truncated: true
  }
}
