import type { CapabilityId, CapabilityInfo } from './agents'

/**
 * The capability catalogue.
 *
 * A value module rather than a type file, because both processes need the same
 * list: the main process to decide which tools an agent may reach, and the
 * editor to draw the checkboxes. It has no imports beyond its own types, so
 * neither side drags the other's runtime in by using it.
 *
 * Order is the order it renders in.
 */
export const CAPABILITIES: CapabilityInfo[] = [
  {
    id: 'files.read',
    group: 'Files',
    label: 'Read',
    blurb: 'List, read and search files in the workspace.',
    privileged: false
  },
  {
    id: 'files.write',
    group: 'Files',
    label: 'Write',
    blurb: 'Create and edit files in the workspace.',
    privileged: true
  },
  {
    id: 'terminal.execute',
    group: 'Terminal',
    label: 'Execute commands',
    blurb: 'Run builds, tests and shell commands.',
    privileged: true
  },
  {
    id: 'git.read',
    group: 'Git',
    label: 'Read status & diff',
    blurb: 'Inspect status, diffs and history.',
    privileged: false
  },
  {
    id: 'git.commit',
    group: 'Git',
    label: 'Commit',
    blurb: 'Stage and commit changes. Asks you first.',
    privileged: true
  },
  {
    id: 'web.search',
    group: 'Web',
    label: 'Search web',
    blurb: 'Search the web and fetch pages.',
    privileged: false
  },
  {
    id: 'agents.talk',
    group: 'Agents',
    label: 'Talk to other agents',
    blurb: 'Delegate work to, and message, permitted teammates.',
    privileged: false
  }
]

/**
 * What a new agent starts with.
 *
 * Read-only capabilities only. An agent that can rewrite files and run shell
 * commands the moment it is created is not a default anyone asked for.
 */
export const DEFAULT_CAPABILITIES: CapabilityId[] = [
  'files.read',
  'git.read',
  'web.search'
]

const VALID = new Set<string>(CAPABILITIES.map((c) => c.id))

export function isCapability(value: unknown): value is CapabilityId {
  return typeof value === 'string' && VALID.has(value)
}

/**
 * Accept both the current capability ids and the tool-family names they
 * replaced, so a roster saved by an earlier build still opens with the
 * permissions its owner chose rather than silently losing them.
 */
const LEGACY_FAMILIES: Record<string, CapabilityId[]> = {
  filesystem: ['files.read', 'files.write'],
  terminal: ['terminal.execute'],
  git: ['git.read'],
  web: ['web.search'],
  orchestration: ['agents.talk']
}

export function normaliseCapabilities(raw: unknown): CapabilityId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CAPABILITIES]
  const out = new Set<CapabilityId>()
  for (const entry of raw) {
    if (isCapability(entry)) {
      out.add(entry)
      continue
    }
    for (const mapped of LEGACY_FAMILIES[String(entry)] ?? []) out.add(mapped)
  }
  return [...out]
}

/** Group the catalogue for rendering, preserving declaration order. */
export function capabilityGroups(): { group: string; items: CapabilityInfo[] }[] {
  const groups: { group: string; items: CapabilityInfo[] }[] = []
  for (const c of CAPABILITIES) {
    const found = groups.find((g) => g.group === c.group)
    if (found) found.items.push(c)
    else groups.push({ group: c.group, items: [c] })
  }
  return groups
}
