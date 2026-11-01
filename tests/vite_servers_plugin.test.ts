// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import {
  applyEdit, entryOf, isOwnPage, newServerId, readStoredServers, resolveServers, routeOf,
  serversMiddleware, tunnelProblem,
} from '../vite_servers_plugin'
import type { ServersPluginOptions, StoredServer } from '../vite_servers_plugin'
import { DEFAULT_SERVER_ID } from '@/types/server_types'
import type { ServerList, ServerTunnel } from '@/types/server_types'

const TUNNEL: ServerTunnel = {
  account: 'reader', host: 'example.org', localPort: 8010, remotePort: 8000, keyFile: 'run/key', knownHostsFile: 'run/known_hosts',
}

const STORED: StoredServer = { id: 'second', name: 'Second', url: 'http://localhost:1', token: 'secret-token', tunnel: null, hostId: null }

function listen(server: http.Server): Promise<number> {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
  })
}

describe('routeOf', () => {
  it('sends the plain path to the default server and a named one to that server, with the path it has there', () => {
    expect(routeOf('/api/v1/health')).toEqual({ serverId: DEFAULT_SERVER_ID, path: '/api/v1/health' })
    expect(routeOf('/server/run-host/api/v1/health?x=1')).toEqual({ serverId: 'run-host', path: '/api/v1/health?x=1' })
  })

  it('leaves everything else to the dev server', () => {
    expect(routeOf('/src/main.ts')).toBeNull()
    expect(routeOf('/apiary')).toBeNull()
    expect(routeOf('/server/../api/v1/health')).toBeNull()
  })
})

describe('what leaves the process', () => {
  it('never carries a token, only whether there is one', () => {
    const entry = entryOf(STORED)
    expect(JSON.stringify(entry)).not.toContain('secret-token')
    expect(entry.hasToken).toBe(true)
    expect(entryOf({ ...STORED, token: '' }).hasToken).toBe(false)
  })
})

describe('resolveServers', () => {
  const options: ServersPluginOptions = { defaultUrl: 'http://dev:8000', defaultToken: 'dev-token', secretsDir: '' }

  it('stands the default server first, with the address and the token of the environment', () => {
    const [first, second] = resolveServers([STORED], options)
    expect(first).toMatchObject({ id: DEFAULT_SERVER_ID, url: 'http://dev:8000', token: 'dev-token' })
    expect(second!.id).toBe('second')
  })

  it('takes only its name and its identity from the list', () => {
    const stored: StoredServer = { ...STORED, id: DEFAULT_SERVER_ID, url: 'http://elsewhere', token: 'other', name: 'Dev', hostId: 'h_1' }
    expect(resolveServers([stored], options)).toEqual([
      { id: DEFAULT_SERVER_ID, name: 'Dev', url: 'http://dev:8000', token: 'dev-token', tunnel: null, hostId: 'h_1' },
    ])
  })
})

describe('applyEdit', () => {
  it('keeps what the edit does not name, the token above all', () => {
    expect(applyEdit(STORED, { name: 'Renamed' })).toEqual({ ...STORED, name: 'Renamed' })
    expect(applyEdit(STORED, { token: 'new' }).token).toBe('new')
  })

  it('takes a name and an identity on the default server, and neither address nor token', () => {
    const server = { ...STORED, id: DEFAULT_SERVER_ID }
    expect(applyEdit(server, { url: 'http://other', token: 'new', name: 'Dev', hostId: 'h_1' }))
      .toEqual({ ...server, name: 'Dev', hostId: 'h_1' })
  })
})

describe('newServerId', () => {
  it('builds a readable id, unique in the list and never the default one', () => {
    expect(newServerId('Run host', [])).toBe('run-host')
    expect(newServerId('Run host', ['run-host'])).toBe('run-host-2')
    expect(newServerId('', [])).toBe('server')
    expect(newServerId('Default', [DEFAULT_SERVER_ID])).toBe('default-2')
  })
})

