import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { activeServer, apiBaseOf, serverStateKey, setActiveServer } from '@/active_server'
import * as serversApi from '@/api/servers_api'
import type { ServerProbe } from '@/api/servers_api'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useContextStore } from '@/stores/context_store'
import { firstName, serverName, useServersStore } from '@/stores/servers_store'
import { DEFAULT_SERVER_ID } from '@/types/server_types'
import type { ServerEntry, ServerList } from '@/types/server_types'

const reloadPage = vi.hoisted(() => vi.fn())

vi.mock('@/active_server', async importOriginal => ({
  ...await importOriginal<typeof import('@/active_server')>(),
  reloadPage,
}))

vi.mock('@/api/servers_api', () => ({
  listServers: vi.fn(),
  createServer: vi.fn(),
  updateServer: vi.fn(),
  removeServer: vi.fn(),
  probeServer: vi.fn(),
}))

const DEFAULT: ServerEntry = {
  id: DEFAULT_SERVER_ID, name: 'Development', url: 'http://dev:8000', isDefault: true, hasToken: true, tunnel: null, tunnelState: 'none', tunnelMessage: null, hostId: 'h_dev',
}
const SECOND: ServerEntry = {
  id: 'second', name: null, url: 'http://localhost:8010', isDefault: false, hasToken: true, tunnel: null, tunnelState: 'none', tunnelMessage: null, hostId: null,
}

function list(...servers: ServerEntry[]): ServerList {
  return { servers, secretFiles: [] }
}

function found(over: Partial<ServerProbe> = {}): ServerProbe {
  return {
    connected: true,
    health: { status: 'ok', version: '1.5.0', started_at: '', uptime_s: 1, host_id: 'h_second', host_name: null },
    contract: 48,
    caller: null,
    tokenRefused: false,
    hostId: 'h_second',
    ...over,
  }
}

const NOT_CONNECTED: ServerProbe = { connected: false, health: null, contract: null, caller: null, tokenRefused: false, hostId: null }

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  reloadPage.mockReset()
  vi.mocked(serversApi.listServers).mockReset()
  vi.mocked(serversApi.updateServer).mockReset()
  vi.mocked(serversApi.probeServer).mockReset()
})

describe('the window\'s server', () => {
  it('is the default one until another was chosen, and an unreadable entry is the same as none', () => {
    expect(activeServer()).toEqual({ id: DEFAULT_SERVER_ID, hostId: null })
    sessionStorage.setItem('server.v1', 'not json')
    expect(activeServer()).toEqual({ id: DEFAULT_SERVER_ID, hostId: null })
  })

  it('decides the address of the API', () => {
    expect(apiBaseOf(DEFAULT_SERVER_ID)).toBe('/api/v1')
    expect(apiBaseOf('second')).toBe('/server/second/api/v1')
  })

  /** `host_id` survives a new address, so a saved state hangs on it wherever it is known. */
  it('keeps its state under the identity once known, and the default server\'s where it always was', () => {
    expect(serverStateKey({ id: DEFAULT_SERVER_ID, hostId: 'h_dev' })).toBeNull()
    expect(serverStateKey({ id: 'second', hostId: null })).toBe('second')
    expect(serverStateKey({ id: 'second', hostId: 'h_second' })).toBe('h_second')
  })

  it('stays with one window: another tab\'s choice does not reach a window that has its own', () => {
    setActiveServer({ id: 'second', hostId: 'h_second' })
    localStorage.setItem('server.v1', JSON.stringify({ id: 'third', hostId: null }))
    expect(activeServer().id).toBe('second')
  })

  it('starts a new window on the last one chosen', () => {
    localStorage.setItem('server.v1', JSON.stringify({ id: 'third', hostId: null }))
    expect(activeServer().id).toBe('third')
  })
})

describe('names', () => {
  it('takes what the first health check said, the server\'s own name first', () => {
    expect(firstName(SECOND, found())).toBe('localhost:8010 · 1.5.0')
    expect(firstName(SECOND, found({ health: { status: 'ok', version: '1.5.0', started_at: '', uptime_s: 1, host_name: 'run host' } })))
      .toBe('run host')
  })

  it('reads the address until there is a name', () => {
    expect(serverName(SECOND)).toBe('localhost:8010')
    expect(serverName(DEFAULT)).toBe('Development')
  })
})

