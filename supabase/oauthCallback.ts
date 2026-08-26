import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { Socket } from 'node:net'
import { supabaseConfig } from './env'

/**
 * The OAuth callback listener.
 *
 * Backstage signs in through a loopback redirect: the system browser is sent
 * to Google, Google returns to Supabase, and Supabase redirects to
 * `http://localhost:<port>/auth/callback`, which is this server. RFC 8252
 * ("OAuth 2.0 for Native Apps") names exactly two acceptable redirect targets
 * for a desktop application — a loopback listener and a private-use URI
 * scheme — and rules out the third thing people reach for, an embedded
 * webview, because a native app rendering Google's password field is
 * indistinguishable from one harvesting it.
 *
 * Loopback was chosen over a `backstage://` scheme because it needs no
 * OS-level registration: `app.setAsDefaultProtocolClient` behaves differently
 * in a packaged build and under `electron-vite dev`, so the scheme that worked
 * in development would be the one that failed after packaging, and the failure
 * is silent. A port either binds or it does not, identically in both.
 *
 * The listener is opened when sign-in starts and closed the moment it has an
 * answer. There is no long-lived local server in Backstage.
 */

/** How long the user has to finish in the browser before the attempt lapses. */
const TIMEOUT_MS = 5 * 60 * 1000

export type CallbackResult =
  | { kind: 'code'; code: string }
  /** Google or Supabase reported a failure, including the user cancelling. */
  | { kind: 'denied'; description: string }
  | { kind: 'timeout' }
  | { kind: 'cancelled' }

/**
 * The two loopback addresses `localhost` can resolve to.
 *
 * Bound explicitly, and separately, rather than letting Node bind every
 * interface — which is what it does when no host is given. That default is
 * wrong here twice over:
 *
 *   - it puts a listener on the machine's real network interfaces, so anything
 *     on the LAN can reach the callback endpoint;
 *   - on Windows it makes the operating system raise a firewall prompt the
 *     first time a user signs in, asking whether Backstage may accept
 *     connections from public and private networks. It does not need to, the
 *     honest answer is no, and a security dialog appearing at the exact moment
 *     the user is deciding whether to trust the app with their Google account
 *     is about the worst possible time for it. Loopback-only listeners are
 *     never filtered, so binding them raises nothing.
 *
 * Both are bound because which one `localhost` resolves to varies by machine —
 * modern Windows prefers `::1`, plenty of Linux setups answer `127.0.0.1` —
 * and picking one would leave sign-in broken on the other half of the world.
 * A machine with IPv6 disabled simply fails to bind `::1`, which is tolerated:
 * one working listener is enough.
 */
const LOOPBACK_HOSTS = ['127.0.0.1', '::1'] as const

interface Pending {
  servers: Server[]
  /** Live sockets, so a close is immediate rather than waiting on keep-alive. */
  sockets: Set<Socket>
  settle: (result: CallbackResult) => void
  timer: NodeJS.Timeout
}

let pending: Pending | null = null

/**
 * Whether a request came from this machine.
 *
 * Belt and braces: the sockets are already bound to loopback addresses only,
 * so nothing off the machine can reach them. This is the second check, so that
 * a future change to the bind addresses cannot silently turn the callback into
 * a network-reachable endpoint.
 */
function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return (
    addr === '::1' || addr === '::ffff:127.0.0.1' || addr.startsWith('127.')
  )
}

/**
 * The page the browser is left on.
 *
 * Self-contained and styled as Backstage, because it is the one part of the
 * flow that renders outside the app — a bare "OK" would read as having landed
 * on a broken page at the exact moment the user is trusting the product with
 * their Google account.
 */
