import { roleProfile } from './roleProfiles'
import { mayUseTool, TOOL_CAPABILITIES } from '../tools/toolCapabilities'
import { TOOL_NAMES } from '../tools/toolNames'
import { limitsFor } from './limits'
import type { AgentConfig } from './agent.types'
import { detectiveCharacters } from '../../src/themes/detective/characters'
import { officeCharacters } from '../../src/themes/office/characters'
import { friendsCharacters } from '../../src/themes/friends/characters'
import { sherlockCharacters } from '../../src/themes/sherlock/characters'
import { strangerCharacters } from '../../src/themes/stranger/characters'
import { labCharacters } from '../../src/themes/lab/characters'
import type { CharacterDef } from '../../src/characters/character.types'
import { CAPABILITIES } from '../../src/shared/capabilities'
import { themes } from '../../src/themes'

/**
 * Checks that a team cast from any theme can actually work as a team.
 *
 * This exists because of a bug that made the product's headline feature depend
 * on which world the user picked.
 *
 * Talking to ALL AGENTS goes to one agent — the project's team lead, named
 * explicitly by the user as `godAgentId` — who splits the request up and hands
 * the parts out. Delegating requires the `delegate_task` tool, which requires
 * the `agents.talk` capability. That capability was granted by a keyword regex
 * over the agent's *role string*, and every theme writes its own role strings.
 *
 * So "Team Lead" matched and got the tool. "Consulting Detective" did not. A
 * Sherlock project's lead was therefore authorised by the permission check to
 * reach its whole team — `isTeamLead` waves it through — while holding no tool
 * to do it with, and silently answered every whole-team request alone. No
 * delegation, no hand-offs, no collaboration links in the office. The
 * detective office appeared to work only because that project's agents had
 * been edited by hand.
 *
 * Nothing here needs a store, a filesystem or an Electron app, which is why
 * the policy was pulled out of the agent store to sit beside these.
 */

let failures = 0

