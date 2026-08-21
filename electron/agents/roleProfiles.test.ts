import { roleProfile } from './roleProfiles'
import { mayUseTool } from '../tools/toolCapabilities'
import { detectiveCharacters } from '../../src/themes/detective/characters'
import { officeCharacters } from '../../src/themes/office/characters'
import { friendsCharacters } from '../../src/themes/friends/characters'
import { sherlockCharacters } from '../../src/themes/sherlock/characters'
import { strangerCharacters } from '../../src/themes/stranger/characters'
import { labCharacters } from '../../src/themes/lab/characters'
import type { CharacterDef } from '../../src/characters/character.types'

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

if (failures > 0) {
  console.log(`\n${failures} role profile check(s) failed.`)
  process.exit(1)
}
console.log('\nAll role profile checks passed.')
