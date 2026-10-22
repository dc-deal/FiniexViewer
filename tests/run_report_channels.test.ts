import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { provideRunReportChannels } from '@/composables/use_run_report_channels'
import { useOrderSteps } from '@/composables/use_order_steps'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'

const RUN = '20261022_081400_0a1b2c3d'

/** Whether the order steps answer for the chosen run, as a panel below the root reads it. */
function stepsAvailable(): boolean {
  let available = (): boolean => false
  const Reader = defineComponent({
    setup() {
      available = useOrderSteps().available
      return () => null
    },
  })
  const Root = defineComponent({
    setup() {
      provideRunReportChannels()
      return () => h(Reader)
    },
  })
  mount(Root)
  return available()
}

function choose(streams: string[]): void {
  useRunsStore().runs = [{ run_id: RUN, stream_files: streams } as RunInfo]
  useContextStore().selectRun(RUN)
}

describe('provideRunReportChannels', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /**
   * The gate is the stream's own NAME. Since contract 38 a session also lists its state frames, so
   * a session that recorded those and never sent an order has a non-empty list and no order events.
   */
  it('offers the order steps only where the run names its order-event stream', () => {
    choose(['order_events.jsonl', 'state_frames.jsonl'])
    expect(stepsAvailable()).toBe(true)

    choose(['state_frames.jsonl'])
    expect(stepsAvailable()).toBe(false)

    choose([])
    expect(stepsAvailable()).toBe(false)
  })
})
