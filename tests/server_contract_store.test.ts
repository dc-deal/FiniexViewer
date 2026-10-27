import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { EXPECTED_CONTRACT } from '@/api/expected_contract'
import { useServerContractStore } from '@/stores/server_contract_store'

// the stamp the client hands on — fed by hand, as the client's own test feeds the interceptor
const stamp = vi.hoisted(() => ({ listener: (contract: number): void => { void contract } }))

vi.mock('@/api/api_client', () => ({
  onContractStamp: (listener: (contract: number) => void) => { stamp.listener = listener },
}))

describe('useServerContractStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('knows nothing before an answer, and says nothing where the server serves our contract', () => {
    const store = useServerContractStore()
    expect([store.served, store.differs]).toEqual([null, false])
    stamp.listener(EXPECTED_CONTRACT)
    expect([store.served, store.differs]).toEqual([EXPECTED_CONTRACT, false])
  })

  /** A server restarted under another contract shows on its next answer, either way. */
  it('follows the stamp of the latest answer, whichever way it moves', () => {
    const store = useServerContractStore()
    stamp.listener(EXPECTED_CONTRACT + 1)
    expect([store.served, store.differs]).toEqual([EXPECTED_CONTRACT + 1, true])
    stamp.listener(EXPECTED_CONTRACT - 2)
    expect(store.differs).toBe(true)
    stamp.listener(EXPECTED_CONTRACT)
    expect(store.differs).toBe(false)
  })
})