describe('tunnelProblem', () => {
  it('accepts a plain tunnel', () => {
    expect(tunnelProblem(TUNNEL)).toBeNull()
  })

  /** These reach a command line: a leading dash would read as an option of ssh. */
  it.each([
    [{ ...TUNNEL, account: '-oProxyCommand=x' }, 'the account'],
    [{ ...TUNNEL, host: '-x' }, 'the host'],
    [{ ...TUNNEL, host: 'a b' }, 'the host'],
    [{ ...TUNNEL, localPort: 70000 }, 'a port'],
    [{ ...TUNNEL, keyFile: '../outside' }, 'a file'],
    [{ ...TUNNEL, knownHostsFile: 'run/../../outside' }, 'a file'],
  ])('refuses %j', (tunnel, problem) => {
    expect(tunnelProblem(tunnel)).toBe(problem)
  })
})

describe('isOwnPage', () => {
  const json = { 'content-type': 'application/json', host: 'localhost:5173' }

  it('takes a write from the page itself', () => {
    expect(isOwnPage({ ...json, origin: 'http://localhost:5173' })).toBe(true)
  })

  it.each([
    [{ ...json, origin: 'https://elsewhere.example' }],
    [{ ...json }],
    [{ host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'text/plain' }],
    [{ ...json, origin: 'not an origin' }],
  ])('refuses %j', headers => {
    expect(isOwnPage(headers)).toBe(false)
  })
})

