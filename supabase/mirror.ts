import type { AgentConfig } from '../src/shared/agents'
import type { Case, Project } from '../src/shared/projects'
import type { ChatMessage } from '../src/shared/agents'

/**
 * The seam between the local stores and the cloud mirror.
 *
 * Every store in Backstage is local-first: it writes JSON into userData and
 * answers from memory, which is what makes the app work on a plane and what
 * keeps a keystroke in the roster editor off the network. The cloud copy is a
 * *mirror* — the durable, per-account record of the same data — and it is
 * reached only through this object.
 *
 * It exists to keep the dependency graph acyclic. `sync.ts` has to read the
 * stores in order to reconcile them, so the stores cannot import `sync.ts`
 * back; this module imports nothing but types, so both sides can depend on it.
 * Until `sync.ts` registers itself the calls are no-ops, which is exactly the
 * behaviour wanted when Supabase is not configured or nobody is signed in.
 *
 * Every method is fire-and-forget by contract. A store must never be slowed
 * down, or made to fail, by the network.
 */

export interface MirrorSink {
  project(project: Project): void
  projectRemoved(projectId: string): void

  agents(agents: AgentConfig[]): void
  agentsRemoved(agentIds: string[]): void

  cases(cases: Case[]): void
  caseRemoved(caseId: string): void

  /**
   * One agent's transcript, keyed the way the local store keys it.
   *
   * The workspace path rather than a project id, because `ConversationStore`
   * genuinely does not know about projects — it is handed a workspace and an
   * agent. Resolving one to the other is the mirror's problem, not the
   * store's.
   */
  conversation(workspaceId: string, agentId: string, messages: ChatMessage[]): void
  conversationRemoved(workspaceId: string, agentId: string): void

  /** User-level settings, which belong to the account rather than a project. */
  settings(settings: Record<string, unknown>): void
}

const NOOP: MirrorSink = {
  project: () => {},
  projectRemoved: () => {},
  agents: () => {},
  agentsRemoved: () => {},
  cases: () => {},
  caseRemoved: () => {},
  conversation: () => {},
  conversationRemoved: () => {},
  settings: () => {}
}

let sink: MirrorSink = NOOP

export function registerMirror(next: MirrorSink): void {
  sink = next
}

/**
 * The mirror, as the stores see it.
 *
 * A function-valued proxy rather than the sink itself, so the stores bind to
 * this module once at import time and still reach whatever was registered
 * afterwards — registration happens during app start-up, long after the store
 * modules have been evaluated.
 */
export const mirror: MirrorSink = {
  project: (p) => sink.project(p),
  projectRemoved: (id) => sink.projectRemoved(id),
  agents: (a) => sink.agents(a),
  agentsRemoved: (ids) => sink.agentsRemoved(ids),
  cases: (c) => sink.cases(c),
  caseRemoved: (id) => sink.caseRemoved(id),
  conversation: (w, a, m) => sink.conversation(w, a, m),
  conversationRemoved: (w, a) => sink.conversationRemoved(w, a),
  settings: (s) => sink.settings(s)
}
