// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import {
  ServerConfigError, deepMerge, differenceFrom, loadServers, saveServers,
} from '../vite_server_config'
import type { ConfigDirs, StoredServer } from '../vite_server_config'
import {
  applyEdit, entryOf, isOwnPage, newServerId, routeOf, serversMiddleware,
} from '../vite_servers_plugin'
import { DEFAULT_SERVER_ID } from '@/types/server_types'
import type { ServerList, ServerTunnel } from '@/types/server_types'

const TUNNEL: ServerTunnel = {
  account: 'reader', host: 'example.org', localPort: 8010, remotePort: 8000, keyFile: 'peers/run/key', knownHostsFile: 'peers/run/known_hosts',
}
const STORED: StoredServer = {
  id: 'second', name: 'Second', url: 'http://localhost:1/api/v1', credentialsFile: 'peers/second.json', token: 'secret-token', tunnel: null, hostId: null,
}

let dirs: ConfigDirs
let root: string

function write(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
}

function tracked(url = 'http://backend:8000/api/v1'): void {
  write(join(dirs.tracked, 'servers.json'), {
    _comment: 'tracked',
    endpoints: {
      default: { _comment_url: 'the dev container', name: 'Development', base_url: url, credentials_file: 'peers/dev.json', host_id: null, tunnel: null },
    },
  })
  write(join(dirs.tracked, 'credentials/peers/dev.json'), { api_token: '' })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'servers-'))
  dirs = { tracked: join(root, 'configs'), user: join(root, 'user_configs') }
  tracked()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('routeOf', () => {
  it('sends the plain path to the default server and a named one to that server, with the path it has there', () => {
    expect(routeOf('/api/v1/health')).toEqual({ serverId: DEFAULT_SERVER_ID, path: '/api/v1/health' })
    expect(routeOf('/server/run_host/api/v1/health?x=1')).toEqual({ serverId: 'run_host', path: '/api/v1/health?x=1' })
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

describe('applyEdit', () => {
  it('keeps what the edit does not name', () => {
    expect(applyEdit(STORED, { name: 'Renamed' })).toEqual({ ...STORED, name: 'Renamed' })
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

describe('the merge', () => {
  it('merges objects key by key and replaces values and lists whole', () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { c: 3 }, list: [9] })).toEqual({ a: { b: 1, c: 3 }, list: [9] })
  })

  it('writes down only what differs', () => {
    expect(differenceFrom({ a: { b: 1, c: 2 }, d: 1 }, { a: { b: 1, c: 3 }, d: 1, e: 2 })).toEqual({ a: { c: 3 }, e: 2 })
  })
})

describe('loadServers', () => {
  it('reads the tracked file alone where this machine has none, comments and all', () => {
    expect(loadServers(dirs)).toEqual([{
      id: DEFAULT_SERVER_ID, name: 'Development', url: 'http://backend:8000/api/v1', credentialsFile: 'peers/dev.json', token: '', tunnel: null, hostId: null,
    }])
  })

  it('merges this machine\'s file over it, and the tracked entry survives', () => {
    write(join(dirs.user, 'servers.json'), {
      endpoints: {
        default: { base_url: 'http://localhost:8000/api/v1' },
        run_host: { base_url: 'http://localhost:8010/api/v1', credentials_file: 'peers/run/api_token' },
      },
    })
    const [first, second] = loadServers(dirs)
    expect(first).toMatchObject({ name: 'Development', url: 'http://localhost:8000/api/v1' })
    expect(second).toMatchObject({ id: 'run_host', name: null, hostId: null, tunnel: null })
  })

  it('takes a token from this machine\'s file, a json file or a plain one, instead of the tracked one', () => {
    write(join(dirs.user, 'credentials/peers/dev.json'), { api_token: 'dev-token' })
    write(join(dirs.user, 'credentials/peers/run/api_token'), 'run-token\n')
    write(join(dirs.user, 'servers.json'), { endpoints: { run_host: { base_url: 'http://localhost:8010', credentials_file: 'peers/run/api_token' } } })
    expect(loadServers(dirs).map(server => server.token)).toEqual(['dev-token', 'run-token'])
  })

  /** A misspelled setting that is silently dropped looks configured and never applies. */
  it('refuses a typo, and names the key and the file', () => {
    write(join(dirs.user, 'servers.json'), { endpoints: { default: { base_urll: 'http://x' } } })
    expect(() => loadServers(dirs)).toThrow(ServerConfigError)
    expect(() => loadServers(dirs)).toThrow(/user_configs.*servers\.json.*endpoints\.default/)
  })

  it.each([
    ['a tunnel that would inject an option', { tunnel: { ...{ account: '-oProxyCommand=x', host: 'h', local_port: 1, remote_port: 2, key_file: 'k', known_hosts_file: 'n' } } }],
    ['a host with a space', { tunnel: { account: 'a', host: 'a b', local_port: 1, remote_port: 2, key_file: 'k', known_hosts_file: 'n' } }],
    ['a port out of range', { tunnel: { account: 'a', host: 'h', local_port: 70000, remote_port: 2, key_file: 'k', known_hosts_file: 'n' } }],
    ['a file outside the folder', { tunnel: { account: 'a', host: 'h', local_port: 1, remote_port: 2, key_file: '../k', known_hosts_file: 'n' } }],
    ['an address that is none', { base_url: 'file:///etc/passwd' }],
  ])('refuses %s', (_name, change) => {
    write(join(dirs.user, 'servers.json'), { endpoints: { default: change } })
    expect(() => loadServers(dirs)).toThrow(ServerConfigError)
  })

  /** The guard goes by the file that answered: a token here is one about to be published. */
  it('refuses a token standing in a tracked file', () => {
    write(join(dirs.tracked, 'credentials/peers/dev.json'), { api_token: 'committed-by-accident' })
    expect(() => loadServers(dirs)).toThrow(/tracked file holds a token/)
  })

  it('reads a file that is no JSON as an error, and names it', () => {
    write(join(dirs.user, 'servers.json'), 'not json')
    expect(() => loadServers(dirs)).toThrow(/servers\.json: not readable/)
  })
})

describe('saveServers', () => {
  it('writes only what differs from the tracked file, and never a token', () => {
    const servers = loadServers(dirs)
    saveServers(dirs, [{ ...servers[0]!, name: 'Dev', token: 'dev-token' }, { ...STORED, tunnel: TUNNEL }])
    const written = JSON.parse(readFileSync(join(dirs.user, 'servers.json'), 'utf-8')) as { endpoints: Record<string, Record<string, unknown>> }
    expect(written.endpoints['default']).toEqual({ name: 'Dev' })
    expect(written.endpoints['second']).toMatchObject({ base_url: STORED.url, tunnel: { account: 'reader', local_port: 8010 } })
    expect(JSON.stringify(written)).not.toContain('token"')
    expect(JSON.stringify(written)).not.toContain('dev-token')
  })

  it('comes back as it went', () => {
    const servers = [loadServers(dirs)[0]!, { ...STORED, token: '', tunnel: TUNNEL }]
    saveServers(dirs, servers)
    expect(loadServers(dirs)).toEqual(servers)
  })
})

describe('the middleware, on real sockets', () => {
  let backend: http.Server
  let viewer: http.Server
  let viewerPort: number
  let backendPort: number
  let seen: http.IncomingHttpHeaders[]

  function listen(server: http.Server): Promise<number> {
    return new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })
  }

  beforeEach(async () => {
    seen = []
    backend = http.createServer((request, response) => {
      seen.push(request.headers)
      response.writeHead(200, { 'Content-Type': 'application/json', 'X-Api-Contract': '48' })
      response.end(JSON.stringify({ path: request.url }))
    })
    backendPort = await listen(backend)
    tracked(`http://127.0.0.1:${backendPort}/api/v1`)
    write(join(dirs.user, 'credentials/peers/dev.json'), { api_token: 'dev-token' })
    const handler = serversMiddleware(dirs)
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
  })

  const viewerUrl = (path: string) => `http://127.0.0.1:${viewerPort}${path}`

  function send(path: string, method: string, body: unknown, origin = viewerUrl('')): Promise<Response> {
    return fetch(viewerUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    })
  }

  it('passes a request to the default server with its token, and the answer back with its headers', async () => {
    const response = await fetch(viewerUrl('/api/v1/health'))
    expect(await response.json()).toEqual({ path: '/api/v1/health' })
    expect(response.headers.get('x-api-contract')).toBe('48')
    expect(seen[0]!['authorization']).toBe('Bearer dev-token')
    expect(seen[0]!['host']).toBe(`127.0.0.1:${backendPort}`)
  })

  it('adds no header where a server has no token', async () => {
    await send('/__viewer/servers', 'POST', { name: 'Open', url: `http://127.0.0.1:${backendPort}/api/v1` })
    await fetch(viewerUrl('/server/open/api/v1/health'))
    expect(seen[0]!['authorization']).toBeUndefined()
  })

  it('sends a named server its own token, kept in this machine\'s file and in no answer', async () => {
    const created = await send('/__viewer/servers', 'POST', { name: 'Second', url: `http://127.0.0.1:${backendPort}/api/v1`, token: 'second-token' })
    const text = await created.text()
    expect(text).not.toContain('second-token')
    expect((JSON.parse(text) as ServerList).servers.map(server => server.id)).toEqual([DEFAULT_SERVER_ID, 'second'])

    const answer = await fetch(viewerUrl('/server/second/api/v1/caller'))
    expect(await answer.json()).toEqual({ path: '/api/v1/caller' })
    expect(seen[0]!['authorization']).toBe('Bearer second-token')

    const tokenFile = join(dirs.user, 'credentials/peers/second_api_token.json')
    expect(JSON.parse(readFileSync(tokenFile, 'utf-8'))).toEqual({ api_token: 'second-token' })
    expect(readFileSync(join(dirs.user, 'servers.json'), 'utf-8')).not.toContain('second-token')
    if (process.platform !== 'win32') expect(statSync(tokenFile).mode & 0o077).toBe(0)
  })

  it('finds the same list again at the next start', async () => {
    await send('/__viewer/servers', 'POST', { name: 'Second', url: `http://127.0.0.1:${backendPort}/api/v1`, token: 'second-token' })
    expect(loadServers(dirs).find(server => server.id === 'second')).toMatchObject({ name: 'Second', token: 'second-token' })
  })

  /** The whole point of the error: not a 500, which reads as a fault of what stands behind it. */
  it('answers a refused connection as no_connection', async () => {
    await send('/__viewer/servers', 'POST', { name: 'Down', url: 'http://127.0.0.1:1/api/v1' })
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
    const handler = serversMiddleware(dirs)
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
    const response = await send('/__viewer/servers', 'POST', { name: 'Evil', url: 'http://evil.example' }, 'https://evil.example')
    expect(response.status).toBe(403)
    expect(loadServers(dirs)).toHaveLength(1)
  })

  it('refuses a tunnel that would inject an option, and an address that is none', async () => {
    const tunnel = { ...TUNNEL, host: '-oProxyCommand=x' }
    expect((await send('/__viewer/servers', 'POST', { name: 'Bad', url: 'http://localhost:8010', tunnel })).status).toBe(400)
    expect((await send('/__viewer/servers', 'POST', { name: 'Bad', url: 'file:///etc/passwd' })).status).toBe(400)
    expect(loadServers(dirs)).toHaveLength(1)
  })

  it('renames the default server and writes only that', async () => {
    await send(`/__viewer/servers/${DEFAULT_SERVER_ID}`, 'PUT', { name: 'Dev' })
    const list = await (await fetch(viewerUrl('/__viewer/servers'))).json() as ServerList
    expect(list.servers[0]).toMatchObject({ name: 'Dev', hasToken: true })
    expect(JSON.parse(readFileSync(join(dirs.user, 'servers.json'), 'utf-8'))).toEqual({ endpoints: { default: { name: 'Dev' } } })
  })

  it('removes a server, but never the default one', async () => {
    await send('/__viewer/servers', 'POST', { name: 'Second', url: 'http://localhost:1/api/v1' })
    expect((await send('/__viewer/servers/second', 'DELETE', {})).status).toBe(200)
    expect((await send(`/__viewer/servers/${DEFAULT_SERVER_ID}`, 'DELETE', {})).status).toBe(405)
    const list = await (await fetch(viewerUrl('/__viewer/servers'))).json() as ServerList
    expect(list.servers.map(server => server.id)).toEqual([DEFAULT_SERVER_ID])
    expect(loadServers(dirs)).toHaveLength(1)
  })

  it('lists the credential files by name, and never their content', async () => {
    write(join(dirs.user, 'credentials/peers/run/key'), 'private')
    const text = await (await fetch(viewerUrl('/__viewer/servers'))).text()
    expect((JSON.parse(text) as ServerList).secretFiles).toEqual(['peers/dev.json', 'peers/run/key'])
    expect(text).not.toContain('private')
  })
})