describe('load', () => {
  it('gives way to the default server when the window\'s is no longer on the list', async () => {
    setActiveServer({ id: 'gone', hostId: null })
    vi.mocked(serversApi.listServers).mockResolvedValue(list(DEFAULT))
    await useServersStore().load()
    expect(activeServer().id).toBe(DEFAULT_SERVER_ID)
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('names and identifies a server on its first answer, and asks for no reload', async () => {
    setActiveServer({ id: 'second', hostId: null })
    vi.mocked(serversApi.listServers).mockResolvedValue(list(DEFAULT, SECOND))
    vi.mocked(serversApi.probeServer).mockResolvedValue(found())
    vi.mocked(serversApi.updateServer).mockResolvedValue(list(DEFAULT, { ...SECOND, name: 'localhost:8010 · 1.5.0', hostId: 'h_second' }))
    await useServersStore().load()
    expect(serversApi.updateServer).toHaveBeenCalledWith('second', { hostId: 'h_second', name: 'localhost:8010 · 1.5.0' })
    expect(activeServer().hostId).toBe('h_second')
    expect(reloadPage).not.toHaveBeenCalled()
  })

  it('writes nothing when the server cannot be reached, and stays', async () => {
    setActiveServer({ id: 'second', hostId: 'h_second' })
    vi.mocked(serversApi.listServers).mockResolvedValue(list(DEFAULT, { ...SECOND, hostId: 'h_second' }))
    vi.mocked(serversApi.probeServer).mockResolvedValue(NOT_CONNECTED)
    await useServersStore().load()
    expect(serversApi.updateServer).not.toHaveBeenCalled()
    expect(reloadPage).not.toHaveBeenCalled()
  })

  /** A port that now leads elsewhere must not show the first installation's selection as its own. */
  it('starts the window again when an address answers as another installation, and says so', async () => {
    const known = { ...SECOND, name: 'Second', hostId: 'h_first' }
    setActiveServer({ id: 'second', hostId: 'h_first' })
    vi.mocked(serversApi.listServers).mockResolvedValue(list(DEFAULT, known))
    vi.mocked(serversApi.probeServer).mockResolvedValue(found())
    vi.mocked(serversApi.updateServer).mockResolvedValue(list(DEFAULT, { ...known, hostId: 'h_second' }))
    await useServersStore().load()
    expect(activeServer()).toEqual({ id: 'second', hostId: 'h_second' })
    expect(reloadPage).toHaveBeenCalledOnce()

    // the reload is a new page: the note it left is read once
    setActivePinia(createPinia())
    expect(useServersStore().answeredAsAnother).toBe(true)
    setActivePinia(createPinia())
    expect(useServersStore().answeredAsAnother).toBe(false)
  })

  it('keeps reading the window\'s server where there is no list', async () => {
    vi.mocked(serversApi.listServers).mockRejectedValue(new Error('none'))
    await useServersStore().load()
    expect(reloadPage).not.toHaveBeenCalled()
  })
})

describe('switchTo', () => {
  async function ready() {
    const store = useServersStore()
    vi.mocked(serversApi.listServers).mockResolvedValue(list(DEFAULT, SECOND))
    vi.mocked(serversApi.probeServer).mockResolvedValue(NOT_CONNECTED)
    await store.load()
    reloadPage.mockReset()
    return store
  }

  it('writes the window\'s choice first and then reloads, identified where it can be', async () => {
    const store = await ready()
    vi.mocked(serversApi.probeServer).mockResolvedValue(found())
    vi.mocked(serversApi.updateServer).mockResolvedValue(list(DEFAULT, { ...SECOND, hostId: 'h_second', name: 'x' }))
    await store.switchTo('second')
    expect(activeServer()).toEqual({ id: 'second', hostId: 'h_second' })
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('still goes to a server with no connection: it says so once it is on show', async () => {
    const store = await ready()
    vi.mocked(serversApi.probeServer).mockRejectedValue(new Error('down'))
    await store.switchTo('second')
    expect(activeServer().id).toBe('second')
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('does nothing for the server on show', async () => {
    const store = await ready()
    await store.switchTo(DEFAULT_SERVER_ID)
    expect(reloadPage).not.toHaveBeenCalled()
  })
})

describe('the arrangement, per server', () => {
  const KEY = 'arrangement.v1'
  const dock = { grid: 'placed' }

  function saved(key: string): Record<string, unknown> {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as Record<string, unknown>
  }

  function start() {
    setActivePinia(createPinia())
    sessionStorage.removeItem(KEY)
    return { arrangement: useArrangementStore(), context: useContextStore() }
  }

  it('leaves the default server as it was: one entry, with the selection in it', async () => {
    const { arrangement, context } = start()
    arrangement.setDock(dock)
    context.selectRun('run_dev')
    await nextTick()
    expect(saved(KEY)['dock']).toEqual(dock)
    expect((saved(KEY)['links'] as { A: { run: { id: string } } }).A.run.id).toBe('run_dev')
    expect(localStorage.length).toBe(1)
  })

  it('shares the placement, and keeps each server\'s selection apart', async () => {
    const dev = start()
    dev.context.selectRun('run_dev')
    dev.arrangement.setDock(dock)
    await nextTick()

    setActiveServer({ id: 'second', hostId: 'h_second' })
    const second = start()
    // the placement came along, and the other server's run did not
    expect(second.arrangement.dock).toEqual(dock)
    expect(second.context.main.run.id).toBeNull()

    second.context.selectRun('run_second')
    second.arrangement.setDock({ grid: 'moved' })
    await nextTick()
    expect((saved(`${KEY}:h_second`)['links'] as { A: { run: { id: string } } }).A.run.id).toBe('run_second')
    expect(saved(`${KEY}:h_second`)['dock']).toBeNull()
    expect((saved(KEY)['links'] as { A: { run: { id: string } } }).A.run.id).toBe('run_dev')
    expect(saved(KEY)['dock']).toEqual({ grid: 'moved' })

    sessionStorage.removeItem(`${KEY}:h_second`)
    const again = start()
    expect(again.context.main.run.id).toBe('run_second')
    expect(again.arrangement.dock).toEqual({ grid: 'moved' })
  })
})
