import { resolve } from 'node:path'
import type { Project } from '../src/shared/projects'
import {
  nameFromPath,
  normaliseProject,
  ownedBy,
  reseatSlots,
  resolveActiveId
} from './projectRules'

/**
 * Checks for the project rules.
 *
 * These decide whether a stored project survives being read and which one the
 * app opens into. Both are failures the user sees instantly and cannot debug:
 * a dropped record is a team that has vanished, and a mis-resolved active id
 * opens the app onto somebody else's workspace — or onto none, with every file
 * tool silently refusing.
 *
 * `reseatSlots` is here because migration only ever runs once per install. A
 * bug in it is not something a user hits twice, reports and gets fixed; it is
 * something that quietly re-casts their whole team the one time it matters.
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

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    userId: 'user-1',
    name: 'e-app',
    workspacePath: resolve('/code/e-app'),
    themeId: 'detective',
    characterRoster: ['jane', 'lisbon'],
    godAgentId: null,
    createdAt: 1,
    updatedAt: 1,
    ...over
  }
}

/* ------------------------------------------------------------ normalise -- */

console.log('\nnormaliseProject')

check('a well-formed record survives', normaliseProject(project()), project())

check('a record with no id is dropped', normaliseProject({ ...project(), id: '' }), null)
check(
  'a record with no workspace path is dropped',
  normaliseProject({ ...project(), workspacePath: '   ' }),
  null
)
check('a non-object is dropped', normaliseProject('e-app'), null)
check('null is dropped', normaliseProject(null), null)

check(
  'a missing name falls back to the folder',
  normaliseProject({ id: 'p1', workspacePath: resolve('/code/e-app'), createdAt: 1, updatedAt: 1 })
    ?.name,
  'e-app'
)

check(
  'a missing theme falls back to the default rather than dropping the project',
  normaliseProject({ id: 'p1', workspacePath: resolve('/code/e-app') })?.themeId,
  'detective'
)

check(
  'a roster with non-strings in it keeps only the ids',
  normaliseProject({
    id: 'p1',
    workspacePath: resolve('/code/e-app'),
    characterRoster: ['jane', 7, null, 'cho']
  })?.characterRoster,
  ['jane', 'cho']
)

check(
  'an empty god agent id reads as none rather than as an agent called ""',
  normaliseProject({ id: 'p1', workspacePath: resolve('/code/e-app'), godAgentId: '' })
    ?.godAgentId,
  null
)

check(
  'a relative path is resolved, so two records cannot describe one folder differently',
  normaliseProject({ id: 'p1', workspacePath: './e-app' })?.workspacePath,
  resolve('./e-app')
)

/*
 * Ownership. A project written before accounts existed has no owner, and the
 * normaliser must never invent one: reading a record is not the moment to
 * decide whose it is, and guessing would hand one user's team to whoever next
 * opens the app on a shared machine.
 */
check(
  'a stored owner survives',
  normaliseProject({ id: 'p1', workspacePath: resolve('/code/e-app'), userId: 'abc' })
    ?.userId,
  'abc'
)

check(
  'a record with no owner reads as unowned rather than being dropped',
  normaliseProject({ id: 'p1', workspacePath: resolve('/code/e-app') })?.userId,
  ''
)

check(
  'a non-string owner is refused rather than coerced',
  normaliseProject({ id: 'p1', workspacePath: resolve('/code/e-app'), userId: 42 })
    ?.userId,
  ''
)

/* --------------------------------------------------------------- owners -- */

/*
 * User isolation, tested at the one function that decides it.
 *
 * Everything in Backstage is reached through a project: the roster, the cases,
 * the automations, the threads and the transcripts are all filtered by which
 * project is open, and which projects exist is filtered by this. So these
 * checks are not about a list comprehension — they are the difference between
 * two people sharing a machine having separate work and not.
 *
 * The empty-string cases matter most. "Signed out" and "owned by nobody" are
 * both the empty string, and an equality check that did not special-case it
 * would make them match — showing every pre-account project to anyone who was
 * not signed in at all.
 */

console.log('\nownedBy')

const mine = project({ id: 'p1', userId: 'user-a' })
const theirs = project({ id: 'p2', userId: 'user-b' })
const unclaimed = project({ id: 'p3', userId: '' })
const registry = [mine, theirs, unclaimed]

check(
  'an account sees its own projects',
  ownedBy(registry, 'user-a').map((p) => p.id),
  ['p1']
)

check(
  "and never another account's",
  ownedBy(registry, 'user-b').map((p) => p.id),
  ['p2']
)

check(
  'an account with nothing sees nothing rather than everything',
  ownedBy(registry, 'user-c'),
  []
)

check('signed out sees nothing at all', ownedBy(registry, ''), [])

check(
  'and in particular does not inherit the unowned project',
  ownedBy(registry, '').some((p) => p.id === 'p3'),
  false
)

check(
  'an unowned project belongs to nobody, not to everybody',
  ownedBy(registry, 'user-a').some((p) => p.id === 'p3'),
  false
)

check('an empty registry is empty for a real account too', ownedBy([], 'user-a'), [])

/* ------------------------------------------------------------ the name -- */

console.log('\nnameFromPath')

check('a plain folder', nameFromPath(resolve('/code/e-app')), 'e-app')
check('a trailing separator is ignored', nameFromPath('/code/e-app/'), 'e-app')
check('a path that is only separators falls back to itself', nameFromPath('/'), '/')

/* ------------------------------------------------------- the active id -- */

console.log('\nresolveActiveId')

const a = project({ id: 'a' })
const b = project({ id: 'b' })

check('a stored id that exists is honoured', resolveActiveId([a, b], 'b'), 'b')
check(
  'a stored id that no longer exists falls back to the first project',
  resolveActiveId([a, b], 'gone'),
  'a'
)
check('no stored id falls back to the first project', resolveActiveId([a, b], null), 'a')
check('no projects means nothing is open', resolveActiveId([], 'a'), null)

/* ---------------------------------------------------------- re-seating -- */

console.log('\nreseatSlots')

check(
  'a team smaller than the roster fills it from the front',
  reseatSlots(3, 5, [0, 1, 2]),
  [0, 1, 2]
)
check(
  'old slots are discarded, so a scattered team is re-seated in order',
  reseatSlots(3, 5, [7, 2, 4]),
  [0, 1, 2]
)
check(
  'a team larger than the roster wraps only past the end',
  reseatSlots(5, 3, [0, 1, 2, 3, 4]),
  [0, 1, 2, 0, 1]
)
check(
  'nobody is cast twice while a free character remains',
  new Set(reseatSlots(4, 4, [3, 3, 3, 3])).size,
  4
)
check('an empty roster never divides by zero', reseatSlots(2, 0, [5, 6]), [0, 0])
check('an empty team is empty', reseatSlots(0, 3, []), [])

/* ------------------------------------------------------------------ -- */

if (failures > 0) {
  console.log(`\n${failures} project rule check(s) failed.`)
  process.exit(1)
}
console.log('\nAll project rule checks passed.')
