import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { activeServer, reloadPage, setActiveServer } from '@/active_server'
import {
  createServer, listServers, probeServer, removeServer, updateServer,
} from '@/api/servers_api'
import type { ServerProbe } from '@/api/servers_api'
import { DEFAULT_SERVER_ID } from '@/types/server_types'
import type { ServerEdit, ServerEntry, ServerList } from '@/types/server_types'

/** One tab's note, across the reload it asks for, that its address answered as another installation. */
const MOVED_KEY = 'server.moved'

function takeMovedNote(): boolean {
  try {
    const moved = sessionStorage.getItem(MOVED_KEY) !== null
    sessionStorage.removeItem(MOVED_KEY)
    return moved
  } catch {
    return false
  }
}

/** The name a server has until the reader gives it one: what its first health check said about it. */
export function firstName(entry: ServerEntry, probe: ServerProbe): string {
  return probe.health?.host_name ?? `${addressOf(entry)} · ${probe.health?.version ?? ''}`.replace(/ · $/, '')
}

function addressOf(entry: ServerEntry): string {
  try {
    return new URL(entry.url).host
  } catch {
    return entry.url
  }
}

/** How a server reads on screen. */
export function serverName(entry: ServerEntry): string {
  return entry.name ?? addressOf(entry)
}

export const useServersStore = defineStore('servers', () => {
  const servers = shallowRef<ServerEntry[]>([])
  const secretFiles = shallowRef<string[]>([])
  const active = activeServer()
  const current = computed(() => servers.value.find(server => server.id === active.id) ?? null)
  const answeredAsAnother = ref(takeMovedNote())
  /** The server a switch is on its way to: the page is about to reload, and says so at the click. */
  const switchingTo = ref<ServerEntry | null>(null)

  function apply(list: ServerList): void {
    servers.value = list.servers
    secretFiles.value = list.secretFiles
  }

  /** Writes what a look at a server found: its identity, and its first name if it has none. */
  async function remember(entry: ServerEntry, probe: ServerProbe): Promise<ServerEntry> {
    const edit: ServerEdit = {}
    if (probe.hostId && probe.hostId !== entry.hostId) edit.hostId = probe.hostId
    if (probe.connected && entry.name === null) edit.name = firstName(entry, probe)
    if (Object.keys(edit).length === 0) return entry
    apply(await updateServer(entry.id, edit))
    return servers.value.find(server => server.id === entry.id) ?? entry
  }

  async function go(entry: ServerEntry): Promise<void> {
    setActiveServer({ id: entry.id, hostId: entry.hostId })
    reloadPage()
  }

  /**
   * Called at the start. A server no longer on the list gives way to the default one. An address that
   * answers as another installation than it did must not show the first one's selection as its own, so
   * the window starts again under the identity it has now, and says so.
   */
  async function load(): Promise<void> {
    try {
      apply(await listServers())
    } catch {
      // no list, in a bundle served without the dev server: the window keeps reading what it reads
      return
    }
    const entry = current.value
    if (!entry) {
      await go(servers.value.find(server => server.id === DEFAULT_SERVER_ID)!)
      return
    }
    try {
      const probe = await probeServer(entry.id)
      const moved = entry.id !== DEFAULT_SERVER_ID && entry.hostId !== null && probe.hostId !== null && probe.hostId !== entry.hostId
      const known = await remember(entry, probe)
      if (moved) {
        sessionStorage.setItem(MOVED_KEY, '1')
        await go(known)
      } else if (known.hostId !== active.hostId) {
        // identified now: the next start finds its saved state under this value
        setActiveServer({ id: known.id, hostId: known.hostId })
      }
    } catch {
      // a list that cannot be written is no reason to stop reading the server
    }
  }

  /** To another server in this window. Identified first where it can be, so its state has its home. */
  async function switchTo(id: string): Promise<void> {
    const entry = servers.value.find(server => server.id === id)
    if (!entry || id === active.id) return
    switchingTo.value = entry
    let known = entry
    // asked first only where it is needed: over a tunnel the look costs a noticeable moment, and a
    // server already identified is looked at again when the page has loaded
    if (entry.hostId === null) {
      try {
        known = await remember(entry, await probeServer(id))
      } catch {
        // no connection yet: it can still be chosen, and it says so once it is on show
      }
    }
    await go(known)
  }

  async function save(id: string | null, edit: ServerEdit): Promise<void> {
    apply(await (id === null ? createServer(edit) : updateServer(id, edit)))
  }

  async function remove(id: string): Promise<void> {
    apply(await removeServer(id))
    if (id === active.id) await switchTo(DEFAULT_SERVER_ID)
  }

  async function check(id: string): Promise<ServerProbe> {
    const entry = servers.value.find(server => server.id === id)
    const probe = await probeServer(id)
    if (entry) await remember(entry, probe)
    return probe
  }

  return { servers, secretFiles, activeId: active.id, current, answeredAsAnother, switchingTo, load, switchTo, save, remove, check }
})
