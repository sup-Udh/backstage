import type { CapabilityId, ExecutionProfile } from './agent.types'

/**
 * What a role implies about how an agent should work.
 *
 * Pure, with no store and no electron behind it, for the same reason
 * `relationships.ts` is: this decides what a freshly cast team is *allowed to
 * do*, every theme words its job titles differently, and a policy that is only
 * probably right across six casts is not a policy. It lived inside the agent
 * store, where it could not be tested without a filesystem and an Electron
 * app object, and the consequence was a real one — see `agents.talk` below.
 */

/**
 * What a character's stated role implies about how they should work.
 *
 * A project's roster is picked as *characters* — Jane, Lisbon, Cho — and each
 * one arrives with a role written by their theme. Turning that role into
 * instructions and permissions here is what lets a project be created from a
 * cast list without asking the user to write eight system prompts first.
 *
 * Permissions differ per role because that is the point: a researcher has no
 * business running shell commands. Matching is on keywords rather than exact
 * strings, because every theme names its own roles — "Technical Investigator",
 * "Sales Lead" and "Lab Technician" all have to land somewhere sensible.
 */
export interface RoleProfile {
  instructions: string
  capabilities: CapabilityId[]
  profile: ExecutionProfile
}

export const ROLE_PROFILES: { match: RegExp; profile: RoleProfile }[] = [
  {
    match: /lead|manager|director|supervisor|chief|head/i,
    profile: {
      instructions:
        'You lead this team. Assess scope and risk, and say what should be done first and why. Keep answers short and decisive.',
      capabilities: ['files.read', 'git.read', 'agents.talk'],
      profile: 'quick'
    }
  },
  {
    match: /engineer|developer|programmer|technician|builder/i,
    profile: {
      instructions:
        'You are a software engineer. Inspect the existing implementation before modifying it. Prefer minimal, safe changes. Run the relevant build or tests after a modification and report what actually happened.',
      capabilities: ['files.read', 'files.write', 'terminal.execute', 'git.read'],
      profile: 'deep'
    }
  },
  {
    match: /research|analyst|scientist|specialist/i,
    profile: {
      instructions:
        'You are a research specialist. Use the web tools when current external information is required. Clearly separate sourced facts from your own inference, and cite the URL you took something from.',
      capabilities: ['files.read', 'web.search'],
      profile: 'normal'
    }
  },
  {
    match: /review|qa|test|audit/i,
    profile: {
      instructions:
        'You review work. Read what actually changed before judging it, and say plainly what is wrong and what is fine. Do not rewrite; report.',
      capabilities: ['files.read', 'git.read'],
      profile: 'normal'
    }
  }
]

export const GENERAL_PROFILE: RoleProfile = {
  instructions:
    'You investigate before you conclude. Prefer evidence from actual files over inference, and never invent project details.',
  capabilities: ['files.read', 'git.read', 'web.search'],
  profile: 'normal'
}

/**
 * The profile for a role, plus the one capability every teammate needs.
 *
 * `agents.talk` is granted to everybody rather than to whoever's role happens
 * to contain the word "lead". It used to come only from the first profile
 * below, which made a team's ability to collaborate depend on how its theme
 * had worded its job titles: a cast with a "Team Lead" could hand work around
 * and a cast of "Consulting Detective", "Pathologist" and "Strategist" could
 * not, in the same product, on the same day.
 *
 * Granting it is not granting reach. It is only the ability to use the team
 * tools at all; *who* an agent may reach is `canTalkTo`, which still starts
 * empty and is still the user's to draw. And it is not privileged — it spends
 * nothing and changes nothing on its own, which is the bar the default
 * capability set is held to.
 */
export function roleProfile(role: string): RoleProfile {
  const base = ROLE_PROFILES.find((r) => r.match.test(role))?.profile ?? GENERAL_PROFILE
  if (base.capabilities.includes('agents.talk')) return base
  return { ...base, capabilities: [...base.capabilities, 'agents.talk'] }
}
