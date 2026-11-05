import http from 'node:http'
import https from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { credentialFiles, credentialsRoot, loadServers, saveServers, saveToken } from './vite_server_config'
import type { ConfigDirs, StoredServer } from './vite_server_config'
import { ServerTunnels } from './vite_server_tunnels'
import type { TunnelStatus } from './vite_server_tunnels'
import { DEFAULT_SERVER_ID } from './src/types/server_types'
import type { ServerEdit, ServerEntry, ServerList, ServerTunnel } from './src/types/server_types'

/**
 * The dev server as the viewer's one way out: every API request passes here, whichever server it is
 * meant for, and the token is attached here so that the browser never receives one. A value a browser
 * transmits is a value its user possesses.
 *
 *   /api/v1/…               the default server
 *   /server/<id>/api/v1/…   any other of the list
 *   /__viewer/servers       the list itself, without a token in it
 *
 * Written by hand rather than with Vite's own `server.proxy`: its target is fixed when the dev server
 * starts, and it answers a refused connection as a 500, which reads as a fault of the backend.
 */

const ADMIN_PATH = '/__viewer/servers'
const MAX_BODY_BYTES = 64 * 1024

/** What leaves this process. Built field by field, so a field added to the store stays in here. */
export function entryOf(server: StoredServer, tunnel: TunnelStatus = { state: 'none', message: null }): ServerEntry {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    isDefault: server.id === DEFAULT_SERVER_ID,
    hasToken: server.token !== '',
    tunnel: server.tunnel,
    tunnelState: tunnel.state,
    tunnelMessage: tunnel.message,
    hostId: server.hostId,
  }
}

/** Which server a request is for, and the path it has there; null when it is no API request. */
export function routeOf(url: string): { serverId: string, path: string } | null {
  if (url === '/api' || url.startsWith('/api/')) return { serverId: DEFAULT_SERVER_ID, path: url }
  const match = /^\/server\/([a-z0-9_-]+)(\/api\/.*)$/.exec(url)
  return match ? { serverId: match[1]!, path: match[2]! } : null
}

/**
 * A write comes from this page or not at all. The dev server listens on the operator's machine, and
 * any web page open in the same browser can send it a request: without this a foreign page could point
 * a server at an address of its choosing. The JSON type adds a preflight, which nothing here answers.
 */