function resultPage(title: string, body: string, accent: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backstage — ${title}</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #fff6e4; color: #1b1b2a;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card {
    max-width: 30rem; margin: 1.5rem; padding: 2rem 2.25rem;
    background: #fffdf5; border: 3px solid #1b1b2a;
    box-shadow: 6px 6px 0 0 ${accent};
  }
  h1 {
    margin: 0 0 .5rem; font-size: 1.35rem; text-transform: uppercase;
    letter-spacing: .04em; font-weight: 800;
  }
  p { margin: 0; line-height: 1.6; color: #4a4a63; font-size: .95rem; }
  .mark { display: block; width: 2.5rem; height: 2.5rem; margin-bottom: 1rem; }
</style>
</head>
<body>
  <main class="card">
    <svg class="mark" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="0" y="1" width="12" height="9" fill="#1b1b2a"/>
      <rect x="1" y="2" width="10" height="7" fill="#ffc94f"/>
      <rect x="2" y="3" width="6" height="1" fill="#1b1b2a"/>
      <rect x="2" y="5" width="4" height="1" fill="#1b1b2a"/>
      <rect x="2" y="7" width="7" height="1" fill="#1b1b2a"/>
      <rect x="5" y="10" width="2" height="1" fill="#1b1b2a"/>
      <rect x="3" y="11" width="6" height="1" fill="#1b1b2a"/>
    </svg>
    <h1>${title}</h1>
    <p>${body}</p>
  </main>
</body>
</html>`
}

/**
 * Open the listener and wait for Supabase to redirect into it.
 *
 * Resolves exactly once, whatever happens: a code, a refusal, the timeout, or
 * `cancelCallback()`. The server is always closed before the promise settles,
 * so a second sign-in can bind the same port immediately.
 */
export function awaitCallback(): Promise<CallbackResult> {
  // A second attempt supersedes the first rather than racing it for the port.
  cancelCallback()

  const { callbackPort } = supabaseConfig()

  return new Promise<CallbackResult>((resolve, reject) => {
    const sockets = new Set<Socket>()
    const servers: Server[] = []

    const handle = (req: IncomingMessage, res: ServerResponse) => {
      if (!isLoopback(req)) {
        res.writeHead(403).end()
        return
      }

      const url = new URL(req.url ?? '/', `http://localhost:${callbackPort}`)

      if (url.pathname !== '/auth/callback') {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
        return
      }

      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const description =
        url.searchParams.get('error_description') ?? error ?? ''

      /*
       * Answer the browser before settling. Closing the server first would
       * cut the connection the user is looking at, and they would be left on
       * a browser error page wondering whether it worked.
       */
      if (code) {
        res
          .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          .end(
            resultPage(
              'Signed in',
              'You can close this tab and return to Backstage. Your team is waiting.',
              '#c97f1c'
            )
          )
        settle({ kind: 'code', code })
        return
      }

      res
        .writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        .end(
          resultPage(
            'Sign-in failed',
            'Backstage could not complete the Google sign-in. Close this tab and try again.',
            '#a8512f'
          )
        )
      settle({ kind: 'denied', description })
    }

    /*
     * Settled once, by whichever of the four outcomes gets here first.
     *
     * The guard is a local flag rather than a check on `pending`, because
     * `pending` may by then belong to a *later* attempt: a second sign-in
     * supersedes the first, and this one deciding it is still the current
     * attempt would tear down the new one's listeners.
     */
    let settled = false
    const settle = (result: CallbackResult) => {
      if (settled) return
      settled = true
      if (pending?.servers === servers) pending = null
      clearTimeout(timer)
      for (const socket of sockets) socket.destroy()
      for (const server of servers) server.close()
      resolve(result)
    }

    const timer = setTimeout(() => settle({ kind: 'timeout' }), TIMEOUT_MS)

    const fail = (err: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      if (pending?.servers === servers) pending = null
      clearTimeout(timer)
      for (const server of servers) server.close()
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(
              `Port ${callbackPort} is already in use, so the Google sign-in ` +
                'callback cannot be received. Close whatever is using it, or ' +
                'set BACKSTAGE_AUTH_PORT and add the new address to the ' +
                'Supabase redirect allow-list.'
            )
          : err
      )
    }

    /*
     * Bind both loopback addresses, and require at least one.
     *
     * `::1` is expected to fail on a machine with IPv6 switched off, and
     * `127.0.0.1` on the vanishingly rare IPv6-only one — neither is an error
     * as long as the other took the port. Only a total failure, or a port
     * genuinely held by something else, gets reported.
     *
     * Nothing settles until a listener is actually up. Resolving on a failed
     * bind would leave the user staring at a browser that is about to redirect
     * somewhere nothing is listening.
     */
    let listening = 0
    let refused = 0
    let firstError: NodeJS.ErrnoException | null = null

    for (const host of LOOPBACK_HOSTS) {
      const server = createServer(handle)
      servers.push(server)

      server.on('connection', (socket) => {
        sockets.add(socket)
        socket.on('close', () => sockets.delete(socket))
      })

      server.on('error', (err: NodeJS.ErrnoException) => {
        refused++
        firstError ??= err
        /*
         * A port held by another process is fatal however many families are
         * left: the browser will be sent to that port, and whatever is there
         * is not Backstage.
         */
        if (err.code === 'EADDRINUSE') fail(err)
        else if (refused === LOOPBACK_HOSTS.length && listening === 0) fail(err)
      })

      server.listen(callbackPort, host, () => {
        listening++
        pending = { servers, sockets, settle, timer }
      })
    }
  })
}

/** Abandon a sign-in that is still waiting, and free the port. */
export function cancelCallback(): void {
  pending?.settle({ kind: 'cancelled' })
}

/** Whether a sign-in round trip is currently open. */
export function callbackIsOpen(): boolean {
  return pending !== null
}
