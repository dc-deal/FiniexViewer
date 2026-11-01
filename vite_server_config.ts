import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { ServerTunnel } from './src/types/server_types'

/**
 * The servers as configuration, kept the way FiniexTestingIDE keeps its own: two folders with the same
 * file names. `configs/` is tracked and holds the defaults and a placeholder for every secret;
 * `user_configs/` is gitignored and holds this machine's own.
 *
 *   servers.json   a settings file: only what differs, merged over the tracked one
 *   credentials/   discrete files: one found there is used instead of the tracked one, nothing merged
 *
 * After the merge the whole result passes a strict schema, because a misspelled setting that is silently
 * dropped looks configured and never applies. So a typo refuses the start. Every default stands twice and
 * only twice: here, and with the same value in the tracked file, so that a person can see it.
 */

export interface ConfigDirs {
  tracked: string
  user: string
}

/** A server as it is held in the dev server: what the browser may see, and the token it may not. */
export interface StoredServer {
  id: string
  name: string | null
  url: string
  credentialsFile: string
  token: string
  tunnel: ServerTunnel | null
  hostId: string | null
}

const SERVERS_FILE = 'servers.json'
const CREDENTIALS = 'credentials'

// these reach a command line once a tunnel starts, so a leading dash must not read as an option
const SSH_WORD = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/
const CREDENTIAL_FILE = /^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/
const SERVER_ID = /^[a-z0-9_-]+$/

const credentialFile = z.string().regex(CREDENTIAL_FILE).refine(name => !name.split('/').includes('..'))
const port = z.number().int().min(1).max(65535)

const tunnelSchema = z.strictObject({
  account: z.string().regex(SSH_WORD),
  host: z.string().regex(SSH_WORD),
  local_port: port,
  remote_port: port,
  key_file: credentialFile,
  known_hosts_file: credentialFile,
})

const endpointSchema = z.strictObject({
  name: z.string().nullable().default(null),
  base_url: z.string().refine(url => {
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol)
    } catch {
      return false
    }
  }, 'an http or https address'),
  credentials_file: credentialFile,
  // the server's own identity once it was read: what its saved state in the browser is kept under
  host_id: z.string().nullable().default(null),
  tunnel: tunnelSchema.nullable().default(null),
})

const serversSchema = z.strictObject({
  endpoints: z.record(z.string().regex(SERVER_ID), endpointSchema),
})

type Endpoint = z.infer<typeof endpointSchema>
type JsonObject = Record<string, unknown>

/** Why a start is refused: which file, and every key in it that is wrong. */
export class ServerConfigError extends Error {
  constructor(where: string, detail: string) {
    super(`${where}: ${detail}`)
    this.name = 'ServerConfigError'
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON has no comments, so `_comment` and `_comment_<what>` are allowed at every level. */
function withoutComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutComments)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== '_comment' && !key.startsWith('_comment_'))
    .map(([key, item]) => [key, withoutComments(item)]))
}

/** Objects merge key by key. Values and lists are replaced whole, and whoever overrides a list repeats it. */
export function deepMerge(base: JsonObject, override: JsonObject): JsonObject {
  const merged: JsonObject = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const below = merged[key]
    merged[key] = isObject(below) && isObject(value) ? deepMerge(below, value) : value
  }
  return merged
}

/** What `next` holds that `base` does not: what an override file has to say, and no more. */
export function differenceFrom(base: JsonObject, next: JsonObject): JsonObject {
  const difference: JsonObject = {}
  for (const [key, value] of Object.entries(next)) {
    const below = base[key]
    if (isObject(below) && isObject(value)) {
      const inner = differenceFrom(below, value)
      if (Object.keys(inner).length > 0) difference[key] = inner
    } else if (JSON.stringify(below) !== JSON.stringify(value)) {
      difference[key] = value
    }
  }
  return difference
}

function readJson(path: string): JsonObject {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (!isObject(parsed)) throw new ServerConfigError(path, 'not an object')
    return parsed
  } catch (error) {
    if (error instanceof ServerConfigError) throw error
    throw new ServerConfigError(path, 'not readable as JSON')
  }
}

/**
 * The file that answers for a credential: this machine's first, the tracked placeholder second. The one
 * place that turns a configured name into a path, with the subfolder travelling in the name.
 */
function credentialPath(dirs: ConfigDirs, name: string): { path: string, tracked: boolean } | null {
  const own = join(dirs.user, CREDENTIALS, name)
  if (existsSync(own)) return { path: own, tracked: false }
  const placeholder = join(dirs.tracked, CREDENTIALS, name)
  return existsSync(placeholder) ? { path: placeholder, tracked: true } : null
}