function ok(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`)
  }
}

/** Every capability there is, for the "nothing withheld" case. */
const CAPS_ALL = CAPABILITIES.map((c) => c.id)

/** The wizard's default team size, mirrored from the setup page. */
const DEFAULT_TEAM_SIZE = 4

/** Each world's own suggestion for who should coordinate. */
const SUGGESTED_LEADER: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(themes).map(([id, theme]) => [id, theme.suggestedLeaderId])
)

const CASTS: [string, CharacterDef[]][] = [
  ['detective', detectiveCharacters],
  ['office', officeCharacters],
  ['friends', friendsCharacters],
  ['sherlock', sherlockCharacters],
  ['stranger', strangerCharacters],
  ['lab', labCharacters]
]

console.log('\nEvery cast can collaborate')

for (const [theme, cast] of CASTS) {
  const mute = cast.filter((c) => !roleProfile(c.role).capabilities.includes('agents.talk'))

  ok(
    `${theme}: every role may use the team tools`,
    mute.length === 0,
    mute.map((c) => `${c.name} (${c.role})`).join(', ')
  )
}

console.log('\nAny character can lead a project')

/**
 * The one that would have caught the original bug on its own.
 *
 * A user may nominate *any* member of the cast as team lead — the setup wizard
 * offers all of them — so every role in every theme has to end up with a
 * working `delegate_task`, whether or not its job title happens to contain the
 * word "lead".
 */
for (const [theme, cast] of CASTS) {
  const cannot = cast.filter(
    (c) => !mayUseTool('delegate_task', roleProfile(c.role).capabilities)
  )

  ok(
    `${theme}: any of the ${cast.length} could be made team lead`,
    cannot.length === 0,
    cannot.map((c) => `${c.name} (${c.role})`).join(', ')
  )
}

console.log('\nThe lead is equipped even without the capability')

/*
 * The belt to the above braces. An agent configured by hand with the team
 * capability switched off must still be able to delegate while it is the
 * project's lead, because the permission check already lets it — and a lead
 * that is permitted to reach its team but has no tool for it is the exact
 * shape of the original failure.
 */
{
  ok(
    'without the capability there is no delegate_task',
    !mayUseTool('delegate_task', ['files.read'])
  )
  ok(
    'the lead grant supplies it',
    mayUseTool('delegate_task', ['files.read'], ['agents.talk'])
  )
  ok(
    'and nothing else comes with it',
    !mayUseTool('terminal_run', ['files.read'], ['agents.talk']) &&
      !mayUseTool('filesystem_edit', ['files.read'], ['agents.talk'])
  )
  ok(
    'an unmapped tool is granted to nobody',
    !mayUseTool('not_a_tool', ['files.read'], ['agents.talk'])
  )
}

console.log('\nRoles still land on sensible permissions')

{
  // The grant must not have quietly become "everyone gets everything".
  const researcher = roleProfile('Research Specialist').capabilities
  ok(
    'a researcher still cannot run shell commands',
    !researcher.includes('terminal.execute'),
    researcher.join(', ')
  )
  const engineer = roleProfile('Lab Technician').capabilities
  ok(
    'an engineer still can',
    engineer.includes('terminal.execute'),
    engineer.join(', ')
  )
  ok(
    'nobody is seeded able to commit',
    CASTS.every(([, cast]) =>
      cast.every((c) => !roleProfile(c.role).capabilities.includes('git.commit'))
    )
  )
}

console.log('\nA team that cannot build says so')


/*
 * The other half of the same class of bug, and the more damaging half.
 *
 * `files.write` and `terminal.execute` are privileged and correctly withheld
 * by default — an agent that can rewrite files the moment it is created is not
 * a default anyone asked for. But a tool an agent lacks is simply absent from
 * its tool list, so the model is never told the capability exists. Asked to
 * build a website, an agent with no `files.write` wrote both files into the
 * chat as text and reported success: nothing created, nothing failed, and no
 * way for the user to find out why.
 *
 * So every seeded agent must be *told* what it cannot do, and told what to ask
 * for. This checks the sentence exists and names the real control.
 */
{
  const seeded = (role: string): AgentConfig =>
    ({ id: 'x', name: 'X', role, capabilities: roleProfile(role).capabilities }) as AgentConfig

  for (const [theme, cast] of CASTS) {
    const silent = cast.filter((c) => {
      const caps = roleProfile(c.role).capabilities
      if (caps.includes('files.write')) return false
      const text = limitsFor(seeded(c.role), false)
      return !text || !text.includes('create, write or edit any file')
    })
    ok(
      `${theme}: an agent that cannot write files is told so`,
      silent.length === 0,
      silent.map((c) => c.name).join(', ')
    )
  }

  const text = limitsFor(seeded('Consulting Detective'), false) ?? ''
  ok('the remedy names the control on the Agents page', text.includes('"Write"'))
  ok('and says where to find it', text.includes('Agents page'))
  ok(
    'and forbids pasting files into the chat instead',
    text.includes('do not paste file contents')
  )

  // A fully-equipped agent gets no block at all: an empty heading is something
  // a model will try to make use of.
  const full = {
    id: 'x',
    name: 'X',
    role: 'X',
    capabilities: CAPS_ALL
  } as AgentConfig
  ok('an agent with everything is told nothing', limitsFor(full, false) === null)

  /*
   * The lead is never told it cannot reach its team, because it can — the
   * capability comes from the nomination rather than the checkbox. An agent
   * the user has explicitly muted still is.
   */
  const muted = {
    id: 'x',
    name: 'X',
    role: 'X',
    capabilities: ['files.read']
  } as AgentConfig
  ok(
    'the team lead is not told it cannot contact anyone',
    !(limitsFor(muted, true) ?? '').includes('contact, message or delegate')
  )
  ok(
    'but an agent the user muted is',
    (limitsFor(muted, false) ?? '').includes('contact, message or delegate')
  )
}

console.log('\nEvery registered tool is reachable by somebody')

/*
 * The exhaustiveness check the mapping's own comment promised.
 *
 * `mayUseTool` fails closed, which is the right direction for the mistake to
 * fail in but a silent one: a tool with no capability recorded is not rejected
 * loudly, it simply never appears in any agent's tool list. `delegate_to_session`
 * shipped that way — registered in `teamTools`, described to the team lead in
 * its own system prompt, and reachable by nobody in any project. The lead was
 * told to hand work to a Claude Code session with a tool it did not have.
 *
 * Registering a tool and forgetting to decide who may use it is now a test
 * failure rather than a feature that quietly does nothing.
 */
{
  const unmapped = TOOL_NAMES.filter((name) => TOOL_CAPABILITIES[name] === undefined)
  ok(
    'every registered tool has a capability',
    unmapped.length === 0,
    unmapped.join(', ')
  )

  const real = new Set<string>(CAPABILITIES.map((c) => c.id))
  const bogus = Object.entries(TOOL_CAPABILITIES).filter(([, cap]) => !real.has(cap))
  ok(
    'and every mapping names a real capability',
    bogus.length === 0,
    bogus.map(([t, c]) => `${t} -> ${c}`).join(', ')
  )

  /*
   * The lead's toolset checked as a set rather than tool by tool: these are
   * exactly the four its coordination prompt tells it it has, and the prompt
   * naming one it does not hold is the bug this file exists for.
   */
  const named = ['delegate_task', 'delegate_to_session', 'agent_message', 'team_status']
  const missing = named.filter((t) => !mayUseTool(t, ['files.read'], ['agents.talk']))
  ok(
    'the team lead holds every tool its prompt names',
    missing.length === 0,
    missing.join(', ')
  )
}

console.log('\nEvery theme can be set up as a working team')

/*
 * The matrix the brief asks for, at the level a plain test can actually
 * assert: for every world Backstage ships, the cast the setup wizard offers
 * must produce a team where the workflow is possible.
 *
 * What "possible" means precisely, and why each line is here:
 *
 *   - The suggested lead is a real member of the cast, or the wizard would
 *     pre-select a coordinator that cannot be chosen.
 *   - That lead can delegate, which is the whole workflow.
 *   - So can every other member, because the user may nominate any of them
 *     and the original bug was exactly this being true for some casts only.
 *   - Every member can read the project and use the team tools, which is the
 *     floor the workflow needs: read to have anything to report, team tools to
 *     report it.
 *
 * Deliberately *not* asserted: that a default cast can write files or run
 * commands. Those are privileged and withheld from every freshly seeded agent
 * on purpose — see `limits.ts` — so a team that cannot yet build is the
 * intended starting state, not a regression. Which roles happen to be seeded
 * with them still varies by how a theme worded its job titles ("Lab
 * Technician" matches the engineer profile, "Technical Investigator" does
 * not), and that variance is safe precisely because it only ever withholds:
 * the user grants what they want on the Agents page, and an agent that lacks a
 * capability is now told so in its own prompt rather than silently working
 * around it.
 *
 * Nothing here is theme-specific. The same four checks run against all six
 * casts, and a new world is covered by adding one line to CASTS.
 */
for (const [theme, cast] of CASTS) {
  const roster = cast.slice(0, DEFAULT_TEAM_SIZE)
  const suggested = SUGGESTED_LEADER[theme]

  ok(
    `${theme}: the suggested lead is in the default cast`,
    roster.some((c) => c.id === suggested),
    `${suggested} not among ${roster.map((c) => c.id).join(', ')}`
  )

  const lead = roster.find((c) => c.id === suggested)
  ok(
    `${theme}: the suggested lead can delegate`,
    lead !== undefined && mayUseTool('delegate_task', roleProfile(lead.role).capabilities)
  )

  const mute = roster.filter(
    (c) => !mayUseTool('delegate_task', roleProfile(c.role).capabilities)
  )
  ok(
    `${theme}: so could any of the others, if nominated instead`,
    mute.length === 0,
    mute.map((c) => c.name).join(', ')
  )

  const floorless = roster.filter((c) => {
    const caps = roleProfile(c.role).capabilities
    return !caps.includes('files.read') || !caps.includes('agents.talk')
  })
  ok(
    `${theme}: every member can read the project and reach the team`,
    floorless.length === 0,
    floorless.map((c) => `${c.name} (${c.role})`).join(', ')
  )
}

if (failures > 0) {
  console.log(`\n${failures} role profile check(s) failed.`)
  process.exit(1)
}
console.log('\nAll role profile checks passed.')