describe('the middleware, on real sockets', () => {
  let secretsDir: string
  let backend: http.Server
  let viewer: http.Server
  let backendPort: number
  let viewerPort: number
  let seen: http.IncomingHttpHeaders[]

  beforeEach(async () => {
    secretsDir = mkdtempSync(join(tmpdir(), 'servers-'))
    seen = []
    backend = http.createServer((request, response) => {
      seen.push(request.headers)
      response.writeHead(200, { 'Content-Type': 'application/json', 'X-Api-Contract': '47' })
      response.end(JSON.stringify({ path: request.url }))
    })
    backendPort = await listen(backend)
    const handler = serversMiddleware({ defaultUrl: `http://127.0.0.1:${backendPort}`, defaultToken: 'dev-token', secretsDir })
    viewer = http.createServer((request, response) => handler(request, response, () => {
      response.writeHead(204)
      response.end()
    }))
    viewerPort = await listen(viewer)
  })

  afterEach(() => {
    backend.closeAllConnections()
    viewer.closeAllConnections()
    backend.close()
    viewer.close()
    rmSync(secretsDir, { recursive: true, force: true })
  })

  const viewerUrl = (path: string) => `http://127.0.0.1:${viewerPort}${path}`

  function write(path: string, method: string, body: unknown, origin = viewerUrl('')): Promise<Response> {
    return fetch(viewerUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    })
  }

  it('passes a request to the default server with its token, and the answer back with its headers', async () => {
    const response = await fetch(viewerUrl('/api/v1/health'))
    expect(await response.json()).toEqual({ path: '/api/v1/health' })
    expect(response.headers.get('x-api-contract')).toBe('47')
    expect(seen[0]!['authorization']).toBe('Bearer dev-token')
    expect(seen[0]!['host']).toBe(`127.0.0.1:${backendPort}`)
  })

  it('adds no header where a server has no token', async () => {
    await write('/__viewer/servers', 'POST', { name: 'Open', url: `http://127.0.0.1:${backendPort}` })
    await fetch(viewerUrl('/server/open/api/v1/health'))
    expect(seen[0]!['authorization']).toBeUndefined()
  })

  it('sends a named server its own token, and what it answers says nothing of the token', async () => {
    const created = await write('/__viewer/servers', 'POST', { name: 'Second', url: `http://127.0.0.1:${backendPort}`, token: 'second-token' })
    const text = await created.text()
    expect(text).not.toContain('second-token')
    expect((JSON.parse(text) as ServerList).servers.map(server => server.id)).toEqual([DEFAULT_SERVER_ID, 'second'])

    const answer = await fetch(viewerUrl('/server/second/api/v1/caller'))
    expect(await answer.json()).toEqual({ path: '/api/v1/caller' })
    expect(seen[0]!['authorization']).toBe('Bearer second-token')
  })

  /** The whole point of the error: not a 500, which reads as a fault of what stands behind it. */
  it('answers a refused connection as no_connection', async () => {
    await write('/__viewer/servers', 'POST', { name: 'Down', url: 'http://127.0.0.1:1' })
    const response = await fetch(viewerUrl('/server/down/api/v1/health'))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'no_connection', detail: 'ECONNREFUSED' })
  })

  it('says so for a server the list does not hold', async () => {
    const response = await fetch(viewerUrl('/server/gone/api/v1/health'))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'unknown_server' })
  })

  /** Vite's html fallback rewrites the url before this middleware runs, and keeps the original beside it. */
  it('reads the path the browser sent, not the one the html fallback left', () => {
    const handler = serversMiddleware({ defaultUrl: 'http://127.0.0.1:1', defaultToken: '', secretsDir })
    let passedOn = false
    const request = { url: '/index.html', originalUrl: '/src/main.ts', headers: {} } as unknown as http.IncomingMessage
    handler(request, {} as http.ServerResponse, () => { passedOn = true })
    expect(passedOn).toBe(true)

    const written: number[] = []
    const answering = { url: '/index.html', originalUrl: '/server/gone/api/v1/health', headers: {} } as unknown as http.IncomingMessage
    const response = { writeHead: (status: number) => written.push(status), end: () => {} } as unknown as http.ServerResponse
    handler(answering, response, () => { passedOn = false })
    expect(written).toEqual([404])
  })

  it('leaves what is no API request to the dev server', async () => {
    expect((await fetch(viewerUrl('/src/main.ts'))).status).toBe(204)
  })

  it('refuses a write from another page, and writes nothing', async () => {
    const response = await write('/__viewer/servers', 'POST', { name: 'Evil', url: 'http://evil.example' }, 'https://evil.example')
    expect(response.status).toBe(403)
    expect(readStoredServers(secretsDir)).toEqual([])
  })

  it('refuses a tunnel that would inject an option, and an address that is none', async () => {
    const tunnel = { ...TUNNEL, host: '-oProxyCommand=x' }
    expect((await write('/__viewer/servers', 'POST', { name: 'Bad', url: 'http://localhost:8010', tunnel })).status).toBe(400)
    expect((await write('/__viewer/servers', 'POST', { name: 'Bad', url: 'file:///etc/passwd' })).status).toBe(400)
    expect(readStoredServers(secretsDir)).toEqual([])
  })

  it('renames the default server and keeps the address of the environment out of the file', async () => {
    await write(`/__viewer/servers/${DEFAULT_SERVER_ID}`, 'PUT', { name: 'Development' })
    const list = await (await fetch(viewerUrl('/__viewer/servers'))).json() as ServerList
    expect(list.servers[0]).toMatchObject({ name: 'Development', url: `http://127.0.0.1:${backendPort}`, hasToken: true })
    expect(readFileSync(join(secretsDir, 'servers.json'), 'utf-8')).not.toContain('dev-token')
  })

  it('removes a server, but never the default one', async () => {
    await write('/__viewer/servers', 'POST', { name: 'Second', url: 'http://localhost:1' })
    expect((await write('/__viewer/servers/second', 'DELETE', {})).status).toBe(200)
    expect((await write(`/__viewer/servers/${DEFAULT_SERVER_ID}`, 'DELETE', {})).status).toBe(405)
    const list = await (await fetch(viewerUrl('/__viewer/servers'))).json() as ServerList
    expect(list.servers.map(server => server.id)).toEqual([DEFAULT_SERVER_ID])
  })

  it('lists the secret files by name, without the list itself', async () => {
    await write('/__viewer/servers', 'POST', { name: 'Second', url: 'http://localhost:1' })
    writeFileSync(join(secretsDir, 'key'), 'private')
    const text = await (await fetch(viewerUrl('/__viewer/servers'))).text()
    expect((JSON.parse(text) as ServerList).secretFiles).toEqual(['key'])
    expect(text).not.toContain('private')
  })

  it('reads a broken list as none, and keeps serving the default server', async () => {
    writeFileSync(join(secretsDir, 'servers.json'), 'not json')
    expect(readStoredServers(secretsDir)).toEqual([])
    expect((await fetch(viewerUrl('/api/v1/health'))).status).toBe(200)
  })

  it('writes the list for its owner alone where the system has such a thing', async () => {
    await write('/__viewer/servers', 'POST', { name: 'Second', url: 'http://localhost:1', token: 'x' })
    const file = join(secretsDir, 'servers.json')
    expect(existsSync(file)).toBe(true)
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0)
  })
})