export function isOwnPage(headers: IncomingMessage['headers']): boolean {
  const { origin, host } = headers
  if (!origin || !host || !headers['content-type']?.startsWith('application/json')) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** A readable id from the name, unique in the list: it stands in a request's path. */
export function newServerId(name: string, taken: string[]): string {
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'server'
  if (stem !== DEFAULT_SERVER_ID && !taken.includes(stem)) return stem
  let number = 2
  while (taken.includes(`${stem}-${number}`)) number += 1
  return `${stem}-${number}`
}

/** The server with the change applied; what the edit does not name stays. */
export function applyEdit(server: StoredServer, edit: ServerEdit): StoredServer {
  return {
    ...server,
    name: edit.name === undefined ? server.name : edit.name,
    url: edit.url ?? server.url,
    tunnel: edit.tunnel === undefined ? server.tunnel : edit.tunnel,
    hostId: edit.hostId === undefined ? server.hostId : edit.hostId,
  }
}

function answer(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

/**
 * Passes one request on and its answer back. A failure before the answer began is `no_connection`:
 * the viewer cannot tell a tunnel that is down from a host that is, so it says neither, and it is
 * never a statement about what runs behind them.
 */
function forward(request: IncomingMessage, response: ServerResponse, server: StoredServer, path: string): void {
  const target = new URL(path, server.url)
  // the target's name replaces the dev server's, and the connection is each side's own
  const headers = { ...request.headers }
  delete headers['host']
  delete headers['connection']
  // inert until a token exists: without one no header is added at all
  if (server.token) headers['authorization'] = `Bearer ${server.token}`
  const send = target.protocol === 'https:' ? https.request : http.request
  const upstream = send(target, { method: request.method, headers }, answered => {
    response.writeHead(answered.statusCode ?? 502, answered.headers)
    answered.pipe(response)
    answered.on('error', () => response.destroy())
  })
  upstream.on('error', error => {
    if (response.headersSent) {
      response.destroy()
    } else if (!response.destroyed) {
      answer(response, 502, { error: 'no_connection', detail: (error as NodeJS.ErrnoException).code ?? null })
    }
  })
  // a reader who left: the answer has nobody to go to, and a chart's windows are not small
  response.on('close', () => {
    if (!response.writableEnded) upstream.destroy()
  })
  request.pipe(upstream)
}

async function bodyOf(request: IncomingMessage): Promise<ServerEdit | null> {
  const parts: Buffer[] = []
  let size = 0
  for await (const part of request) {
    size += (part as Buffer).length
    if (size > MAX_BODY_BYTES) return null
    parts.push(part as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf-8')) as ServerEdit
  } catch {
    return null
  }
}

/** The tunnels the list declares. */
function tunnelsOf(servers: StoredServer[]): Map<string, ServerTunnel> {
  const wanted = new Map<string, ServerTunnel>()
  for (const server of servers) {
    if (server.tunnel) wanted.set(server.id, server.tunnel)
  }
  return wanted
}

/** A new server, or one changed: its token in this machine's own file, the rest on the list. */
function nextList(dirs: ConfigDirs, servers: StoredServer[], id: string | null, edit: ServerEdit): StoredServer[] | null {
  const known = id === null ? null : servers.find(server => server.id === id) ?? null
  if (!known && !edit.url) return null
  const newId = known ? known.id : newServerId(edit.name ?? '', servers.map(server => server.id))
  const blank: StoredServer = { id: newId, name: null, url: edit.url ?? '', credentialsFile: `peers/${newId}_api_token.json`, token: '', tunnel: null, hostId: null }
  return known
    ? servers.map(server => (server.id === known.id ? applyEdit(server, edit) : server))
    : [...servers, applyEdit(blank, edit)]
}

interface ServersState {
  dirs: ConfigDirs
  servers: StoredServer[]
  tunnels?: ServerTunnels
}

/** Written after the list passed, so a refused change leaves no token behind. */
function storeToken(state: ServersState, next: StoredServer[], id: string | null, edit: ServerEdit): StoredServer[] {
  if (edit.token === undefined) return next
  const target = id ?? next[next.length - 1]!.id
  const name = saveToken(state.dirs, target, edit.token)
  return next.map(server => (server.id === target ? { ...server, credentialsFile: name, token: edit.token! } : server))
}

/**
 * The list, read once at the start and held here; what the settings page changes goes to this machine's
 * file and into this copy.
 */
function administer(
  request: IncomingMessage,
  response: ServerResponse,
  state: ServersState,
  id: string | null,
  body: ServerEdit | null,
): void {
  const list = (): ServerList => ({
    servers: state.servers.map(server => entryOf(server, state.tunnels?.statusOf(server.id))),
    secretFiles: credentialFiles(state.dirs),
  })
  if (request.method === 'GET') {
    answer(response, 200, list())
    return
  }
  if (!isOwnPage(request.headers)) {
    answer(response, 403, { error: 'not_this_page' })
    return
  }
  if (id !== null && !state.servers.some(server => server.id === id)) {
    answer(response, 404, { error: 'unknown_server' })
    return
  }
  let next: StoredServer[] | null
  if (request.method === 'DELETE' && id !== null && id !== DEFAULT_SERVER_ID) {
    next = state.servers.filter(server => server.id !== id)
  } else if (request.method === 'POST' || request.method === 'PUT') {
    next = body && nextList(state.dirs, state.servers, id, body)
    if (!next) {
      answer(response, 400, { error: 'not_valid' })
      return
    }
  } else {
    answer(response, 405, { error: 'not_allowed' })
    return
  }
  try {
    saveServers(state.dirs, next)
    if (body) {
      next = storeToken(state, next, id, body)
      saveServers(state.dirs, next)
    }
  } catch {
    answer(response, 400, { error: 'not_valid' })
    return
  }
  state.servers = next
  state.tunnels?.sync(tunnelsOf(next))
  answer(response, 200, list())
}

/** The middleware itself, apart from Vite, so a test can stand it in front of a real socket. */
export function serversMiddleware(dirs: ConfigDirs, tunnels?: ServerTunnels) {
  const state: ServersState = { dirs, servers: loadServers(dirs), tunnels }
  tunnels?.sync(tunnelsOf(state.servers))
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    // the path as the browser sent it: behind Vite's host check its html fallback has already rewritten
    // `request.url` to /index.html, which read every API request as the page (measured 2026-11-01)
    const url = (request as IncomingMessage & { originalUrl?: string }).originalUrl ?? request.url ?? ''
    if (url === ADMIN_PATH || url.startsWith(`${ADMIN_PATH}/`)) {
      const id = url.slice(ADMIN_PATH.length + 1) || null
      const hasBody = request.method === 'POST' || request.method === 'PUT'
      void (hasBody ? bodyOf(request) : Promise.resolve(null))
        .then(body => administer(request, response, state, id, body))
      return
    }
    const route = routeOf(url)
    if (!route) {
      next()
      return
    }
    const server = state.servers.find(item => item.id === route.serverId)
    if (server) forward(request, response, server, route.path)
    else answer(response, 404, { error: 'unknown_server' })
  }
}

export function viteServersPlugin(dirs: ConfigDirs): Plugin {
  type Host = { middlewares: { use: (handler: ReturnType<typeof serversMiddleware>) => unknown } }
  // returned rather than called: Vite then installs it behind its own host check, which is what stops
  // a page on another name reaching this one through a rebound address
  const install = (server: Host, tunnels?: ServerTunnels) => {
    // here and not in the hook returned: a typo in the configuration refuses the start, at once
    const handler = serversMiddleware(dirs, tunnels)
    return () => {
      server.middlewares.use(handler)
    }
  }
  return {
    name: 'finiex-servers',
    configureServer(server) {
      // the unit suite starts this config as well, and it neither reads this machine's files nor opens a tunnel
      if (process.env['VITEST']) return
      const tunnels = new ServerTunnels(credentialsRoot(dirs))
      // a restart of the dev server closes this one: the next starts them again
      server.httpServer?.once('close', () => tunnels.stop())
      return install(server, tunnels)
    },
    configurePreviewServer: server => install(server),
  }
}
