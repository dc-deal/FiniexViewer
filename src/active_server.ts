import { readTabEntry, writeTabAndShared } from '@/tab_storage'
import { DEFAULT_SERVER_ID } from '@/types/server_types'

/**
 * Which server this browser window reads. One per window, so two windows can show two servers, and
 * read before anything else starts: the client's address and the saved state both hang on it. Switching
 * reloads the page, because every store then starts empty and nothing of one server can stand beside
 * the other. A run id means something only on its own system (their note on the run host).
 */

const STORAGE_KEY = 'server.v1'

export interface ActiveServer {
  id: string
  // known once the server was identified; what its saved state is kept under
  hostId: string | null
}

export function activeServer(): ActiveServer {
  try {
    const parsed = JSON.parse(readTabEntry(STORAGE_KEY) ?? 'null') as Partial<ActiveServer> | null
    if (typeof parsed?.id === 'string') {
      return { id: parsed.id, hostId: typeof parsed.hostId === 'string' ? parsed.hostId : null }
    }
  } catch {
    // an unreadable entry is the same as none: the default server, never a broken start
  }
  return { id: DEFAULT_SERVER_ID, hostId: null }
}

export function setActiveServer(next: ActiveServer): void {
  writeTabAndShared(STORAGE_KEY, JSON.stringify(next))
}

/** The address of a server's API, as this page reaches it through the dev server. */
export function apiBaseOf(serverId: string): string {
  return serverId === DEFAULT_SERVER_ID ? '/api/v1' : `/server/${serverId}/api/v1`
}

/**
 * What a server's own part of the arrangement is stored under, or null for the default server, whose
 * part stays where it always was. By `host_id` wherever it is known, which survives a new address; a
 * server not identified yet has only the id of its entry.
 */
export function serverStateKey(server: ActiveServer = activeServer()): string | null {
  return server.id === DEFAULT_SERVER_ID ? null : server.hostId ?? server.id
}

export function reloadPage(): void {
  window.location.reload()
}
