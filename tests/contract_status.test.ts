import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ContractStatus from '@/components/ContractStatus.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { EXPECTED_CONTRACT } from '@/api/expected_contract'
import { useServerContractStore } from '@/stores/server_contract_store'
import type { Figure } from '@/types/figure_types'

function mountServing(contract: number | null) {
  useServerContractStore().served = contract
  return mount(ContractStatus)
}

describe('ContractStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** Where everything is fine nothing is printed — and before an answer nothing is known. */
  it('draws nothing where the server serves our contract, nor before it answered', () => {
    expect(mountServing(EXPECTED_CONTRACT).find('.contract-status').exists()).toBe(false)
    expect(mountServing(null).find('.contract-status').exists()).toBe(false)
  })

  it('names both contracts where they differ, and says which side has to move', () => {
    const newer = mountServing(EXPECTED_CONTRACT + 1)
    expect(newer.find('.contract-status').text()).toBe(`API contract ${EXPECTED_CONTRACT + 1} · viewer ${EXPECTED_CONTRACT}`)
    const card = newer.findComponent(HoverCard)
    expect(card.props('title')).toContain('newer contract')
    const details = card.props('details') as Figure[]
    expect(details.map(row => row.value)).toContain(`contract ${EXPECTED_CONTRACT}`)
    expect(details.map(row => row.value).join(' ')).toContain('contract-log')

    const older = mountServing(EXPECTED_CONTRACT - 1)
    expect(older.findComponent(HoverCard).props('title')).toContain('older contract')
  })
})
