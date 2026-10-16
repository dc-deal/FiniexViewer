import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { DockviewPanelApi } from 'dockview-vue'
import PanelTab from '@/components/dock/PanelTab.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { reportKindId } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { RunInfo } from '@/types/api/report_types'
import type { Figure } from '@/types/figure_types'

function fakeApi() {
  return { title: 'stored title', close: vi.fn() }
}

/** The run the reader has open, as the index states it — only the grade matters here. */
function openRun(outcome: string): void {
  useRunsStore().runs = [{ run_id: 'r1', run_outcome: outcome } as RunInfo]
  useContextStore().selectRun('r1')
}

describe('PanelTab', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /** The icon is the FORM — a list, a chart — and the title tells two lists apart. */
  it('shows the form of its kind and the kind\'s title', () => {
    const wrapper = mount(PanelTab, { props: { kindId: 'chart', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(wrapper.find('[data-icon="form-chart"]').exists()).toBe(true)
    expect(wrapper.find('.panel-tab-title').text()).toBe('Free chart')
  })

  it('closes its panel, and the click goes no further than the button', async () => {
    const api = fakeApi()
    const outside = vi.fn()
    const wrapper = mount(PanelTab, {
      props: { kindId: 'runs', api: api as unknown as DockviewPanelApi },
      attrs: { onClick: outside },
    })
    await wrapper.find('.panel-tab-close').trigger('click')
    expect(api.close).toHaveBeenCalledOnce()
    expect(outside).not.toHaveBeenCalled()
  })

  /** The ✕ hides, alike for every panel — the Panels menu shows it again where it stood. */
  it('names what the close button does, for a pointer and for a screen reader', () => {
    const wrapper = mount(PanelTab, { props: { kindId: 'runs', api: fakeApi() as unknown as DockviewPanelApi } })
    const close = wrapper.find('.panel-tab-close')
    expect(close.attributes('aria-label')).toBe('Hide panel')
    expect(close.attributes('title')).toBe('Hide — the Panels menu shows it again')
  })

  /** A section opened as a panel goes back into the column by its own control, not by its close. */
  it('puts a section back into the column, and offers that on a section tab only', async () => {
    const dock = useDockStore()
    const back = vi.fn()
    dock.backIntoColumn = back
    const section = mount(PanelTab, { props: { kindId: reportKindId('orders'), api: fakeApi() as unknown as DockviewPanelApi } })
    await section.find('.panel-tab-back').trigger('click')
    expect(back).toHaveBeenCalledWith('orders')
    expect(section.find('.panel-tab-back').attributes('aria-label')).toBe('Back into the run report')

    const main = mount(PanelTab, { props: { kindId: 'runs', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(main.find('.panel-tab-back').exists()).toBe(false)
  })

  /** Two windows comparing two runs tell them apart by the tab; the list's tab names no run. */
  it('names the chosen run on the tab of the run report, and on no other', () => {
    openRun('success')
    const report = mount(PanelTab, { props: { kindId: 'run', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(report.find('.panel-tab-subtitle').text()).toBe('· r1')
    const list = mount(PanelTab, { props: { kindId: 'runs', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(list.find('.panel-tab-subtitle').exists()).toBe(false)
  })

  it('falls back to the stored title for a kind it does not know', () => {
    const wrapper = mount(PanelTab, { props: { kindId: 'retired', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(wrapper.find('.panel-tab-title').text()).toBe('stored title')
  })

  /** The backend's grade of the open run, where it is not a success — the mark with its word. */
  it('marks the tab of the run report with the grade of a run that failed, in the error role', () => {
    openRun('failed')
    const wrapper = mount(PanelTab, { props: { kindId: 'run', api: fakeApi() as unknown as DockviewPanelApi } })
    const mark = wrapper.find('.panel-tab-status')
    expect(mark.attributes('aria-label')).toBe('failed')
    expect(mark.classes()).toContain('error')
    expect(mark.find('[data-icon="status-error"]').exists()).toBe(true)
  })

  it('marks a run that finished with errors in the warning role', () => {
    openRun('finished_with_errors')
    const wrapper = mount(PanelTab, { props: { kindId: 'run', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(wrapper.find('.panel-tab-status').classes()).toContain('warning')
    expect(wrapper.find('[data-icon="status-warning"]').exists()).toBe(true)
  })

  /** Where everything went well, the tab says nothing at all. */
  it('says nothing for a run that succeeded, or where no run is open', () => {
    const empty = mount(PanelTab, { props: { kindId: 'run', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(empty.find('.panel-tab-status').exists()).toBe(false)

    openRun('success')
    const success = mount(PanelTab, { props: { kindId: 'run', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(success.find('.panel-tab-status').exists()).toBe(false)
  })

  it('hands its card what the panel is for, and the status in words', () => {
    openRun('failed')
    const wrapper = mount(PanelTab, { props: { kindId: 'run', api: fakeApi() as unknown as DockviewPanelApi } })
    const card = wrapper.findComponent(HoverCard)
    expect(card.props('title')).toBe('Run · r1')
    const details = card.props('details') as Figure[]
    expect(details.map(row => row.label)).toEqual(['Shows', 'Status'])
    expect(details[1]).toMatchObject({ value: 'failed', tone: 'error' })
  })

  /** The panel stands with nothing of the chosen run to show — said by the title, never by hiding. */
  it('dims the title of a section panel the chosen run has nothing for', () => {
    useRunsStore().runs = [{ run_id: 'r1' } as RunInfo]
    useContextStore().selectRun('r1')
    const wrapper = mount(PanelTab, { props: { kindId: 'report-trade-history', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(wrapper.find('.panel-tab-title').classes()).toContain('muted')
  })

  it('marks a section panel whose section could not be loaded, with the word', () => {
    useRunReportsStore().errors = { tradeHistory: 'Could not load the trade history: boom' }
    const wrapper = mount(PanelTab, { props: { kindId: 'report-trade-history', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(wrapper.find('.panel-tab-status').attributes('data-status')).toBe('could not be loaded')
  })
})
