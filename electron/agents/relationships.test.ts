import {
  canConnect,
  connectionsOf,
  groupOf,
  threadIdFor,
  MAX_CONNECTIONS,
  MAX_GROUP,
  type Linkable
} from './relationships'

/**
 * Checks for the collaboration rules.
 *
 * These limits are a spend control — every connection is a route work can
 * travel along, and each hop costs money — so "probably enforced" is not
 * enough. The cases here are the ways an unbounded graph could otherwise be
 * built one legal-looking step at a time.
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

function ok(name: string, result: { ok: boolean; error?: string }): void {
  check(name, result.ok, true)
}

function refused(name: string, result: { ok: boolean; error?: string }): void {
  if (result.ok) {
    failures++
    console.log(`  FAIL  ${name}`)
    console.log('        expected a refusal, got ok')
    return
  }
  if (!result.error) {
    failures++
    console.log(`  FAIL  ${name}`)
    console.log('        refused without saying why')
    return
  }
  console.log(`  ok    ${name}  (${result.error})`)
}

/** A roster from a compact description of its links. */
function roster(links: Record<string, string[]>): Linkable[] {
  return Object.entries(links).map(([id, canTalkTo]) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    canTalkTo
  }))
}

/** Apply a link to a roster, mutating it the way the store does. */
function join(list: Linkable[], aId: string, bId: string): void {
  const a = list.find((x) => x.id === aId)!
  const b = list.find((x) => x.id === bId)!
  if (!a.canTalkTo.includes(bId)) a.canTalkTo.push(bId)
  if (!b.canTalkTo.includes(aId)) b.canTalkTo.push(aId)
}

console.log('Relationships')

check('caps are what the product promises', [MAX_CONNECTIONS, MAX_GROUP], [2, 3])

/* ------------------------------------------------------------ basics -- */

{
  const list = roster({ jane: [], lisbon: [], patrick: [], cho: [] })
  ok('two free agents can connect', canConnect(list, 'jane', 'lisbon'))
  refused('an agent cannot connect to itself', canConnect(list, 'jane', 'jane'))
  refused('an unknown agent is refused', canConnect(list, 'jane', 'nobody'))
}

{
  const list = roster({ jane: ['lisbon'], lisbon: ['jane'] })
  ok('re-connecting an existing pair is not an error', canConnect(list, 'jane', 'lisbon'))
  check('connections are mutual', connectionsOf(list, 'jane'), ['lisbon'])
  check('the group is both of them', groupOf(list, 'jane'), ['jane', 'lisbon'])
}

/* -------------------------------------------------------- the degree cap -- */

{
  const list = roster({
    jane: ['lisbon', 'patrick'],
    lisbon: ['jane'],
    patrick: ['jane'],
    cho: []
  })
  check('degree counts both links', connectionsOf(list, 'jane'), ['lisbon', 'patrick'])
  refused('a third connection is refused', canConnect(list, 'jane', 'cho'))
}

/*
 * A one-way link still occupies a slot. Reading only the outbound list would
 * let a roster written by an earlier build quietly exceed the limit.
 */
{
  const list = roster({
    jane: [],
    lisbon: ['jane'],
    patrick: ['jane'],
    cho: []
  })
  check('inbound links count too', connectionsOf(list, 'jane'), ['lisbon', 'patrick'])
  refused('one-way links still fill the cap', canConnect(list, 'jane', 'cho'))
}

/* --------------------------------------------------------- the group cap -- */

/*
 * The case degree alone does not catch: every agent stays within two links
 * and the group grows anyway, one legal-looking step at a time.
 */
{
  const list = roster({ a: [], b: [], c: [], d: [] })
  ok('A–B', canConnect(list, 'a', 'b'))
  join(list, 'a', 'b')

  ok('B–C makes a group of three', canConnect(list, 'b', 'c'))
  join(list, 'b', 'c')
  check('the chain is one group', groupOf(list, 'a'), ['a', 'b', 'c'])

  // C has one link and D has none, so neither is at the degree cap — only the
  // group cap stops this.
  check('nobody is at the degree cap', connectionsOf(list, 'c').length < MAX_CONNECTIONS, true)
  refused('extending the chain to four is refused', canConnect(list, 'c', 'd'))
}

/* Two legal pairs that must not be allowed to merge into four. */
{
  const list = roster({ a: ['b'], b: ['a'], c: ['d'], d: ['c'] })
  refused('two pairs cannot merge into a group of four', canConnect(list, 'b', 'c'))
}

/* A triangle is three agents and within both caps. */
{
  const list = roster({ a: ['b'], b: ['a'], c: [] })
  ok('closing a triangle stays within the caps', canConnect(list, 'a', 'c'))
  join(list, 'a', 'c')
  ok('and the third side too', canConnect(list, 'b', 'c'))
  join(list, 'b', 'c')
  check('the triangle is one group of three', groupOf(list, 'a'), ['a', 'b', 'c'])
  check('everyone is at the degree cap', connectionsOf(list, 'a').length, MAX_CONNECTIONS)
}

/* ------------------------------------------------------------- threads -- */

{
  const list = roster({ a: ['b'], b: ['a', 'c'], c: ['b'] })
  check(
    'thread id does not depend on which member is asked',
    threadIdFor(groupOf(list, 'a')) === threadIdFor(groupOf(list, 'c')),
    true
  )
  check('thread id is stable and sorted', threadIdFor(['c', 'a', 'b']), 'thread:a+b+c')
}

{
  const list = roster({ a: [], b: [] })
  check('an unconnected agent is a group of one', groupOf(list, 'a'), ['a'])
  check('an unknown agent has no group', groupOf(list, 'nobody'), [])
}

/* A dangling link to a deleted agent must not count against the cap. */
{
  const list = roster({ jane: ['ghost', 'lisbon'], lisbon: ['jane'], cho: [] })
  check('links to missing agents are ignored', connectionsOf(list, 'jane'), ['lisbon'])
  ok('and do not consume a slot', canConnect(list, 'jane', 'cho'))
}

console.log()
if (failures === 0) {
  console.log('All relationship checks passed.')
} else {
  console.log(`${failures} check(s) failed.`)
  process.exitCode = 1
}
