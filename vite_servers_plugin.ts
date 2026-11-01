import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { ServerEdit, ServerEntry, ServerList, ServerTunnel } from './src/types/server_types'

/**
 * The dev server as the viewer's one way out: every API request passes here, whichever server it is
 * meant for, and the token is attached here so that the browser never receives one. A value a browser
 * transmits is a value its user possesses, so the same reason that keeps `FINIEX_API_TOKEN` out of the
 * bundle keeps every other server's token out of it.
 *
 *   /api/v1/…               the default server, from the environment, as before
 *   /server/<id>/api/v1/…   a server of the list
 *   /__viewer/servers       the list itself, without a token in it
 *
 * Written by hand rather than with Vite's own `server.proxy`: its target is fixed when the dev server
 * starts, and it answers a refused connection as a 500, which reads as a fault of the backend.
 */

export const DEFAULT_SERVER_ID = 'default'

/** A server as it is stored: the entry the browser may see, and the token it may not. */
export interface StoredServer {
  id: string
  name: string | null
  url: string
  token: string
  tunnel: ServerTunnel | null
  hostId: string | null
}

export interface ServersPluginOptions {
  defaultUrl: string
  defaultToken: string
  // gitignored: it holds tokens
  secretsDir: string
}

const STORE_VERSION = 1
const ADMIN_PATH = '/__viewer/servers'
const MAX_BODY_BYTES = 64 * 1024

function storePath(secretsDir: string): string {
  return join(secretsDir, 'servers.json')
}

/**
 * The stored list. An unreadable or foreign file is the same as none: this runs in the way of every
 * request, so a broken entry must never stop the viewer reading its default server.
 */
export function readStoredServers(secretsDir: string): StoredServer[] {
  try {
    const parsed = JSON.parse(readFileSync(storePath(secretsDir), 'utf-8')) as { version?: number, servers?: StoredServer[] }
    return parsed.version === STORE_VERSION && Array.isArray(parsed.servers) ? parsed.servers : []
  } catch {
    return []
  }
}

/** Whole or not at all: a file cut off by a crash would lose every token in it. */
function writeStoredServers(secretsDir: string, servers: StoredServer[]): void {
  const target = storePath(secretsDir)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(`${target}.tmp`, `${JSON.stringify({ version: STORE_VERSION, servers }, null, 2)}\n`, { mode: 0o600 })
  renameSync(`${target}.tmp`, target)
}

/**
 * The default server first and always there. Its address and token stay the environment's, so a
 * checkout with no list reads as it always did; only its name and its identity are stored.
 */
export function resolveServers(stored: StoredServer[], options: ServersPluginOptions): StoredServer[] {
  const own = stored.find(server => server.id === DEFAULT_SERVER_ID)
  return [
    {
      id: DEFAULT_SERVER_ID,
      name: own?.name ?? null,
      url: options.defaultUrl,
      token: options.defaultToken,
      tunnel: null,
      hostId: own?.hostId ?? null,
    },
    ...stored.filter(server => server.id !== DEFAULT_SERVER_ID),
  ]
}

/** What leaves this process. Built field by field, so a field added to the store stays in here. */
export function entryOf(server: StoredServer): ServerEntry {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    isDefault: server.id === DEFAULT_SERVER_ID,
    hasToken: server.token !== '',
    tunnel: server.tunnel,
    hostId: server.hostId,
  }
}

