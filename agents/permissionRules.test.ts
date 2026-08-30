import {
  categoriseCommand,
  categoriseCommandLine,
  categoriseToolCall,
  defaultRules,
  isConfigPath,
  isImpactful,
  splitCommands,
  PERMISSION_CATEGORIES
} from './permissionRules'

/**
 * Checks for the permission classifier.
 *
 * This decides what a user is asked about before an agent touches their
 * machine, so "probably right" is not good enough. The cases below are the
 * ways a dangerous command could otherwise slip through as a harmless one:
 * hidden behind a `sudo`, behind an environment assignment, behind a `&&`,
 * or behind a tool whose name sounds safer than its arguments.
 *
 * Every unrecognised case must land on a category that asks. There is one
 * check for that at the end and it is the most important one here.
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

/* ------------------------------------------------------------ the table -- */

console.log('categories')
{
  const rules = defaultRules()
  check('every category has a default', Object.keys(rules).length, PERMISSION_CATEGORIES.length)
  check('reading is allowed by default', rules['files.read'], 'allow')
  check('writing is allowed by default', rules['files.write'], 'allow')
  check('deleting asks by default', rules['files.delete'], 'ask')
  check('running commands asks by default', rules['commands.run'], 'ask')
  check('installing asks by default', rules['packages.install'], 'ask')
  check('git changes ask by default', rules['git.ops'], 'ask')

  check('reading is not impactful', isImpactful('files.read'), false)
  check('deleting is impactful', isImpactful('files.delete'), true)
  /*
   * The defence against a category being added without an impact decision:
   * an unknown one is treated as impactful, so Auto Allow will not cover it.
   */
  check(
    'an unknown category is treated as impactful',
    isImpactful('files.nonexistent' as never),
    true
  )
}

/* ------------------------------------------------------- command splitting -- */

console.log('\ncommand splitting')
{
  check('a plain command is one command', splitCommands('npm test'), ['npm test'])
  check('&& splits', splitCommands('npm run build && rm -rf dist'), [
    'npm run build',
    'rm -rf dist'
  ])
  check('; splits', splitCommands('ls; rm x'), ['ls', 'rm x'])
  check('| splits', splitCommands('cat a | grep b'), ['cat a', 'grep b'])
  check(
    'a separator inside quotes does not split',
    splitCommands('echo "a && b"'),
    ['echo "a && b"']
  )
}

/* --------------------------------------------------------- classification -- */

console.log('\ncommands')
{
  check('ls reads', categoriseCommand('ls -la'), 'files.read')
  check('cat reads', categoriseCommand('cat package.json'), 'files.read')
  check('rm deletes', categoriseCommand('rm -rf build'), 'files.delete')
  check('del deletes', categoriseCommand('del out.txt'), 'files.delete')
  check('Remove-Item deletes', categoriseCommand('Remove-Item -Recurse dist'), 'files.delete')
  check('git clean deletes', categoriseCommand('git clean -fd'), 'files.delete')

  check('npm install installs', categoriseCommand('npm install'), 'packages.install')
  check('npm i installs', categoriseCommand('npm i react'), 'packages.install')
  check('pip install installs', categoriseCommand('pip install requests'), 'packages.install')
  check('cargo add installs', categoriseCommand('cargo add serde'), 'packages.install')
  /*
   * Uninstalling is a dependency decision, not a file deletion. Classifying it
   * as a delete would put it under a rule the user set for their own files.
   */
  check('npm uninstall is a dependency change', categoriseCommand('npm uninstall lodash'), 'packages.install')

  check('npm run dev starts a service', categoriseCommand('npm run dev'), 'services.start')
  check('docker compose starts a service', categoriseCommand('docker compose up'), 'services.start')
  check('vite dev starts a service', categoriseCommand('vite dev'), 'services.start')

  check('curl is network', categoriseCommand('curl https://example.com'), 'network')

  check('git status reads', categoriseCommand('git status'), 'files.read')
  check('git log reads', categoriseCommand('git log --oneline'), 'files.read')
  check('git commit changes git', categoriseCommand('git commit -m x'), 'git.ops')
  check('git reset changes git', categoriseCommand('git reset --hard'), 'git.ops')
  /*
   * `checkout` looks like navigation and can discard a file. Anything not on
   * the read-only list is a change — that is the direction this has to fail in.
   */
  check('git checkout changes git', categoriseCommand('git checkout -- src'), 'git.ops')

  check('npm test is an ordinary command', categoriseCommand('npm test'), 'commands.run')
  check('an unknown binary is an ordinary command', categoriseCommand('./deploy.sh'), 'commands.run')

  check('a redirection writes', categoriseCommand('echo hi > notes.txt'), 'files.write')
}

