import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ServersSettings from '@/components/ServersSettings.vue'
import ServerSwitch from '@/components/ServerSwitch.vue'
import * as serversApi from '@/api/servers_api'
import { useServersStore } from '@/stores/servers_store'
import { DEFAULT_SERVER_ID } from '@/types/server_types'
import type { ServerEntry, ServerList } from '@/types/server_types'

vi.mock('@/active_server', async importOriginal => ({
  ...await importOriginal<typeof import('@/active_server')>(),
  reloadPage: vi.fn(),
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
  id: 'second', name: 'Second', url: 'http://localhost:8010', isDefault: false, hasToken: true, tunnel: null, tunnelState: 'none', tunnelMessage: null, hostId: 'h_second',
}
const LIST: ServerList = { servers: [DEFAULT, SECOND], secretFiles: ['run/key', 'run/known_hosts'] }

let mounted: VueWrapper | null = null

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.mocked(serversApi.listServers).mockResolvedValue(LIST)
  vi.mocked(serversApi.updateServer).mockReset().mockResolvedValue(LIST)
  vi.mocked(serversApi.createServer).mockReset().mockResolvedValue(LIST)
  vi.mocked(serversApi.removeServer).mockReset().mockResolvedValue(LIST)
  vi.mocked(serversApi.probeServer).mockReset().mockResolvedValue({
    connected: true, health: null, contract: 48, caller: null, tokenRefused: false, hostId: 'h_dev',
  })
  await useServersStore().load()
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
  document.body.innerHTML = ''
})

async function settings() {
  mounted = mount(ServersSettings, { attachTo: document.body })
  await flushPromises()
  return mounted
}

async function pick(wrapper: VueWrapper, id: string) {
  await wrapper.find(`[data-server="${id}"]`).trigger('click')
  await flushPromises()
}

describe('ServerSwitch', () => {
  it('names the server on show, always', async () => {
    mounted = mount(ServerSwitch, { attachTo: document.body })
    await flushPromises()
    expect(mounted.find('.server-name').text()).toBe('Development')
    expect(mounted.find('[data-icon="status-server"]').exists()).toBe(true)
  })

  it('says nothing about another installation where nothing happened', async () => {
    mounted = mount(ServerSwitch, { attachTo: document.body })
    await flushPromises()
    expect(mounted.find('.server-moved').exists()).toBe(false)
  })
})

describe('ServersSettings', () => {
  it('lists every server', async () => {
    const wrapper = await settings()
    expect(wrapper.findAll('.server-row').map(row => row.text())).toEqual(['Development', 'Second'])
  })

  it('keeps the default server\'s address and token out of reach, and it cannot be removed', async () => {
    const wrapper = await settings()
    expect(wrapper.find('input[name="server-url"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('input[name="server-token"]').exists()).toBe(false)
    expect(wrapper.find('[data-action="remove-server"]').exists()).toBe(false)
  })

  it('renames the default server and sends nothing else', async () => {
    const wrapper = await settings()
    await wrapper.find('input[name="server-name"]').setValue('Dev')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(serversApi.updateServer).toHaveBeenCalledWith(DEFAULT_SERVER_ID, { name: 'Dev' })
  })

  /** It cannot be read back, so an empty field means "leave it", never "clear it". */
  it('starts the token empty and sends one only when it was filled', async () => {
    const wrapper = await settings()
    await pick(wrapper, 'second')
    const token = wrapper.find<HTMLInputElement>('input[name="server-token"]')
    expect(token.element.value).toBe('')
    expect(token.attributes('type')).toBe('password')

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(serversApi.updateServer).mock.lastCall![1]).not.toHaveProperty('token')

    await token.setValue('new-token')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(serversApi.updateServer).mock.lastCall![1]).toMatchObject({ token: 'new-token' })
    expect(token.element.value).toBe('')
  })

  it('creates a new server from an empty form', async () => {
    const wrapper = await settings()
    await wrapper.find('[data-action="new-server"]').trigger('click')
    await flushPromises()
    await wrapper.find('input[name="server-name"]').setValue('Third')
    await wrapper.find('input[name="server-url"]').setValue('http://localhost:8020')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(serversApi.createServer).toHaveBeenCalledWith({ name: 'Third', url: 'http://localhost:8020', tunnel: null })
  })

  it('sends the tunnel where one is switched on', async () => {
    const wrapper = await settings()
    await pick(wrapper, 'second')
    await wrapper.find('[role="switch"]').trigger('click')
    await flushPromises()
    await wrapper.find('input[name="tunnel-account"]').setValue('reader')
    await wrapper.find('input[name="tunnel-host"]').setValue('example.org')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(serversApi.updateServer).mock.lastCall![1].tunnel).toMatchObject({
      account: 'reader', host: 'example.org', localPort: 8010, remotePort: 8000,
    })
  })

  it('asks twice before it removes', async () => {
    const wrapper = await settings()
    await pick(wrapper, 'second')
    const remove = wrapper.find('[data-action="remove-server"]')
    await remove.trigger('click')
    await flushPromises()
    expect(serversApi.removeServer).not.toHaveBeenCalled()
    await wrapper.find('[data-action="remove-server"]').trigger('click')
    await flushPromises()
    expect(serversApi.removeServer).toHaveBeenCalledWith('second')
  })

  it('shows what a check found', async () => {
    vi.mocked(serversApi.probeServer).mockResolvedValue({
      connected: true,
      health: { status: 'ok', version: '1.5.0', started_at: '', uptime_s: 1 },
      contract: 47,
      caller: { display_name: 'Reader', account: 'reader', grants: ['reports:*'] } as never,
      tokenRefused: false,
      hostId: 'h_second',
    })
    const wrapper = await settings()
    await pick(wrapper, 'second')
    await wrapper.find('[data-action="check-server"]').trigger('click')
    await flushPromises()
    const text = wrapper.text()
    for (const shown of ['1.5.0', '47', 'h_second', 'Reader', 'reports:*']) expect(text).toContain(shown)
  })

  it('says no connection, and nothing about what runs behind it', async () => {
    vi.mocked(serversApi.probeServer).mockResolvedValue({
      connected: false, health: null, contract: null, caller: null, tokenRefused: false, hostId: null,
    })
    const wrapper = await settings()
    await pick(wrapper, 'second')
    await wrapper.find('[data-action="check-server"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-state="no-connection"]').text()).toContain('No connection to this server: tunnel or host')
  })

  it('tells a refused token from a connection that failed', async () => {
    vi.mocked(serversApi.probeServer).mockResolvedValue({
      connected: true, health: null, contract: null, caller: null, tokenRefused: true, hostId: null,
    })
    const wrapper = await settings()
    await pick(wrapper, 'second')
    await wrapper.find('[data-action="check-server"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-state="token-refused"]').exists()).toBe(true)
    expect(wrapper.find('[data-state="no-connection"]').exists()).toBe(false)
  })
})
