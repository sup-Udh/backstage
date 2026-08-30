import { createProject, setActiveProject } from '../projects/projectStore'
import { listAgents, seedRoster, setSpawned } from '../agents/agentStore'
import { agentRegistry } from '../agents/AgentRegistry'
import {
  activityFor,
  activityTimeline,
  clearActivity,
  clearAllActivity,
  forgetAgent,
  listActivities,
  removeProjectActivity,
  report,
  reportExternal
} from '../agents/activityStore'
import { systemBus } from '../agents/EventBus'
import type { RuntimeEvent } from '../src/shared/agents'
import { signInAs } from './stubs/authService'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * End-to-end checks for the activity system.
 *
 * These run the real stores — the same `activityStore` and `AgentRegistry` the
 * executor writes to — against a temporary userData directory and a stubbed
 * account. The questions being asked are the ones a mock would answer however
 * it was written: does the runtime state actually carry the activity, does a
 * second project ever see the first one's, and does a finished agent leave a
 * badge behind.
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

function makeProject(name: string, roster: string[]): string {
  const project = createProject({
    name,
    workspacePath: mkdtempSync(join(tmpdir(), `backstage-act-${name}-`)),
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
  for (const agent of listAgents()) setSpawned(agent.id, true)
  return project.id
}

function idOf(name: string): string {
  const agent = listAgents().find((a) => a.name === name)
  if (!agent) throw new Error(`no agent named ${name}`)
  return agent.id
}

const projectA = makeProject('Activity A', ['Walter', 'Jesse'])
const walter = idOf('Walter')
const jesse = idOf('Jesse')

/* ------------------------------------------------------------- reporting -- */

console.log('reporting')
{
  const activity = report(walter, {
    type: 'reading_file',
    detail: 'package.json',
    detailFull: 'package.json',
    toolName: 'filesystem_read',
    filePath: 'package.json'
  })

  check('the activity is stored', activityFor(walter)?.type, 'reading_file')
  check('with its detail', activityFor(walter)?.detail, 'package.json')
  check('and the tool that produced it', activityFor(walter)?.toolName, 'filesystem_read')
  check('stamped with the open project', activity.projectId, projectA)

  /*
   * The property everything else rests on: the runtime state every surface
   * already reads carries the activity, so the world, the roster and the chat
   * header cannot fall behind it or disagree with it.
   */
  const state = agentRegistry.get(walter)
  check('the runtime state carries it', state.activity?.type, 'reading_file')
  check('the status is derived from it', state.status, 'working')
  check(
    'and the prose action too',
    state.action,
    'Reading package.json'
  )
}

console.log('\nindependence')
{
  /*
   * §49/§50: two agents working at once must never overwrite each other. The
   * store is keyed by agent id and has no notion of a current agent, which is
   * what makes this structural rather than careful.
   */
  report(jesse, { type: 'running_command', detail: 'npm test', command: 'npm test' })
  check('Jesse has his own activity', activityFor(jesse)?.type, 'running_command')
  check('and Walter keeps his', activityFor(walter)?.type, 'reading_file')
  check('two are listed', listActivities().length, 2)

  report(walter, { type: 'writing_file', detail: 'App.tsx' })
  check('Walter moves on', activityFor(walter)?.type, 'writing_file')
  check('and Jesse does not', activityFor(jesse)?.type, 'running_command')
}

/* -------------------------------------------------------------- timeline -- */

console.log('\nthe timeline')
{
  clearAllActivity()

  report(walter, { type: 'thinking' })
  report(walter, { type: 'reading_file', detail: 'package.json' })
  report(walter, { type: 'reading_file', detail: 'package.json' })
  report(walter, { type: 'reading_file', detail: 'App.tsx' })
  report(walter, { type: 'testing', detail: 'npm test' })

  const timeline = activityTimeline(20, walter)
  /*
   * Five reports, four lines. Reading the same file twice in a row is one
   * piece of work and one line; reading two different files is two. A feed
   * that printed every report would be a log rather than a story — which is
   * the distinction §28 draws.
   */
  check('a repeat does not make a second line', timeline.length, 4)
  check(
    'and the order is the order it happened',
    timeline.map((e) => e.type),
    ['thinking', 'reading_file', 'reading_file', 'testing']
  )
  check('lines carry the detail', timeline[3].detail, 'npm test')
  check('and the agent’s name', timeline[0].agentName, 'Walter')

  /*
   * A repeat also keeps the original clock, so the elapsed figure in the
   * activity card counts from when the work started rather than resetting on
   * every report.
   */
  const first = report(jesse, { type: 'building', detail: 'npm run build' })
  const again = report(jesse, { type: 'building', detail: 'npm run build' })
  check('a repeat keeps its start time', again.startedAt, first.startedAt)
}

/* ---------------------------------------------------------------- events -- */

console.log('\nevents')
{
  clearAllActivity()

  const seen: RuntimeEvent[] = []
  const off = systemBus.on((e) => {
    if (e.type === 'agent.activity') seen.push(e)
  })

  report(walter, { type: 'searching_code', detail: 'auth' })
  report(walter, { type: 'searching_code', detail: 'auth' })
  report(walter, { type: 'git_operation', detail: 'git status' })
  off()

  check('a change emits', seen.length, 2)
  check('carrying the whole activity', seen[0].agentActivity?.type, 'searching_code')
  check('and naming the agent', seen[0].agentName, 'Walter')
  check('a repeat emits nothing', seen[1].agentActivity?.type, 'git_operation')
}

/* -------------------------------------------------------------- terminal -- */

console.log('\nfinishing')
{
  clearAllActivity()
  report(walter, { type: 'testing', detail: 'npm test' })
  report(walter, { type: 'completed', detail: 'Ran the tests' })

  /*
   * §21: COMPLETE has to be visible before IDLE. The store holds a terminal
   * activity rather than dropping it in the tick that wrote it, so the badge
   * survives the execution ending.
   */
  check('a completed activity stays on screen', activityFor(walter)?.type, 'completed')
  check('and the state agrees', agentRegistry.get(walter).activity?.type, 'completed')

  report(walter, { type: 'error', detail: 'npm test failed', detailFull: 'npm test exited 1' })
  check('an error replaces it', activityFor(walter)?.type, 'error')
  check('with the real reason', activityFor(walter)?.detailFull, 'npm test exited 1')
  check('and an error status', agentRegistry.get(walter).status, 'error')

  clearActivity(walter)
  check('clearing removes the badge', activityFor(walter), null)
  check('and the state stops claiming one', agentRegistry.get(walter).activity, null)
  /*
   * Clearing a badge is not a claim that the agent is fine. The error status
   * was set by the run that failed and stays until something else runs.
   */
  check('but the error status survives', agentRegistry.get(walter).status, 'error')
}

/* -------------------------------------------------------------- external -- */

console.log('\nCLI sessions')
{
  clearAllActivity()

  const sessionId = 'cli-terminal-01'
  reportExternal(sessionId, 'Claude 1', {
    type: 'running_command',
    detail: 'npm test',
    command: 'npm test'
  })

  check('a session gets an activity', activityFor(sessionId)?.type, 'running_command')
  check('and a timeline line under its own name', activityTimeline(10)[0]?.agentName, 'Claude 1')

  /*
   * A session has no roster entry, so it must not mint one. A blank registry
   * state keyed to an id nothing resolves is a ghost agent — created by the
   * very code meant to keep the office honest.
   */
  const before = agentRegistry.list().length
  clearActivity(sessionId)
  check('clearing it creates no roster entry', agentRegistry.list().length, before)
  check('and the roster is still two', agentRegistry.list().length, 2)
}

/* ----------------------------------------------------- project isolation -- */

console.log('\nproject isolation')
{
  clearAllActivity()
  report(walter, { type: 'reading_file', detail: 'package.json' })
  check('project A has one activity', listActivities().length, 1)

  const projectB = makeProject('Activity B', ['Sherlock'])
  check('project B starts empty', listActivities().length, 0)
  check('and has an empty timeline', activityTimeline(20).length, 0)

  const sherlock = idOf('Sherlock')
  report(sherlock, { type: 'testing', detail: 'npm test' })
  check('B sees only its own', listActivities().length, 1)
  check('which is its own agent', listActivities()[0].agentId, sherlock)

  setActiveProject(projectA)
  check('and A still has its own', listActivities().length, 1)
  check('unchanged', listActivities()[0].agentId, walter)

  /*
   * §42: switching project must empty the office rather than carry one
   * project's work above another's characters.
   */
  removeProjectActivity(projectA)
  check('dropping a project clears its activity', listActivities().length, 0)
  check('and its timeline', activityTimeline(20).length, 0)

  setActiveProject(projectB)
  check('while the other project keeps its own', listActivities().length, 1)
  setActiveProject(projectA)
}

/* -------------------------------------------------------------- clean-up -- */

console.log('\nclean-up')
{
  clearAllActivity()
  report(walter, { type: 'reading_file', detail: 'a.ts' })
  report(jesse, { type: 'writing_file', detail: 'b.ts' })

  forgetAgent(walter)
  check('a deleted agent leaves no activity', activityFor(walter), null)
  check('nor a line in the timeline', activityTimeline(20, walter).length, 0)
  check('and the others are untouched', activityFor(jesse)?.type, 'writing_file')

  /*
   * §43, and the one that matters on sign-out: nothing may survive into
   * somebody else's session.
   */
  signInAs('user-b')
  check('another account sees no activity', listActivities().length, 0)
  signInAs('user-a')
  setActiveProject(projectA)
  truthy('and the first account still has its own', listActivities().length > 0)

  clearAllActivity()
  check('clearing everything empties it', listActivities().length, 0)
  check('and the timeline', activityTimeline(50).length, 0)
}

console.log()
if (failures === 0) {
  console.log('All activity integration checks passed.')
} else {
  console.log(`${failures} check(s) failed.`)
  process.exitCode = 1
}
