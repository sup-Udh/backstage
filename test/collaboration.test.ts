import { createProject, setActiveProject, deleteProject } from '../projects/projectStore'
import {
  connectAgents,
  disconnectAgents,
  listAgents,
  seedRoster,
  setSpawned,
  upsertAgent
} from '../agents/agentStore'
import { listGroupChats, renameGroupChat, removeProjectGroups } from '../agents/groupChats'
import { appendToThread, threadFor, postToThread } from '../agents/threads'
import { conversationStore } from '../agents/conversationStore'
import { getWorkspaceRoot } from '../workspace/WorkspaceManager'
import {
  evaluateToolCall,
  getPermissions,
  grantForSession,
  clearSessionGrants,
  updatePermissions,
  listPermissionHistory,
  recordPermission,
  removeProjectPermissions
} from '../agents/permissionStore'
import {
  listTriggers,
  upsertTrigger,
  deleteTrigger,
  markRun,
  removeProjectTriggers,
  forgetAgent
} from '../agents/triggerStore'
import { listRuns, removeProjectRuns } from '../agents/automationRuns'
import { runAutomation, resolveTargets } from '../agents/automationRunner'
import { updateSettings } from '../agents/settingsStore'
import { signInAs } from './stubs/authService'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * End-to-end checks for collaboration, permissions and automations.
 *
 * These run the *real* stores — the same modules the application imports —
 * against a temporary userData directory and a stubbed account. Nothing here
 * is a reimplementation of the logic it checks, which is the point: the
 * questions being asked ("does Project B ever see Project A's group chats?",
 * "can Auto Allow get past a DENY?") are exactly the ones a mock would answer
 * however it was written.
 *
 * What is deliberately not exercised is the provider call at the bottom of an
 * execution. An automation's tasks are submitted for real and fail for real
 * when there is no connected provider, which is itself the interesting path:
 * it is how the run lifecycle gets tested without inventing a fake model.
 */

