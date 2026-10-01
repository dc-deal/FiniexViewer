import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { AxiosError, AxiosHeaders } from 'axios'
import { useCallerStore } from '@/stores/caller_store'
import type { CallerIdentity } from '@/types/api/caller_types'
import * as apiClient from '@/api/api_client'

vi.mock('@/api/api_client', () => ({
  getCaller: vi.fn(),
}))

const ENFORCED: CallerIdentity = {
  enforced: true,
  client: 'viewer',
  account: 'viewer-op',
  account_kind: 'person',
  display_name: 'Viewer-Operator',
  grants: ['brokers:*', 'bars:*', 'deployments:*', 'reports:*', 'sweeps:*'],
  note: 'dev proxy holds it, browser never receives it',
}

/** With gating off the server verifies nothing, so every identity field comes back null. */
const UNENFORCED: CallerIdentity = {
  enforced: false,
  client: null,
  account: null,
  account_kind: null,
  display_name: null,
  grants: null,
  note: null,
}

function httpError(status: number): AxiosError {
  const error = new AxiosError('refused')
  error.response = {
    status,
    statusText: '',
    data: {},
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

describe('useCallerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(apiClient.getCaller).mockReset()
  })

  it('starts with nothing and claims nothing', () => {
    const store = useCallerStore()
    expect(store.state).toBe('idle')
    expect(store.identity).toBeNull()
    expect(store.readAt).toBeNull()
  })

  it('keeps the identity the server gave once gating is on', async () => {
    vi.mocked(apiClient.getCaller).mockResolvedValue(ENFORCED)
    const store = useCallerStore()
    await store.load()
    expect(store.state).toBe('ready')
    expect(store.identity).toEqual(ENFORCED)
    expect(store.displayName).toBe('Viewer-Operator')
  })

  /**
   * The case a 200 makes look fine and is not: with gating off nothing verifies a presented token,
   * so an answer arrives for a caller whose credential was never checked. It gets its own state
   * rather than being folded into `ready`, because the two mean opposite things to a reader.
   */
  it('separates "no identity was checked" from "here is the identity"', async () => {
    vi.mocked(apiClient.getCaller).mockResolvedValue(UNENFORCED)
    const store = useCallerStore()
    await store.load()
    expect(store.state).toBe('unenforced')
    expect(store.displayName).toBeNull()
  })

  it('falls back to the account where the token carries no display name', async () => {
    vi.mocked(apiClient.getCaller).mockResolvedValue({ ...ENFORCED, display_name: null })
    const store = useCallerStore()
    await store.load()
    expect(store.displayName).toBe('viewer-op')
  })

  // a refused credential and a server that did not answer are different problems with different fixes
  it('tells a refused token apart from an unreachable server', async () => {
    const store = useCallerStore()

    vi.mocked(apiClient.getCaller).mockRejectedValue(httpError(401))
    await store.load()
    expect(store.state).toBe('unauthenticated')

    vi.mocked(apiClient.getCaller).mockRejectedValue(new Error('network down'))
    await store.load()
    expect(store.state).toBe('failed')
  })

  it('drops a previous identity rather than showing a stale one after a failure', async () => {
    vi.mocked(apiClient.getCaller).mockResolvedValue(ENFORCED)
    const store = useCallerStore()
    await store.load()
    expect(store.identity).not.toBeNull()

    vi.mocked(apiClient.getCaller).mockRejectedValue(httpError(401))
    await store.load()
    expect(store.identity).toBeNull()
    expect(store.readAt).toBeNull()
  })

  // the identity is only ever as of the instant it was read, so the instant is part of the answer
  it('records when the answer arrived', async () => {
    vi.mocked(apiClient.getCaller).mockResolvedValue(ENFORCED)
    const store = useCallerStore()
    const before = Date.now()
    await store.load()
    expect(store.readAt).toBeInstanceOf(Date)
    expect(store.readAt!.getTime()).toBeGreaterThanOrEqual(before)
  })

  // nothing is cached: a re-read is what stands in for a server restart nobody can observe
  it('asks again on every load', async () => {
    vi.mocked(apiClient.getCaller).mockResolvedValue(ENFORCED)
    const store = useCallerStore()
    await store.load()
    await store.load()
    expect(vi.mocked(apiClient.getCaller)).toHaveBeenCalledTimes(2)
  })
})
