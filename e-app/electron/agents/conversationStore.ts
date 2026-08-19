import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  agentId: string
  text: string
  timestamp: number
}

/**
 * Stores agent conversations persistently across restarts.
 * Keyed by: agentId + workspaceId.
 */
export class ConversationStore {
  private getDir(): string {
    const dir = join(app.getPath('userData'), 'conversations')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  private getPath(workspaceId: string, agentId: string): string {
    // Basic sanitization for filenames
    const safeWorkspace = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const safeAgent = agentId.replace(/[^a-zA-Z0-9_-]/g, '_')
    return join(this.getDir(), `${safeWorkspace}_${safeAgent}.json`)
  }

  load(workspaceId: string, agentId: string): ChatMessage[] {
    const path = this.getPath(workspaceId, agentId)
    try {
      if (existsSync(path)) {
        const parsed = JSON.parse(readFileSync(path, 'utf8'))
        return Array.isArray(parsed) ? parsed : []
      }
    } catch {
      // Ignore read errors
    }
    return []
  }

  save(workspaceId: string, agentId: string, messages: ChatMessage[]): void {
    const path = this.getPath(workspaceId, agentId)
    try {
      writeFileSync(path, JSON.stringify(messages, null, 2), 'utf8')
    } catch {
      // Ignore write errors
    }
  }

  append(workspaceId: string, agentId: string, message: ChatMessage): void {
    const messages = this.load(workspaceId, agentId)
    messages.push(message)
    this.save(workspaceId, agentId, messages)
  }

  clear(workspaceId: string, agentId: string): void {
    this.save(workspaceId, agentId, [])
  }
}

export const conversationStore = new ConversationStore()
