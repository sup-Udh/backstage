/**
 * The rules governing who may talk to whom.
 *
 * Pure functions over a roster, with no store, no electron and no I/O behind
 * them — which is what makes them testable, and they need to be. These limits
 * are a spend control: every connection is a route along which one agent can
 * hand work to another, and a graph that grows without bound is one where a
 * single request can fan out across the whole roster, each hop billed.
 *
 * A limit that is only *probably* enforced is not a limit.
 */

/**
 * How many other agents one agent may be connected to.
 *
 * Two keeps a group to a chain of at most three — enough for a genuine
 * hand-off, small enough that the user can hold the whole shape of it in
 * their head.
 */
export const MAX_CONNECTIONS = 2

/**
 * How many agents may end up in one collaboration group.
 *
 * Two connections each does not on its own bound a group: A–B, B–C, C–D is a
 * chain where nobody exceeds two links and yet four agents share a thread,
 * and it can keep growing. This is what actually holds a conversation to a
 * size a person can follow.
 */
export const MAX_GROUP = 3

/** The only thing these rules need to know about an agent. */
export interface Linkable {
  id: string
  name: string
  /** Directional, as stored. The rules read it as undirected. */
  canTalkTo: string[]
}

export interface LinkResult {
  ok: boolean
  error?: string
}

/**
 * Everyone this agent is connected to, in either direction.
 *
 * A link written by an earlier build, or by editing the roster by hand, can
 * be one-way. Treating it as a connection is the safe reading: it is still a
 * route work can travel along, so it counts against the cap and it is shown
 * to the user. Reading only the outbound list would let a roster with
 * one-way links quietly exceed the limit.
 */
export function connectionsOf(roster: Linkable[], agentId: string): string[] {
  const agent = roster.find((a) => a.id === agentId)
  if (!agent) return []

  const live = new Set(roster.map((a) => a.id))
  const out = new Set(agent.canTalkTo.filter((id) => live.has(id) && id !== agentId))
  for (const other of roster) {
    if (other.id !== agentId && other.canTalkTo.includes(agentId)) out.add(other.id)
  }
  return [...out].sort()
}

/**
 * Everyone reachable from this agent through connections, including itself.
 *
 * The collaboration group: who shares a thread, and what the group cap is
 * measured against.
 */
export function groupOf(roster: Linkable[], agentId: string): string[] {
  if (!roster.some((a) => a.id === agentId)) return []

  const seen = new Set([agentId])
  const queue = [agentId]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const next of connectionsOf(roster, id)) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  // Sorted, so the same group always produces the same thread id.
  return [...seen].sort()
}

/** Whether these two may be connected, and why not if they may not. */
export function canConnect(
  roster: Linkable[],
  aId: string,
  bId: string
): LinkResult {
  if (aId === bId) return { ok: false, error: 'An agent cannot be connected to itself.' }

  const a = roster.find((x) => x.id === aId)
  const b = roster.find((x) => x.id === bId)
  if (!a || !b) return { ok: false, error: 'That agent no longer exists.' }

  const aLinks = connectionsOf(roster, aId)
  const bLinks = connectionsOf(roster, bId)

  // Already connected is success, not an error: the end state is what was
  // asked for, and a repeated drag should not read as a failure.
  if (aLinks.includes(bId) && bLinks.includes(aId)) return { ok: true }

  if (!aLinks.includes(bId) && aLinks.length >= MAX_CONNECTIONS) {
    return { ok: false, error: `${a.name} already has ${MAX_CONNECTIONS} connections.` }
  }
  if (!bLinks.includes(aId) && bLinks.length >= MAX_CONNECTIONS) {
    return { ok: false, error: `${b.name} already has ${MAX_CONNECTIONS} connections.` }
  }

  /*
   * Joining two groups must not produce one larger than the cap. Checked on
   * the union of both sides rather than on either alone, because each can be
   * within its own limit while the merge is not.
   */
  const merged = new Set([...groupOf(roster, aId), ...groupOf(roster, bId)])
  if (merged.size > MAX_GROUP) {
    return {
      ok: false,
      error: `That would make a group of ${merged.size}. The most that can work together is ${MAX_GROUP}.`
    }
  }

  return { ok: true }
}

/** The stable id for a group's shared conversation. */
export function threadIdFor(members: string[]): string {
  return `thread:${[...members].sort().join('+')}`
}
