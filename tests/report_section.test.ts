import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ReportSection from '@/components/dock/ReportSection.vue'
import ConfigPanel from '@/components/runs/ConfigPanel.vue'
import TradeHistoryPanel from '@/components/runs/TradeHistoryPanel.vue'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { RunInfo } from '@/types/api/report_types'
import runConfigFixture from './fixtures/run_config_live.json'

/** The run the reader chose, as the index states it. */
function chooseRun(): void {
  useRunsStore().runs = [{ run_id: 'r1' } as RunInfo]
  useContextStore().selectRun('r1')
}

function mountSection(sectionId: string) {
  return mount(ReportSection, { props: { sectionId } })
}

describe('ReportSection', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /** The same component the column draws, with the same model — beside the column, not in it. */
  it('draws its section with the model the column would hand it', () => {
    chooseRun()
    useRunReportsStore().config = runConfigFixture
    const panel = mountSection('config').findComponent(ConfigPanel)
    expect(panel.exists()).toBe(true)
    expect(panel.props('model')).toEqual(runConfigFixture)
  })

  /** The same address the column gives a section, so a jump and a test find it in either place. */
  it('carries the address the column gives the section', () => {
    expect(mountSection('trade-history').attributes('data-panel')).toBe('trade-history')
  })

  it('stands while its section is on its way, saying so', () => {
    chooseRun()
    useRunReportsStore().loadingTradeHistory = true
    expect(mountSection('trade-history').find('.panel-loading').exists()).toBe(true)
  })

  /** A selection never moves the layout: the panel stays, and says why it is empty. */
  it('says why, in the backend\'s own words, where the run has no such section', () => {
    chooseRun()
    useRunReportsStore().absences = {
      tradeHistory: { absent: true, cause: 'artifact_not_produced', detail: 'This run closed no position' },
    }
    expect(mountSection('trade-history').find('.notice.absent').text()).toBe('This run closed no position')
  })

  /** Which pipeline writes which section is the backend's rule — said neutrally, never guessed. */
  it('says it neutrally where the run never wrote the section', () => {
    chooseRun()
    expect(mountSection('trade-history').find('.notice.absent').text()).toBe('This run carries no such section')
  })

  it('says that no run is chosen, where none is', () => {
    expect(mountSection('trade-history').find('.notice.absent').text()).toContain('No run is chosen')
  })

  /**
   * A run restored from storage has no index row until the index has arrived. The panel said "No
   * run is chosen" through every first load; it is loading, and says nothing until it knows.
   */
  it('stands loading while the index is on its way, a run already chosen', () => {
    useContextStore().selectRun('r1')
    useRunsStore().loadingRuns = true
    const wrapper = mountSection('trade-history')
    expect(wrapper.find('.panel-loading').exists()).toBe(true)
    expect(wrapper.find('.notice.absent').exists()).toBe(false)
  })

  it('names the run the index no longer holds, rather than saying none is chosen', () => {
    useContextStore().selectRun('r9')
    useRunsStore().unknownRunId = 'r9'
    expect(mountSection('trade-history').find('.notice.absent').text())
      .toBe('The run you had open is no longer in the index: r9')
  })

  /** An index that failed is a failure — said with the error mark, never as a plain absence. */
  it('says an index that could not be read as a failure, in the error role', () => {
    useContextStore().selectRun('r1')
    useRunsStore().indexError = 'Could not load the run index: down'
    const wrapper = mountSection('trade-history')
    expect(wrapper.find('.notice.failed').text()).toBe('Could not load the run index: down')
    expect(wrapper.find('.notice.failed [data-icon="status-error"]').exists()).toBe(true)
    expect(wrapper.find('.notice.absent').exists()).toBe(false)
  })

  /** Every failure among what it reads says so — the column leaves it to this panel. */
  it('says every failure among the slots it reads', () => {
    chooseRun()
    useRunReportsStore().errors = { tradeHistory: 'Could not load the trade history: boom' }
    const wrapper = mountSection('trade-history')
    expect(wrapper.find('.notice.failed').text()).toContain('boom')
    expect(wrapper.find('.notice.absent').exists()).toBe(false)
    // and the section itself is not drawn without a model to draw
    expect(wrapper.findComponent(TradeHistoryPanel).exists()).toBe(false)
  })

  /** Narrowed figures are FRAMED, as in the column, so they are never read as the whole run's. */
  it('is framed while the run is narrowed to scenarios', () => {
    chooseRun()
    useRunsStore().toggleUnit('EURGBP_partial_close')
    expect(mountSection('trade-history').classes()).toContain('narrowed')
  })

  /** A frame says *a part is shown* — untrue of a list that still shows every row, or of figures it does not change. */
  it('is not framed where the narrowing only marks rows, or does not reach the section', () => {
    chooseRun()
    useRunsStore().toggleUnit('EURGBP_partial_close')
    expect(mountSection('scenario-roster').classes()).not.toContain('narrowed')
    expect(mountSection('executive').classes()).not.toContain('narrowed')
  })
})
