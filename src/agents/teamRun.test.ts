import { latestTeamRun, phaseLabel, type RunInput } from './teamRun'
import type {
  AgentConfig,
  AgentRuntimeState,
  AgentTask,
  ChatMessage
} from '../shared/providerApi'

/**
 * Checks on the model behind the ALL AGENTS view.
 *
 * This is the piece that decides what the user is shown about a team request,
 * so it has to be right for every theme and every leader — which is exactly
 * what makes it worth testing without a store, a provider or a world. The
 * fixtures below are deliberately named from two different casts: nothing here
 * may behave differently because the lead is called Jane rather than Michael.
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

const T0 = 1_700_000_000_000

function agent(id: string, name: string, role: string): AgentConfig {
  return { id, name, role } as AgentConfig
}

function task(over: Partial<AgentTask> & { id: string; agentId: string }): AgentTask {
  return {
    projectId: 'p1',
    caseId: 'case1',
    prompt: 'Analyse this project.',
    title: 'Analyse this project.',
    status: 'completed',
    origin: 'agent',
    originAgentId: null,
    correlationId: 'chain1',
    depth: 1,
    parentTaskId: 'root',
    executionId: null,
    createdAt: T0,
    startedAt: T0,
    endedAt: T0 + 1000,
    result: null,
    error: null,
    ...over
  } as AgentTask
}

/** A whole run, parameterised by cast so the same shape is checked twice. */
function scenario(cast: { lead: string; workers: string[] }): RunInput {
  const ids = ['a_lead', 'a_w1', 'a_w2']
  const names: Record<string, string> = {
    a_lead: cast.lead,
    a_w1: cast.workers[0],
    a_w2: cast.workers[1]
  }

  const tasks: AgentTask[] = [
    task({
      id: 'root',
      agentId: 'a_lead',
      depth: 0,
      origin: 'user',
      parentTaskId: null,
      status: 'completed',
      prompt: 'Analyse this project and find the biggest issues.',
      title: 'Analyse this project'
    }),
    task({
      id: 't1',
      agentId: 'a_w1',
      title: 'Investigate the layout system',
      result: 'The layout system recalculates twice per frame.',
      createdAt: T0 + 100,
      startedAt: T0 + 200,
      endedAt: T0 + 3000
    }),
    task({
      id: 't2',
      agentId: 'a_w2',
      title: 'Review the agent runtime',
      result: 'The runtime is fine.',
      createdAt: T0 + 110,
      startedAt: T0 + 210,
      endedAt: T0 + 4000
    }),
    task({
      id: 'synth',
      agentId: 'a_lead',
      depth: 0,
      origin: 'user',
      parentTaskId: null,
      correlationId: 'chain2',
      part: 'synthesis',
      title: 'Answer: Analyse this project',
      createdAt: T0 + 5000,
      startedAt: T0 + 5100,
      endedAt: T0 + 6000,
      result: 'Two issues found.'
    })
  ]

  const messages: Record<string, ChatMessage[]> = {
    a_lead: [
      {
        id: 'm1',
        kind: 'agent',
        agentId: 'a_lead',
        text: 'Two issues found.',
        at: T0 + 6000,
        taskId: 'synth',
        part: 'synthesis'
      }
    ]
  }

  return {
    tasks,
    agents: ids.map((id) => agent(id, names[id], 'Role')),
    states: {} as Record<string, AgentRuntimeState>,
    messages,
    leadId: 'a_lead',
    nameOf: (id) => names[id] ?? id,
    modelOf: () => 'OpenAI · gpt-5-mini'
  }
}

console.log('\nA finished team run is reconstructed')

{
  const run = latestTeamRun(scenario({ lead: 'Jane', workers: ['Lisbon', 'Cho'] }))!

  ok('there is a run', run !== null)
  ok('the lead is the configured one', run.leadId === 'a_lead' && run.leadName === 'Jane')
  ok('the request is the user’s own words', run.request.startsWith('Analyse this project'))
  ok('everyone who took part is a member', run.members.length === 3)
  ok('and only the lead is marked as lead', run.members.filter((m) => m.isLead).length === 1)
  ok('both delegated tasks became findings', run.findings.length === 2)
  ok(
    'a finding carries the assignment and the answer',
    run.findings[0].assignment === 'Investigate the layout system' &&
      run.findings[0].result === 'The layout system recalculates twice per frame.'
  )
  ok('the synthesis is found', run.synthesis?.text === 'Two issues found.')
  ok('the run is not running', !run.running)
  ok('and did not fail', !run.failed)
}

