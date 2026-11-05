import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { provideRunReportChannels } from '@/composables/use_run_report_channels'
import { useConfigComparison } from '@/composables/use_config_comparison'
import { useFramePlayer } from '@/composables/use_frame_player'
import { useOrderSteps } from '@/composables/use_order_steps'
import { useTickSizes } from '@/composables/use_tick_sizes'
import type { TickSizeLookup } from '@/composables/use_tick_sizes'
import { priceAt } from '@/components/runs/report_format'
import { useConfigCompareStore } from '@/stores/config_compare_store'
import { useContextStore } from '@/stores/context_store'
import { useFramePlayerStore } from '@/stores/frame_player_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import type { BrokerReport, RunInfo } from '@/types/api/report_types'

import brokerFixture from './fixtures/broker.json'

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
   * A section is given its own report and no other, so the root hands it the tick size out of the
   * broker report; a section drawn before that report arrived prints at it once it has.
   */
  it('hands the sections the tick size of the run\'s broker report, and follows it when it arrives', async () => {
    let lookup!: TickSizeLookup
    const Reader = defineComponent({
      setup() {
        lookup = useTickSizes()
        return () => h('p', { class: 'price' }, priceAt(1.1677499513751617, lookup('EURGBP_refusals_01', 'EURGBP')))
      },
    })
    const Root = defineComponent({
      setup() {
        provideRunReportChannels()
        return () => h(Reader)
      },
    })
    const wrapper = mount(Root)
    expect(lookup('EURGBP_refusals_01', 'EURGBP')).toBeNull()
    expect(wrapper.find('.price').text()).toBe('1.16774995')

    useRunReportsStore().broker = brokerFixture as unknown as BrokerReport
    await nextTick()
    expect(lookup('EURGBP_refusals_01', 'EURGBP')).toBe(0.00001)
    expect(lookup('EURGBP_refusals_01', 'USDJPY')).toBeNull()
    expect(wrapper.find('.price').text()).toBe('1.16775')
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

  /** A unit's frames belong to the run they were read for: choosing another run forgets them. */
  it('offers the player of a unit for the run on show, and forgets it when another is chosen', async () => {
    useRunsStore().runs = [{ run_id: RUN, stream_files: [] } as unknown as RunInfo, { run_id: 'next', stream_files: [] } as unknown as RunInfo]
    useContextStore().selectRun(RUN)
    const players = useFramePlayerStore()
    players.players.set('unit', {
      runId: RUN, unit: 'unit', stream: null, recording: 'ended', absence: null, error: null, loading: false,
      frames: [], cursor: null, playing: false, speed: 5,
    })
    let view: (unit: string) => unknown = () => null
    const Reader = defineComponent({
      setup() {
        view = useFramePlayer().view
        return () => null
      },
    })
    mount(defineComponent({
      setup() {
        provideRunReportChannels()
        return () => h(Reader)
      },
    }))
    expect(view('unit')).toMatchObject({ following: true, playing: false })

    useContextStore().selectRun('next')
    await nextTick()
    expect(view('unit')).toBeNull()
    expect(players.playerOf('unit')).toBeNull()
  })

  /** A comparison belongs to the run it was asked for: choosing another run lets go of it. */
  it('offers a configuration comparison for the run it was asked for, and drops it when another is chosen', async () => {
    const compare = useConfigCompareStore()
    compare.shown = RUN
    compare.other = 'run_before'
    compare.side = 'before'
    useRunsStore().runs = [{ run_id: RUN, stream_files: [] } as unknown as RunInfo, { run_id: 'next', stream_files: [] } as unknown as RunInfo]
    useContextStore().selectRun(RUN)
    let compared: () => unknown = () => null
    const Reader = defineComponent({
      setup() {
        compared = useConfigComparison().compared
        return () => null
      },
    })
    mount(defineComponent({
      setup() {
        provideRunReportChannels()
        return () => h(Reader)
      },
    }))
    expect(compared()).toMatchObject({ runId: 'run_before', side: 'before' })

    useContextStore().selectRun('next')
    await nextTick()
    expect(compared()).toBeNull()
    expect(compare.shown).toBeNull()
  })
})
