import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RunReportView from '@/views/RunReportView.vue'
import PanelColumn from '@/components/panels/PanelColumn.vue'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'

/** The run the reader chose, as the index states it. */
function chooseRun(overrides: Partial<RunInfo> = {}): void {
  useRunsStore().runs = [{
    run_id: '20261012_205715_c3b41fff',
    group: 'simulation',
    name: 'set_x',
    start_time: '',
    has_reports: true,
    ...overrides,
  } as RunInfo]
  useContextStore().selectRun('20261012_205715_c3b41fff')
}

describe('RunReportView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /** A narrow panel ends the line in an ellipsis instead of wrapping it over three; the whole is on hover. */
  it('names the chosen run in one line, with the whole of it on hover', () => {
    chooseRun()
    const wrapper = mount(RunReportView)
    expect(wrapper.find('.chosen-id').text()).toBe('20261012_205715_c3b41fff')
    const meta = wrapper.find('.chosen-meta')
    expect(meta.text()).toBe('simulation · set_x')
    expect(meta.attributes('title')).toBe('simulation · set_x')
  })

  /** The list is a panel of its own: changing the run brings it to the front, nothing unfolds here. */
  it('brings the run list to the front to change the run', async () => {
    chooseRun()
    const opened: string[] = []
    useDockStore().reveal = (kind: string, reason: string) => { opened.push(`${kind} ${reason}`); return true }
    const wrapper = mount(RunReportView)
    await wrapper.findAll('button').find(node => node.text().includes('Change run'))!.trigger('click')
    expect(opened).toEqual(['runs command'])
  })

  it('says that no run is chosen, and offers the run list', async () => {
    const opened: string[] = []
    useDockStore().reveal = (kind: string, reason: string) => { opened.push(`${kind} ${reason}`); return true }
    const wrapper = mount(RunReportView)
    expect(wrapper.text()).toContain('No run is chosen')
    expect(wrapper.findComponent(PanelColumn).exists()).toBe(false)
    await wrapper.findAll('button').find(node => node.text().includes('Show the run list'))!.trigger('click')
    expect(opened).toEqual(['runs command'])
  })

  it('says which stored run is gone from the index', () => {
    useRunsStore().unknownRunId = 'gone_run'
    const wrapper = mount(RunReportView)
    expect(wrapper.text()).toContain('gone_run')
  })

  /** The summary failing is a section failing: it says so, and the sections that did load stay. */
  it('says a summary that failed above the column, and keeps the column', async () => {
    chooseRun()
    useRunsStore().summaryError = 'Could not load the run summary: boom'
    const wrapper = mount(RunReportView)
    await flushPromises()
    expect(wrapper.find('.notice.failed').text()).toContain('boom')
    expect(wrapper.findComponent(PanelColumn).exists()).toBe(true)
  })
})