console.log('\nThe same run with a different cast is structurally identical')

{
  const a = latestTeamRun(scenario({ lead: 'Jane', workers: ['Lisbon', 'Cho'] }))!
  const b = latestTeamRun(scenario({ lead: 'Michael', workers: ['Pam', 'Jim'] }))!

  const shape = (r: typeof a) => ({
    members: r.members.map((m) => ({ lead: m.isLead, phase: m.phase })),
    findings: r.findings.map((f) => ({ status: f.status, assignment: f.assignment })),
    synthesis: r.synthesis !== null,
    running: r.running,
    timeline: r.timeline.map((e) => e.kind)
  })

  ok(
    'only the names differ',
    JSON.stringify(shape(a)) === JSON.stringify(shape(b)),
    `${JSON.stringify(shape(a))} vs ${JSON.stringify(shape(b))}`
  )
  ok('and the names really did differ', a.leadName === 'Jane' && b.leadName === 'Michael')
}

console.log('\nA run in progress')

{
  const input = scenario({ lead: 'Holmes', workers: ['Watson', 'Lestrade'] })
  // The lead is still working, one worker is running, one is queued, no synthesis.
  input.tasks = input.tasks
    .filter((t) => t.part !== 'synthesis')
    .map((t) =>
      t.id === 'root'
        ? { ...t, status: 'running' as const, endedAt: null }
        : t.id === 't1'
          ? { ...t, status: 'running' as const, endedAt: null, result: null }
          : { ...t, status: 'queued' as const, startedAt: null, endedAt: null, result: null }
    )
  input.states = {
    a_w1: { action: 'Reading src/layout.ts' } as AgentRuntimeState
  } as Record<string, AgentRuntimeState>

  const run = latestTeamRun(input)!

  ok('the run is running', run.running)
  ok('there is no synthesis yet', run.synthesis === null)
  ok('nothing has finished, so there are no findings', run.findings.length === 0)

  const lead = run.members.find((m) => m.isLead)!
  const w1 = run.members.find((m) => m.agentId === 'a_w1')!
  const w2 = run.members.find((m) => m.agentId === 'a_w2')!

  ok('the lead is working', lead.phase === 'working')
  ok('and reads as delegating, having handed work out', phaseLabel(lead) === 'delegating')
  ok('the running worker is working', w1.phase === 'working')
  ok('with its real action, not a guess', w1.action === 'Reading src/layout.ts')
  ok('the queued worker is waiting', w2.phase === 'waiting' && phaseLabel(w2) === 'waiting')
  ok('a waiting agent has no action', w2.action === null)
}

console.log('\nOne worker failing does not sink the run')

{
  const input = scenario({ lead: 'Eleven', workers: ['Dustin', 'Nancy'] })
  input.tasks = input.tasks.map((t) =>
    t.id === 't2' ? { ...t, status: 'failed' as const, result: null, error: 'Provider timed out' } : t
  )

  const run = latestTeamRun(input)!

  ok('the run still completed', !run.running && !run.failed)
  ok('the synthesis still exists', run.synthesis !== null)
  ok('both workers still appear', run.findings.length === 2)

  const bad = run.findings.find((f) => f.status === 'failed')!
  const good = run.findings.find((f) => f.status === 'completed')!
  ok('the failure is reported as one', bad.error === 'Provider timed out')
  ok('and carries no invented result', bad.result === null)
  ok('the successful finding is untouched', good.result === 'The layout system recalculates twice per frame.')

  const member = run.members.find((m) => m.agentId === 'a_w2')!
  ok('the failed worker reads as failed', member.phase === 'failed' && phaseLabel(member) === 'failed')
}

console.log('\nWhat is not a team run')

