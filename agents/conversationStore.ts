import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChatMessage } from './agent.types'
import type { Turn } from '../providers/provider.types'
import { mirror } from '../supabase/mirror'

/**
 * Per-agent conversation memory.
 *
 * Keyed by workspace *and* agent, so Jane remembers what she was doing in this
 * project and does not carry it into another one. Two agents never share a
 * file: private memory being private is the whole point, and a single
 * transcript with an agentId column would make a leak one bad query away.
 *
 * Deliberately separate from the collaboration log. What Jane said to Michael
 * is team activity both can see; what Jane said to the user is Jane's.
 */

/** Keep the tail. A conversation file that grows forever eventually stops loading. */
const MAX_MESSAGES = 400

export class ConversationStore {
  private dir(): string {
    const dir = join(app.getPath('userData'), 'conversations')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  /**
   * Both parts are sanitised and the workspace is hashed rather than embedded
   * whole: a Windows path contains characters that are not legal in a filename,
   * and truncating it would collide two projects with a long shared prefix.
   */
  private path(workspaceId: string, agentId: string): string {
    const safeAgent = agentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
    return join(this.dir(), `${hash(workspaceId)}_${safeAgent}.json`)
  }

  load(workspaceId: string, agentId: string): ChatMessage[] {
    try {
      const path = this.path(workspaceId, agentId)
      if (!existsSync(path)) return []
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter(isMessage) : []
    } catch {
      return []
    }
  }

  save(workspaceId: string, agentId: string, messages: ChatMessage[]): void {
    try {
      const trimmed =
        messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages
      writeFileSync(
        this.path(workspaceId, agentId),
        JSON.stringify(trimmed, null, 2),
        'utf8'
      )
      /*
       * The cloud copy of this transcript.
       *
       * Handed over as (workspace, agent) because that is the only identity
       * this store has — it is deliberately ignorant of projects. Resolving
       * the workspace path to an owned project, and refusing if it is not one,
       * is the mirror's job.
       */
      mirror.conversation(workspaceId, agentId, trimmed)
    } catch {
      // Losing the write is survivable; the session still has the messages.
    }
  }

  append(workspaceId: string, agentId: string, message: ChatMessage): ChatMessage {
    const messages = this.load(workspaceId, agentId)
    messages.push(message)
    this.save(workspaceId, agentId, messages)
    return message
  }

  clear(workspaceId: string, agentId: string): void {
    this.save(workspaceId, agentId, [])
  }

  /**
   * Delete a transcript outright, rather than emptying it.
   *
   * `clear` is for an agent that still exists and is starting fresh. This is
   * for one that has been deleted with its project: an empty file keyed to an
   * id nothing can reach again is a private conversation left on disk after
   * the user asked for it to be gone.
   */
  forget(workspaceId: string, agentId: string): void {
    try {
      const path = this.path(workspaceId, agentId)
      if (existsSync(path)) rmSync(path)
      mirror.conversationRemoved(workspaceId, agentId)
    } catch {
      // A transcript that cannot be removed is not worth failing a delete over.
    }
  }

  /**
   * Recent turns, in the shape the provider layer wants.
   *
   * Collaboration lines are folded in as user turns rather than dropped: a
   * message from a teammate is context the agent is expected to have, and
   * attributing it keeps the model from mistaking it for the user speaking.
   */
  history(workspaceId: string, agentId: string, limit = 12): Turn[] {
    return this.load(workspaceId, agentId)
      .slice(-limit)
      .map((m): Turn => {
        if (m.kind === 'agent') return { role: 'assistant', content: m.text }
        if (m.kind === 'collaboration') {
          return {
            role: 'user',
            content: `[Message from ${m.fromName ?? m.fromAgentId ?? 'a teammate'}] ${m.text}`
          }
        }
        return { role: 'user', content: m.text }
      })
  }
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const m = value as Partial<ChatMessage>
  return typeof m.text === 'string' && typeof m.kind === 'string'
}

/** FNV-1a. Short, stable, and enough to keep two projects in separate files. */
function hash(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export const conversationStore = new ConversationStore()
