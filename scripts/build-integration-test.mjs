import { build } from 'esbuild'

/**
 * Bundle the integration checks with Electron and Supabase stubbed out.
 *
 * The checks import the real stores, so they inherit the real imports —
 * `electron` for a userData path and the keychain, and `authService` for who
 * is signed in. Aliasing those two at bundle time is what lets the actual
 * application code run under `node` instead of being reimplemented for a test.
 *
 * Nothing else is replaced. The agent store, project store, permission store,
 * group chats, trigger store and automation runner are the shipping modules.
 */
const alias = {
  name: 'backstage-test-stubs',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^electron$/ }, () => ({
      path: new URL('../test/stubs/electron.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    }))
    pluginBuild.onResolve({ filter: /supabase[\/]authService$/ }, () => ({
      path: new URL('../test/stubs/authService.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    }))
  }
}

await build({
  entryPoints: ['test/collaboration.test.ts', 'test/activity.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: 'out/test',
  outbase: 'test',
  external: ['@lydell/node-pty', 'chokidar'],
  logLevel: 'error',
  plugins: [alias]
})
