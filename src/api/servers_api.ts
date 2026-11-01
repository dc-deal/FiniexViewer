import axios from 'axios'
import { apiBaseOf } from '@/active_server'
import type { ActivityList } from '@/types/api/machine_types'
import type { CallerIdentity } from '@/types/api/caller_types'
import type { ServerHealth } from '@/types/api/health_types'
import type { ServerEdit, ServerList } from '@/types/server_types'

/**
 * The list of servers, kept by the dev server, and one look at any server of it. Apart from
 * `api_client.ts`, whose every call goes to the server of this window: the settings page asks about the
 * others as well.
 */

const ADMIN = '/__viewer/servers'

export async function listServers(): Promise<ServerList> {
  return (await axios.get<ServerList>(ADMIN)).data
}

export async function createServer(edit: ServerEdit): Promise<ServerList> {
  return (await axios.post<ServerList>(ADMIN, edit)).data
}

export async function updateServer(id: string, edit: ServerEdit): Promise<ServerList> {
  return (await axios.put<ServerList>(`${ADMIN}/${id}`, edit)).data
}

export async function removeServer(id: string): Promise<ServerList> {
  // with a JSON type like every write: the dev server takes a change from this page alone
  return (await axios.delete<ServerList>(`${ADMIN}/${id}`, { headers: { 'Content-Type': 'application/json' }, data: {} })).data
}

/** What one look at a server found. `connected` false says nothing about what runs behind it. */
export interface ServerProbe {
  connected: boolean
  health: ServerHealth | null
  contract: number | null
  caller: CallerIdentity | null
  tokenRefused: boolean
  hostId: string | null
}

const NOT_CONNECTED: ServerProbe = {
  connected: false, health: null, contract: null, caller: null, tokenRefused: false, hostId: null,
}

/**
 * `/activities` is FiniexTestingIDE's named way to identify a server that does not answer contract 48
 * yet: every server lists at least its own API server there. It needs an accepted token, so such a
 * server stays unidentified until it has one.
 */
async function hostIdFromActivities(base: string): Promise<string | null> {
  try {
    const { activities } = (await axios.get<ActivityList>(`${base}/activities`)).data
    return activities.find(row => row.origin_host)?.origin_host ?? null
  } catch {
    return null
  }
}

export async function probeServer(serverId: string): Promise<ServerProbe> {
  const base = apiBaseOf(serverId)
  let health: ServerHealth
  let contract: number | null
  try {
    const answered = await axios.get<ServerHealth>(`${base}/health`)
    health = answered.data
    const stamp = Number.parseInt(String(answered.headers['x-api-contract']), 10)
    contract = Number.isNaN(stamp) ? null : stamp
  } catch {
    return NOT_CONNECTED
  }
  let caller: CallerIdentity | null = null
  let tokenRefused = false
  try {
    caller = (await axios.get<CallerIdentity>(`${base}/caller`)).data
  } catch (error) {
    tokenRefused = axios.isAxiosError(error) && error.response?.status === 401
  }
  return {
    connected: true,
    health,
    contract,
    caller,
    tokenRefused,
    hostId: health.host_id ?? (caller ? await hostIdFromActivities(base) : null),
  }
}