let failures = 0

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}`)
    console.log(`        expected ${b}`)
    console.log(`        actual   ${a}`)
  }
}

function truthy(name: string, value: unknown): void {
  check(name, Boolean(value), true)
}

/* --------------------------------------------------------------- set-up -- */

function workspaceFolder(label: string): string {
  return mkdtempSync(join(tmpdir(), `backstage-ws-${label}-`))
}

function makeProject(name: string, roster: string[]): string {
  const project = createProject({
    name,
    workspacePath: workspaceFolder(name),
    themeId: 'office',
    characterRoster: roster.map((_, i) => `char-${i}`),
    godAgentId: null
  })
  setActiveProject(project.id)
  seedRoster(
    project.id,
    roster.map((agentName, i) => ({
      characterId: `char-${i}`,
      name: agentName,
      role: 'Agent'
    }))
  )
  // Everyone is in the office. Presence is what makes an agent reachable at
  // all, and every check below depends on it.
  for (const agent of listAgents()) setSpawned(agent.id, true)
  return project.id
}

function idOf(name: string): string {
  const agent = listAgents().find((a) => a.name === name)
  if (!agent) throw new Error(`no agent named ${name} in the open project`)
  return agent.id
}

/* ------------------------------------------------------------- group chat -- */

console.log('group chats')

const projectA = makeProject('Project A', ['Walter', 'Jesse', 'Mike'])
const walter = idOf('Walter')
const jesse = idOf('Jesse')
const mike = idOf('Mike')

check('no connections means no group chats', listGroupChats().length, 0)

{
  /* TEST 1 — connecting two agents produces a group chat, with no other step. */
  const link = connectAgents(walter, jesse)
  truthy('Walter and Jesse can be connected', link.ok)

  const groups = listGroupChats()
  check('one group chat appears', groups.length, 1)
  check('with both members', groups[0]?.memberIds.sort(), [jesse, walter].sort())
  check('named after them', groups[0]?.name, groups[0]?.memberNames.join(' × '))
  check('and two participants', groups[0]?.participants, 2)
  check('nothing has happened in it yet', groups[0]?.status, 'active')
  check('and nothing is unread', groups[0]?.unread, 0)
}

{
  /* TEST 3 — a third agent joins the same group rather than making a second. */
  const link = connectAgents(jesse, mike)
  truthy('Jesse and Mike can be connected', link.ok)

  const groups = listGroupChats()
  check('still exactly one group chat', groups.length, 1)
  check('now with three participants', groups[0]?.participants, 3)
  check(
    'and all three members',
    groups[0]?.memberIds.slice().sort(),
    [walter, jesse, mike].sort()
  )
}

{
  /* Renaming is project-scoped and survives a re-read. */
  const threadId = listGroupChats()[0].id
  renameGroupChat(threadId, 'Landing Page Team')
  check('the group can be renamed', listGroupChats()[0]?.name, 'Landing Page Team')
  check('and is marked as named', listGroupChats()[0]?.customName, true)

  renameGroupChat(threadId, '')
  check(
    'an empty name restores the generated one',
    listGroupChats()[0]?.name,
    listGroupChats()[0]?.memberNames.join(' × ')
  )
  renameGroupChat(threadId, 'Landing Page Team')
}

{
  /* Unread counting: an agent's line counts, the user's own does not. */
  const thread = threadFor(walter)
  truthy('the group has a thread', thread !== null)

  appendToThread(thread!.id, {
    id: 'm1',
    kind: 'agent',
    agentId: jesse,
    fromAgentId: jesse,
    fromName: 'Jesse',
    text: 'Handling the responsive layout.',
    at: Date.now()
  })
  const withMessage = listGroupChats()[0]
  check('an agent message is unread', withMessage?.unread, 1)
  check('and becomes the last message', withMessage?.lastMessage?.fromName, 'Jesse')
  check(
    'a finished group reads as completed',
    withMessage?.status,
    'completed'
  )

  appendToThread(thread!.id, {
    id: 'm2',
    kind: 'user',
    agentId: thread!.id,
    text: 'Thanks.',
    at: Date.now()
  })
  check('the user’s own message is never unread', listGroupChats()[0]?.unread, 1)
}

{
  /* Posting refuses cleanly rather than half-sending. */
  const result = postToThread(walter, '   ')
  check('an empty post is refused', result.accepted, false)

  const stranger = postToThread('agent-that-does-not-exist', 'hello')
  check('posting as an unknown agent is refused', stranger.accepted, false)

  const toOutsider = postToThread(walter, 'hello', 'agent-not-in-this-group')
  check('addressing a non-member is refused', toOutsider.accepted, false)
  check(
    'and says why',
    toOutsider.error,
    'That agent is not in this group.'
  )
}

/* ------------------------------------------------------------ permissions -- */

console.log('\npermissions')

{
  const defaults = getPermissions()
  check('a project starts with Auto Allow off', defaults.autoAllow, false)
  check('reading is allowed', defaults.rules['files.read'], 'allow')
  check('running commands asks', defaults.rules['commands.run'], 'ask')

  /* TEST 6/7 — reading runs; an impactful ALLOW still asks while Auto is off. */
  check(
    'reading a file runs without asking',
    evaluateToolCall('filesystem_read', { path: 'a.ts' }).kind,
    'allow'
  )
  check(
    'writing asks while Auto Allow is off, even though it is allowed',
    evaluateToolCall('filesystem_edit', { path: 'src/a.ts' }).kind,
    'ask'
  )

  updatePermissions({ autoAllow: true })
  check(
    'with Auto Allow on, an allowed write proceeds',
    evaluateToolCall('filesystem_edit', { path: 'src/a.ts' }).kind,
    'allow'
  )
  check(
    'but an ASK category still asks',
    evaluateToolCall('terminal_run', { command: 'npm install' }).kind,
    'ask'
  )

  /* TEST 8 — DENY is absolute, and Auto Allow does not reach it. */
  updatePermissions({ rules: { 'files.delete': 'deny' } })
  const denied = evaluateToolCall('terminal_run', { command: 'rm -rf build' })
  check('a denied category is refused outright', denied.kind, 'deny')
  check('under the right category', denied.category, 'files.delete')

  grantForSession('files.delete')
  check(
    'a session grant cannot override a DENY',
    evaluateToolCall('terminal_run', { command: 'rm -rf build' }).kind,
    'deny'
  )
  clearSessionGrants()

  /* A session grant does cover an ASK. */
  grantForSession('commands.run')
  check(
    'a session grant covers an ASK category',
    evaluateToolCall('terminal_run', { command: './deploy.sh' }).kind,
    'allow'
  )
  check(
    'and a hidden delete on the same line is still refused',
    evaluateToolCall('terminal_run', { command: './deploy.sh && rm -rf build' }).kind,
    'deny'
  )
  clearSessionGrants()

  /* Strict mode tightens and never loosens. */
  updatePermissions({ rules: { 'files.write': 'allow' } })
  check(
    'strict mode asks about a write Auto Allow would have permitted',
    evaluateToolCall('filesystem_edit', { path: 'src/a.ts' }, { strict: true }).kind,
    'ask'
  )
  check(
    'strict mode still lets a read through',
    evaluateToolCall('filesystem_read', { path: 'a.ts' }, { strict: true }).kind,
    'allow'
  )
  check(
    'and cannot revive a denied category',
    evaluateToolCall('terminal_run', { command: 'rm x' }, { strict: true }).kind,
    'deny'
  )

  /* Tightening a rule revokes a session grant that contradicts it. */
  updatePermissions({ rules: { 'packages.install': 'allow' } })
  grantForSession('packages.install')
  updatePermissions({ rules: { 'packages.install': 'ask' } })
  check(
    'tightening a rule drops its session grant',
    evaluateToolCall('terminal_run', { command: 'npm install' }).kind,
    'ask'
  )

  /* History. */
  recordPermission({
    agentId: walter,
    agentName: 'Walter',
    requestedByName: null,
    tool: 'terminal_run',
    category: 'commands.run',
    summary: 'Ran npm test',
    outcome: 'allowed'
  })
  check('the decision is recorded', listPermissionHistory()[0]?.summary, 'Ran npm test')

  updatePermissions({ autoAllow: false, rules: { 'files.delete': 'ask' } })
}

/* ------------------------------------------------------------ automations -- */

console.log('\nautomations')

{
  const trigger = upsertTrigger({
    name: 'Daily review',
    event: 'schedule.daily',
    schedule: { minuteOfDay: 9 * 60, days: [], everyMinutes: 60 },
    action: 'create.task',
    agentIds: [walter],
    message: 'Review the day.'
  })

  check('it belongs to the open project', trigger.projectId, projectA)
  check('agentIds and targetAgentId agree', trigger.targetAgentId, walter)
  truthy('a schedule gets a next run', trigger.nextRunAt !== null)
  truthy('which is in the future', (trigger.nextRunAt ?? 0) > Date.now())

  /* TEST 9 — it persists, scoped to the project. */
  check('it is listed for this project', listTriggers().length, 1)

  const before = trigger.nextRunAt
  markRun(trigger.id, false)
  check(
    'a manual run does not move the schedule',
    listTriggers()[0]?.nextRunAt,
    before
  )
  /*
   * A scheduled run recomputes from the moment it fired, which for a daily
   * automation run at any other hour lands on the same next occurrence — the
   * next 09:00 is the next 09:00 whether or not you pressed anything at 14:00.
   * What must always hold is that it stays in the future, which is what stops
   * the scheduler firing it again on the following tick. The advancing case
   * itself — running *at* the due minute — is checked in schedule.test.ts.
   */
  markRun(trigger.id, true)
  truthy(
    'a scheduled run leaves a future next run',
    (listTriggers()[0]?.nextRunAt ?? 0) > Date.now()
  )
  truthy('and never an earlier one', (listTriggers()[0]?.nextRunAt ?? 0) >= (before ?? 0))

  /* A single-agent automation forms no group: it is not a collaboration. */
  const solo = runAutomation(listTriggers()[0], { origin: 'manual' })
  truthy('a manual run starts', solo.ok)
  const runs = listRuns()
  check('a run record is written immediately', runs.length, 1)
  check('naming the agent', runs[0]?.agentNames, ['Walter'])
  check('with no group conversation', runs[0]?.threadId, null)
  check('and one task', runs[0]?.taskIds.length, 1)

  /* It refuses to stack a second run on top of an unfinished one. */
  const again = runAutomation(listTriggers()[0], { origin: 'manual' })
  check('a second run is refused while the first is going', again.ok, false)
  check('and says why', again.error, 'its previous run has not finished')

  deleteTrigger(trigger.id)
  check('deleting an automation removes it', listTriggers().length, 0)
  check('and its runs', listRuns().length, 0)
}

{
  /* TEST 11 — a multi-agent automation uses the group's conversation. */
  const trigger = upsertTrigger({
    name: 'Team sweep',
    event: 'manual',
    action: 'create.task',
    agentIds: [walter, jesse],
    message: 'Look over the project.'
  })

  const outcome = runAutomation(trigger, { origin: 'manual' })
  truthy('the team run starts', outcome.ok)

  const run = listRuns()[0]
  truthy('it records a group conversation', run?.threadId !== null)
  check(
    'which is the group these two share',
    run?.threadId,
    threadFor(walter)?.id
  )
  check('and names both agents', run?.agentNames.sort(), ['Jesse', 'Walter'])

  /* The group takes the automation's name while it owns it. */
  const group = listGroupChats()[0]
  check('the group is stamped with the automation', group?.automationId, trigger.id)

  /* And the brief is in the conversation, before any reply. */
  const messages = conversationStore.load(
    getWorkspaceRoot() ?? 'no-workspace',
    run!.threadId!
  )
  truthy(
    'the instruction was posted into the group',
    messages.some((m) => m.text === 'Look over the project.')
  )

  deleteTrigger(trigger.id)
  check(
    'deleting the automation releases its claim on the group name',
    listGroupChats()[0]?.automationId,
    null
  )
}

{
  /* An automation cannot reach an agent that is not in the office. */
  setSpawned(mike, false)
  const trigger = upsertTrigger({
    name: 'Unreachable',
    event: 'manual',
    action: 'create.task',
    agentIds: [mike],
    message: 'Anything.'
  })
  const { blocked } = resolveTargets(trigger)
  check('an unspawned agent blocks the run', blocked, 'Mike is not spawned')

  const outcome = runAutomation(trigger, { origin: 'manual' })
  check('and the run is refused', outcome.ok, false)
  check('no run record is written for a refusal', listRuns().length, 0)

  setSpawned(mike, true)
  deleteTrigger(trigger.id)
}

{
  /* Deleting an agent must not leave an automation pointing at a ghost. */
  const shared = upsertTrigger({
    name: 'Pair',
    event: 'manual',
    action: 'create.task',
    agentIds: [walter, mike],
    message: 'Anything.'
  })
  forgetAgent(mike)
  const after = listTriggers().find((t) => t.id === shared.id)
  check('the departed agent is dropped', after?.agentIds, [walter])
  check('and the head is re-derived', after?.targetAgentId, walter)

  const solo = upsertTrigger({
    name: 'Solo',
    event: 'manual',
    action: 'create.task',
    agentIds: [walter],
    message: 'Anything.'
  })
  forgetAgent(walter)
  check(
    'an automation with nobody left is removed entirely',
    listTriggers().some((t) => t.id === solo.id),
    false
  )
  // `forgetAgent` only edits automations; the agents themselves are untouched.
  check('the roster is unaffected', listAgents().length, 3)
  for (const t of listTriggers()) deleteTrigger(t.id)
}

/* ------------------------------------------------------- project isolation -- */

console.log('\nproject isolation')

const projectB = makeProject('Project B', ['Sherlock', 'Watson'])

{
  /* TEST 4 — switching project hides the other project's collaboration. */
  check('Project B starts with no group chats', listGroupChats().length, 0)
  check('and no automations', listTriggers().length, 0)
  check('and no runs', listRuns().length, 0)
  check('and its own roster', listAgents().length, 2)

  /* Permissions are per project too. */
  updatePermissions({ autoAllow: true, rules: { 'commands.run': 'allow' } })
  check(
    'Project B can allow what Project A does not',
    evaluateToolCall('terminal_run', { command: './deploy.sh' }).kind,
    'allow'
  )
  check('and its history is its own', listPermissionHistory().length, 0)
}

{
  /* An automation belonging to another project refuses to run. */
  setActiveProject(projectA)
  const foreign = upsertTrigger({
    name: 'Belongs to A',
    event: 'manual',
    action: 'create.task',
    agentIds: [walter],
    message: 'Anything.'
  })

  setActiveProject(projectB)
  const outcome = runAutomation(foreign, { origin: 'manual' })
  check('a foreign automation is refused', outcome.ok, false)
  check(
    'because it belongs elsewhere',
    outcome.error,
    'it belongs to a different project'
  )
  check('and writes no run into this project', listRuns().length, 0)

  /* Even naming another project's agent resolves to nothing. */
  const smuggled = { ...foreign, projectId: projectB, agentIds: [walter] }
  const { blocked } = resolveTargets(smuggled)
  check(
    'another project’s agent cannot be reached by id',
    blocked,
    'an agent no longer exists'
  )

  setActiveProject(projectA)
  deleteTrigger(foreign.id)
}

{
  /* TEST 5 — returning finds everything where it was left. */
  setActiveProject(projectA)
  const groups = listGroupChats()
  check('Project A’s group chat is still there', groups.length, 1)
  check('with its name', groups[0]?.name, 'Landing Page Team')

  /*
   * And its whole transcript, including the lines written before the project
   * was switched away from. Read from the store rather than from the summary's
   * `lastMessage`, because the automation above has since posted into this
   * same group — which is itself the point: a group conversation accumulates
   * everything that happened in it, from whichever direction.
   */
  const transcript = conversationStore.load(
    getWorkspaceRoot() ?? 'no-workspace',
    groups[0].id
  )
  truthy(
    'and the message sent before the switch',
    transcript.some((m) => m.text === 'Handling the responsive layout.')
  )
  truthy(
    'and the user’s reply',
    transcript.some((m) => m.kind === 'user' && m.text === 'Thanks.')
  )
  check(
    'and Project A’s stricter permissions',
    evaluateToolCall('terminal_run', { command: './deploy.sh' }).kind,
    'ask'
  )
}

{
  /* TEST 14 — another account sees none of it. */
  signInAs('user-b')
  check('a different account has no projects to scope to', listAgents().length, 0)
  check('no group chats', listGroupChats().length, 0)
  check('no automations', listTriggers().length, 0)
  check('and no permission history', listPermissionHistory().length, 0)
  signInAs('user-a')
  setActiveProject(projectA)
  check('and the first account gets its team back', listAgents().length, 3)
}

/* ----------------------------------------------------------- disconnecting -- */

console.log('\ndisconnecting')

{
  disconnectAgents(jesse, mike)
  const groups = listGroupChats()
  check('removing a link leaves the remaining pair', groups.length, 1)
  check('with two members', groups[0]?.participants, 2)

  disconnectAgents(walter, jesse)
  check('removing the last link ends the group chat', listGroupChats().length, 0)
  check('and there is no thread to post into', threadFor(walter), null)
}

/* ------------------------------------------------------------- clean-up -- */

console.log('\nclean-up')

{
  connectAgents(walter, jesse)
  check('a group exists again', listGroupChats().length, 1)

  const removedGroups = removeProjectGroups(projectA)
  truthy('project deletion clears its group records', removedGroups > 0)
  removeProjectTriggers(projectA)
  removeProjectRuns(projectA)
  removeProjectPermissions(projectA)
  check('and its permission history', listPermissionHistory().length, 0)

  // Deleting the project itself is the IPC layer's composition; the stores
  // above are the parts it calls, and each has now been shown to clean up.
  deleteProject(projectB)
  updateSettings({ autoCollaboration: false })
}

console.log()
if (failures === 0) {
  console.log('All collaboration integration checks passed.')
} else {
  console.log(`${failures} check(s) failed.`)
  process.exitCode = 1
}
