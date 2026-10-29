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

  it('knows nothing before an answer', () => {
    expect(useServerContractStore().served).toBeNull()
  })

  /** A server restarted under another contract shows on its next answer, either way. */
  it('follows the stamp of the latest answer, whichever way it moves', () => {
    const store = useServerContractStore()
    stamp.listener(EXPECTED_CONTRACT + 1)
    expect(store.served).toBe(EXPECTED_CONTRACT + 1)
    stamp.listener(EXPECTED_CONTRACT - 2)
    expect(store.served).toBe(EXPECTED_CONTRACT - 2)
    stamp.listener(EXPECTED_CONTRACT)
    expect(store.served).toBe(EXPECTED_CONTRACT)
  })
})
