import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useValidationChecksStore } from '@/stores/validation_checks_store'
import * as apiClient from '@/api/api_client'
import type { ValidationCheckList } from '@/types/api/validation_check_types'
import catalogueFixture from './fixtures/validation_checks.json'

vi.mock('@/api/api_client', () => ({
  getValidationChecks: vi.fn(),
}))

const CATALOGUE: ValidationCheckList = catalogueFixture

describe('useValidationChecksStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  /** It changes only with the backend's code, so it is asked for once and kept. */
  it('reads the catalogue once and knows every check by its id', async () => {
    vi.mocked(apiClient.getValidationChecks).mockResolvedValue(CATALOGUE)
    const store = useValidationChecksStore()
    await store.load()
    await store.load()
    expect(apiClient.getValidationChecks).toHaveBeenCalledTimes(1)
    const first = CATALOGUE.checks[0]!
    expect(store.checks.get(first.check)?.title).toBe(first.title)
  })

  /** A catalogue that failed leaves the warnings their sentences, and is asked again next time. */
  it('asks again after a failure, knowing nothing meanwhile', async () => {
    vi.mocked(apiClient.getValidationChecks).mockRejectedValueOnce(new Error('Network Error'))
    const store = useValidationChecksStore()
    await store.load()
    expect(store.checks.size).toBe(0)
    vi.mocked(apiClient.getValidationChecks).mockResolvedValue(CATALOGUE)
    await store.load()
    expect(store.checks.size).toBe(CATALOGUE.checks.length)
  })
})