/**
 * A token from its file: `{ "api_token": "…" }` for a `.json`, the file itself for any other, as the files
 * brought from another installation are. The guard goes by the file that answered and not by the value:
 * a token in a tracked file is one about to be published, so it refuses the start.
 */
function readToken(dirs: ConfigDirs, name: string): string {
  const found = credentialPath(dirs, name)
  if (!found) return ''
  const token = name.endsWith('.json')
    ? String(readJson(found.path)['api_token'] ?? '').trim()
    : readFileSync(found.path, 'utf-8').trim()
  if (found.tracked && token !== '') {
    throw new ServerConfigError(found.path, 'a tracked file holds a token; it belongs in user_configs/credentials')
  }
  return token
}

function trackedFile(dirs: ConfigDirs): JsonObject {
  return withoutComments(readJson(join(dirs.tracked, SERVERS_FILE))) as JsonObject
}

function toTunnel(tunnel: Endpoint['tunnel']): ServerTunnel | null {
  return tunnel && {
    account: tunnel.account,
    host: tunnel.host,
    localPort: tunnel.local_port,
    remotePort: tunnel.remote_port,
    keyFile: tunnel.key_file,
    knownHostsFile: tunnel.known_hosts_file,
  }
}

function fromTunnel(tunnel: ServerTunnel | null): Endpoint['tunnel'] {
  return tunnel && {
    account: tunnel.account,
    host: tunnel.host,
    local_port: tunnel.localPort,
    remote_port: tunnel.remotePort,
    key_file: tunnel.keyFile,
    known_hosts_file: tunnel.knownHostsFile,
  }
}

/** The servers of this machine. Read once at the start: a file edited by hand applies at the next one. */
export function loadServers(dirs: ConfigDirs): StoredServer[] {
  const tracked = trackedFile(dirs)
  const ownPath = join(dirs.user, SERVERS_FILE)
  const own = existsSync(ownPath) ? withoutComments(readJson(ownPath)) as JsonObject : {}
  const parsed = serversSchema.safeParse(deepMerge(tracked, own))
  if (!parsed.success) {
    const detail = parsed.error.issues.map(issue => `${issue.path.join('.')} ${issue.message}`).join('; ')
    throw new ServerConfigError(existsSync(ownPath) ? ownPath : join(dirs.tracked, SERVERS_FILE), detail)
  }
  return Object.entries(parsed.data.endpoints).map(([id, endpoint]) => ({
    id,
    name: endpoint.name,
    url: endpoint.base_url,
    credentialsFile: endpoint.credentials_file,
    token: readToken(dirs, endpoint.credentials_file),
    tunnel: toTunnel(endpoint.tunnel),
    hostId: endpoint.host_id,
  }))
}

/** Whole or not at all: a file cut off by a crash would lose what it held. */
function writeWhole(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, text, { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
  chmodSync(path, 0o600)
}

/**
 * Writes the list as this machine's override: only what differs from the tracked file. What the settings
 * page changes belongs here and never in `configs/`. Refused as a whole if it would not load again.
 */
export function saveServers(dirs: ConfigDirs, servers: StoredServer[]): void {
  const endpoints: Record<string, Endpoint> = {}
  for (const server of servers) {
    endpoints[server.id] = {
      name: server.name,
      base_url: server.url,
      credentials_file: server.credentialsFile,
      host_id: server.hostId,
      tunnel: fromTunnel(server.tunnel),
    }
  }
  const parsed = serversSchema.safeParse({ endpoints })
  if (!parsed.success) throw new ServerConfigError('the list', parsed.error.issues.map(issue => issue.path.join('.')).join('; '))
  const difference = differenceFrom(trackedFile(dirs), parsed.data as unknown as JsonObject)
  writeWhole(join(dirs.user, SERVERS_FILE), `${JSON.stringify(difference, null, 2)}\n`)
}

/** A token set on the settings page, in this machine's own file; returns the name the server now reads. */
export function saveToken(dirs: ConfigDirs, serverId: string, token: string): string {
  const name = `peers/${serverId}_api_token.json`
  writeWhole(join(dirs.user, CREDENTIALS, name), `${JSON.stringify({ api_token: token }, null, 2)}\n`)
  return name
}

/** Names only, what a tunnel's key is chosen from: their content never leaves the folder. */
export function credentialFiles(dirs: ConfigDirs, below = ''): string[] {
  const folder = join(dirs.user, CREDENTIALS, below)
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true }).flatMap(item => {
    const name = below ? `${below}/${item.name}` : item.name
    if (item.isDirectory()) return credentialFiles(dirs, name)
    return name.endsWith('.tmp') ? [] : [name]
  })
}

/** Where a tunnel's files are named from. */
export function credentialsRoot(dirs: ConfigDirs): string {
  return join(dirs.user, CREDENTIALS)
}