console.log('\nhidden verbs')
{
  check('sudo does not hide a delete', categoriseCommand('sudo rm -rf /tmp/x'), 'files.delete')
  check(
    'an env assignment does not hide an install',
    categoriseCommand('CI=1 npm install'),
    'packages.install'
  )
  check(
    'both together do not hide it',
    categoriseCommand('sudo CI=1 npm install'),
    'packages.install'
  )
}

console.log('\nwhole command lines')
{
  /*
   * The case this exists for: a build followed by a delete. Classifying only
   * the first command is exactly how a delete gets through an approval the
   * user gave for something else.
   */
  check(
    'the strictest command on the line wins',
    categoriseCommandLine('npm run build && rm -rf dist'),
    'files.delete'
  )
  check(
    'a read followed by an install is an install',
    categoriseCommandLine('cat package.json && npm install'),
    'packages.install'
  )
  check('a line of reads is a read', categoriseCommandLine('ls && pwd'), 'files.read')
  check('an empty line still asks', categoriseCommandLine('   '), 'commands.run')
}

/* ------------------------------------------------------------------ paths -- */

console.log('\nconfiguration paths')
{
  check('package.json is config', isConfigPath('package.json'), true)
  check('a nested package.json is config', isConfigPath('apps/web/package.json'), true)
  check('a windows path is config', isConfigPath('apps\\web\\tsconfig.json'), true)
  check('.env is config', isConfigPath('.env'), true)
  check('.env.local is config', isConfigPath('.env.local'), true)
  check('a workflow is config', isConfigPath('.github/workflows/ci.yml'), true)
  check('a vite config is config', isConfigPath('vite.config.ts'), true)
  check('an ordinary source file is not', isConfigPath('src/App.tsx'), false)
  check('an empty path is not', isConfigPath(''), false)
}

/* ------------------------------------------------------------------ tools -- */

console.log('\ntools')
{
  check('reading a file reads', categoriseToolCall('filesystem_read', { path: 'a.ts' }), 'files.read')
  check(
    'editing a source file writes',
    categoriseToolCall('filesystem_edit', { path: 'src/App.tsx' }),
    'files.write'
  )
  check(
    'editing package.json is a configuration change',
    categoriseToolCall('filesystem_edit', { path: 'package.json' }),
    'config.modify'
  )
  check(
    'creating .env is a configuration change',
    categoriseToolCall('filesystem_create', { path: '.env' }),
    'config.modify'
  )
  check('committing changes git', categoriseToolCall('git_commit', {}), 'git.ops')
  check('web search is network', categoriseToolCall('web_search', {}), 'network')

  check(
    'terminal_run is classified from its command',
    categoriseToolCall('terminal_run', { command: 'npm install' }),
    'packages.install'
  )
  check(
    'terminal_run with no command still asks',
    categoriseToolCall('terminal_run', {}),
    'commands.run'
  )

  check('team tools are not gated', categoriseToolCall('delegate_task', {}), null)
  check('messaging a teammate is not gated', categoriseToolCall('agent_message', {}), null)

  /*
   * The most important check here. A tool added without a line in the mapping
   * must fall to a category that asks, never to one that runs silently.
   */
  check(
    'an unknown tool falls to a category that asks',
    categoriseToolCall('some_future_tool', {}),
    'commands.run'
  )
  check(
    'and that category does ask by default',
    defaultRules()['commands.run'],
    'ask'
  )
}

console.log()
if (failures === 0) {
  console.log('All permission checks passed.')
} else {
  console.log(`${failures} check(s) failed.`)
  process.exitCode = 1
}
