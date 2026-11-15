import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useChartOrdersStore } from '@/stores/chart_orders_store'
import * as apiClient from '@/api/api_client'
import type { OrderEventsReport } from '@/types/api/report_types'
import liveFixture from './fixtures/order_events_live.json'

vi.mock('@/api/api_client', () => ({
  getOrderEvents: vi.fn(),
}))

/**
 * The order steps of the unit on the run chart: read once per run and unit through the route's own
 * narrowing, an absence read as nothing to draw, and an answer that arrives after the reader moved on
 * dropped.
 */
const LIVE = liveFixture as unknown as OrderEventsReport
const RUN = LIVE.run_id
const UNIT = LIVE.events[0]!.scenario_name
const ask = vi.mocked(apiClient.getOrderEvents)

describe('useChartOrdersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ask.mockReset()
  })

  it('reads the unit through the route narrowed to it, once per run and unit', async () => {
    ask.mockResolvedValue(LIVE)
    const store = useChartOrdersStore()
    await store.follow({ runId: RUN, unit: UNIT })
    await store.follow({ runId: RUN, unit: UNIT })
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledWith(RUN, UNIT)
    expect(store.events).toHaveLength(LIVE.events.length)
  })

  it('holds nothing where the run wrote no stream, and forgets the steps where no unit is on show', async () => {
    ask.mockResolvedValueOnce({ absent: true, cause: 'artifact_not_produced', detail: '' })
    const store = useChartOrdersStore()
    await store.follow({ runId: RUN, unit: UNIT })
    expect(store.events).toEqual([])
    expect(store.error).toBeNull()
    ask.mockResolvedValueOnce(LIVE)
    await store.follow({ runId: RUN, unit: 'other' })
    expect(store.events.length).toBeGreaterThan(0)
    await store.follow(null)
    expect(store.events).toEqual([])
  })

  it('drops an answer that arrives after another unit was chosen', async () => {
    let answerFirst: (report: OrderEventsReport) => void = () => {}
    ask.mockImplementationOnce(() => new Promise(resolve => { answerFirst = resolve }))
    ask.mockResolvedValueOnce({ ...LIVE, events: [] })
    const store = useChartOrdersStore()
    const first = store.follow({ runId: RUN, unit: UNIT })
    await store.follow({ runId: RUN, unit: 'other' })
    answerFirst(LIVE)
    await first
    await flushPromises()
    expect(store.events).toEqual([])
  })

  it('says in words why the steps could not be read, and asks again at the next follow', async () => {
    ask.mockRejectedValueOnce(new Error('network down'))
    const store = useChartOrdersStore()
    await store.follow({ runId: RUN, unit: UNIT })
    expect(store.error).toMatch(/order steps could not be read/)
    ask.mockResolvedValueOnce(LIVE)
    await store.follow({ runId: RUN, unit: UNIT })
    expect(store.error).toBeNull()
    expect(ask).toHaveBeenCalledTimes(2)
  })
})