/** Which server a request is for, and the path it has there; null when it is no API request. */
export function routeOf(url: string): { serverId: string, path: string } | null {
  if (url === '/api' || url.startsWith('/api/')) return { serverId: DEFAULT_SERVER_ID, path: url }
  const match = /^\/server\/([a-z0-9-]+)(\/api\/.*)$/.exec(url)
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

// these reach a command line once a tunnel starts, so a leading dash must not read as an option
const SSH_WORD = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/
const SECRET_FILE = /^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/

/** What is wrong with a tunnel, in words for the settings page; null when nothing is. */
export function tunnelProblem(tunnel: ServerTunnel): string | null {
  if (!SSH_WORD.test(tunnel.account)) return 'the account'
  if (!SSH_WORD.test(tunnel.host)) return 'the host'
  for (const port of [tunnel.localPort, tunnel.remotePort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'a port'
  }
  for (const file of [tunnel.keyFile, tunnel.knownHostsFile]) {
    if (!SECRET_FILE.test(file) || file.split('/').includes('..')) return 'a file'
  }
  return null
}

function urlProblem(url: string): string | null {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? null : 'the address'
  } catch {
    return 'the address'
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

/** The server with the change applied. The default server's address and token are the environment's. */
export function applyEdit(server: StoredServer, edit: ServerEdit): StoredServer {
  if (server.id === DEFAULT_SERVER_ID) {
    return {
      ...server,
      name: edit.name === undefined ? server.name : edit.name,
      hostId: edit.hostId === undefined ? server.hostId : edit.hostId,
    }
  }
  return {
    ...server,
    name: edit.name === undefined ? server.name : edit.name,
    url: edit.url ?? server.url,
    token: edit.token ?? server.token,
    tunnel: edit.tunnel === undefined ? server.tunnel : edit.tunnel,
    hostId: edit.hostId === undefined ? server.hostId : edit.hostId,
  }
}

function editProblem(edit: ServerEdit): string | null {
  if (edit.url !== undefined && urlProblem(edit.url)) return 'the address'
  return edit.tunnel ? tunnelProblem(edit.tunnel) : null
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

/** Names only: a tunnel's key is chosen from these, and its content never leaves the folder. */
function secretFilesIn(secretsDir: string, below = ''): string[] {
  const folder = join(secretsDir, below)
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true }).flatMap(item => {
    const name = below ? `${below}/${item.name}` : item.name
    if (item.isDirectory()) return secretFilesIn(secretsDir, name)
    return name === 'servers.json' || name.endsWith('.tmp') ? [] : [name]
  })
}

async function administer(request: IncomingMessage, response: ServerResponse, options: ServersPluginOptions, id: string | null): Promise<void> {
  const stored = readStoredServers(options.secretsDir)
  const servers = resolveServers(stored, options)
  if (request.method === 'GET') {
    const list: ServerList = { servers: servers.map(entryOf), secretFiles: secretFilesIn(options.secretsDir) }
    answer(response, 200, list)
    return
  }
  if (!isOwnPage(request.headers)) {
    answer(response, 403, { error: 'not_this_page' })
    return
  }
  const known = id === null ? null : servers.find(server => server.id === id) ?? null
  if (id !== null && !known) {
    answer(response, 404, { error: 'unknown_server' })
    return
  }
  let next: StoredServer[]
  if (request.method === 'DELETE' && known && !entryOf(known).isDefault) {
    next = servers.filter(server => server.id !== known.id)
  } else if (request.method === 'POST' || request.method === 'PUT') {
    const edit = await bodyOf(request)
    const problem = edit ? editProblem(edit) : 'the request'
    if (problem || !edit) {
      answer(response, 400, { error: 'not_valid', problem })
      return
    }
    if (known) {
      next = servers.map(server => (server.id === known.id ? applyEdit(server, edit) : server))
    } else if (edit.url) {
      const blank: StoredServer = { id: newServerId(edit.name ?? '', servers.map(server => server.id)), name: null, url: edit.url, token: '', tunnel: null, hostId: null }
      next = [...servers, applyEdit(blank, edit)]
    } else {
      answer(response, 400, { error: 'not_valid', problem: 'the address' })
      return
    }
  } else {
    answer(response, 405, { error: 'not_allowed' })
    return
  }
  // the default server's address and token belong to the environment and are not written down
  writeStoredServers(options.secretsDir, next.map(server => (
    server.id === DEFAULT_SERVER_ID ? { ...server, url: '', token: '' } : server
  )))
  const list: ServerList = { servers: resolveServers(readStoredServers(options.secretsDir), options).map(entryOf), secretFiles: secretFilesIn(options.secretsDir) }
  answer(response, 200, list)
}

/** The middleware itself, apart from Vite, so a test can stand it in front of a real socket. */
export function serversMiddleware(options: ServersPluginOptions) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    // the path as the browser sent it: behind Vite's host check its html fallback has already rewritten
    // `request.url` to /index.html, which read every API request as the page (measured 2026-11-01)
    const url = (request as IncomingMessage & { originalUrl?: string }).originalUrl ?? request.url ?? ''
    if (url === ADMIN_PATH || url.startsWith(`${ADMIN_PATH}/`)) {
      const id = url.slice(ADMIN_PATH.length + 1) || null
      void administer(request, response, options, id)
      return
    }
    const route = routeOf(url)
    if (!route) {
      next()
      return
    }
    const server = resolveServers(readStoredServers(options.secretsDir), options).find(item => item.id === route.serverId)
    if (server) forward(request, response, server, route.path)
    else answer(response, 404, { error: 'unknown_server' })
  }
}

export function viteServersPlugin(options: ServersPluginOptions): Plugin {
  // returned rather than called: Vite then installs it behind its own host check, which is what stops
  // a page on another name reaching this one through a rebound address
  const install = (server: { middlewares: { use: (handler: ReturnType<typeof serversMiddleware>) => unknown } }) => () => {
    server.middlewares.use(serversMiddleware(options))
  }
  return {
    name: 'finiex-servers',
    configureServer: install,
    configurePreviewServer: install,
  }
}