{
  const input = scenario({ lead: 'Walter', workers: ['Jesse', 'Gus'] })

  // A one-to-one request to a worker is depth 0 and origin user, but it is not
  // addressed to the lead — treating it as a team run would drag a private
  // conversation into the team view.
  input.tasks = [
    task({
      id: 'solo',
      agentId: 'a_w1',
      depth: 0,
      origin: 'user',
      parentTaskId: null,
      correlationId: 'chain9',
      title: 'Just asking Jesse'
    })
  ]
  ok('a one-to-one request is not a team run', latestTeamRun(input) === null)

  ok('no tasks at all is not a team run', latestTeamRun({ ...input, tasks: [] }) === null)
}

{
  /*
   * The case that matters now ALL AGENTS broadcasts again.
   *
   * A broadcast gives every agent its own depth-0 task under one shared
   * correlation id. Nobody handed anybody anything, so matching on the chain
   * alone would present three independent answers as three delegations from
   * whoever happened to be first — a claim about what happened, and a false
   * one. `parentTaskId` is what separates the two.
   */
  const broadcast = scenario({ lead: 'Jane', workers: ['Lisbon', 'Cho'] })
  broadcast.tasks = ['a_lead', 'a_w1', 'a_w2'].map((agentId, i) =>
    task({
      id: `b${i}`,
      agentId,
      depth: 0,
      origin: 'user',
      parentTaskId: null,
      correlationId: 'broadcast1',
      title: 'Analyse this project',
      createdAt: T0 + i
    })
  )

  ok('a broadcast to three agents is not a team run', latestTeamRun(broadcast) === null)

  // But one of them delegating during it still is.
  broadcast.tasks = [
    ...broadcast.tasks,
    task({
      id: 'handoff',
      agentId: 'a_w2',
      depth: 1,
      origin: 'agent',
      parentTaskId: 'b0',
      correlationId: 'broadcast1',
      title: 'Check the theme configuration',
      result: 'Checked.'
    })
  ]
  const run = latestTeamRun(broadcast)
  ok('a real hand-off during one still is', run !== null)
  ok('and only the handed-off task counts as delegated', run?.findings.length === 1)
}

console.log('\nTwo runs never mix')

{
  const input = scenario({ lead: 'Rachel', workers: ['Ross', 'Monica'] })
  // An older, unrelated team request with its own chain and its own worker.
  input.tasks = [
    ...input.tasks,
    task({
      id: 'old-root',
      agentId: 'a_lead',
      depth: 0,
      origin: 'user',
      parentTaskId: null,
      correlationId: 'chain0',
      caseId: 'case0',
      title: 'An older question',
      createdAt: T0 - 50_000,
      startedAt: T0 - 50_000,
      endedAt: T0 - 49_000
    }),
    task({
      id: 'old-child',
      agentId: 'a_w2',
      correlationId: 'chain0',
      caseId: 'case0',
      parentTaskId: 'old-root',
      title: 'Old work',
      createdAt: T0 - 49_000
    })
  ]

  const run = latestTeamRun(input)!
  ok('the newest run is the one shown', run.correlationId === 'chain1')
  ok(
    'the older run’s work is not in it',
    run.findings.every((f) => f.assignment !== 'Old work'),
    run.findings.map((f) => f.assignment).join(', ')
  )
  ok('and its own two findings are', run.findings.length === 2)
}

console.log('\nThe timeline')

{
  const run = latestTeamRun(scenario({ lead: 'Jane', workers: ['Lisbon', 'Cho'] }))!
  const kinds = run.timeline.map((e) => e.kind)

  ok('it opens with the request arriving', kinds[0] === 'received')
  ok('it ends with the team finishing', kinds[kinds.length - 1] === 'finished')
  ok('it records both delegations', kinds.filter((k) => k === 'delegated').length === 2)
  ok('it records the synthesis', kinds.includes('synthesising'))
  ok(
    'and it is in chronological order',
    run.timeline.every((e, i) => i === 0 || run.timeline[i - 1].at <= e.at)
  )
  ok('every entry has a distinct key', new Set(run.timeline.map((e) => e.id)).size === run.timeline.length)
}

if (failures > 0) {
  console.log(`\n${failures} team run check(s) failed.`)
  process.exit(1)
}
console.log('\nAll team run checks passed.')
