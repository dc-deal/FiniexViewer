import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { DockviewPanelApi } from 'dockview-vue'
import PanelTab from '@/components/dock/PanelTab.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { reportKindId } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { useContextStore } from '@/stores/context_store'
import { useLayoutStore } from '@/stores/layout_store'
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

  /** A section opened as a panel goes back into the bundle by its own control, not by its close. */
  it('puts a section back into the bundle, and offers that on a section tab only', async () => {
    const dock = useDockStore()
    const back = vi.fn()
    dock.backIntoColumn = back
    const section = mount(PanelTab, { props: { kindId: reportKindId('orders'), api: fakeApi() as unknown as DockviewPanelApi } })
    await section.find('.panel-tab-back').trigger('click')
    expect(back).toHaveBeenCalledWith('orders')
    expect(section.find('.panel-tab-back').attributes('aria-label')).toBe('Back into the bundle')

    const main = mount(PanelTab, { props: { kindId: 'runs', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(main.find('.panel-tab-back').exists()).toBe(false)
  })

  /**
   * What a panel offers about itself is on its own tab, behind ⋯ (viewer#42) — for the run bundle,
   * folding its sections and resetting them. A kind with nothing to offer carries no ⋯.
   */
  it('offers the bundle\'s own commands behind ⋯, and no ⋯ where a kind has none', async () => {
    const layout = useLayoutStore()
    const collapse = vi.spyOn(layout, 'collapseAll')
    const reset = vi.spyOn(layout, 'reset')
    const bundle = mount(PanelTab, {
      props: { kindId: 'run', api: fakeApi() as unknown as DockviewPanelApi },
      attachTo: document.body,
    })
    const more = bundle.find('.panel-tab-more')
    expect(more.attributes('aria-label')).toBe('Panel commands')

    for (const [id, spy] of [['collapse-all', collapse], ['reset-bundle', reset]] as const) {
      await more.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      document.querySelector<HTMLElement>(`.menu-item[data-action="${id}"]`)!.click()
      await flushPromises()
      expect(spy, id).toHaveBeenCalledOnce()
    }
    bundle.unmount()

    for (const kindId of ['runs', 'chart', reportKindId('orders')]) {
      const other = mount(PanelTab, { props: { kindId, api: fakeApi() as unknown as DockviewPanelApi } })
      expect(other.find('.panel-tab-more').exists(), kindId).toBe(false)
    }
  })

  /**
   * The card is the one place that says a panel's links, so it opens for the keyboard too. Dockview
   * keeps the tab's focus on its own element around this one, and a click focuses it as well — so
   * only a KEYBOARD focus on that element opens it.
   */
  it('opens its card on a keyboard focus of the tab, and closes it when the focus leaves', async () => {
    const Host = defineComponent({
      render: () => h('div', { class: 'dv-tab', tabindex: 0 }, [
        h(PanelTab, { kindId: 'runs', api: fakeApi() as unknown as DockviewPanelApi }),
      ]),
    })
    const host = mount(Host, { attachTo: document.body })
    const tab = host.find('.dv-tab').element as HTMLElement
    tab.matches = (selector: string) => selector === ':focus-visible'

    tab.dispatchEvent(new FocusEvent('focusin'))
    await flushPromises()
    expect(document.querySelector('.hover-card')?.textContent).toContain('Runs')

    tab.dispatchEvent(new FocusEvent('focusout'))
    await flushPromises()
    expect(document.querySelector('.hover-card')).toBeNull()
    host.unmount()
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
    expect(card.props('title')).toBe('Run bundle · r1')
    const details = card.props('details') as Figure[]
    // what is on it, never an exact set: a new line in the card is not a defect of this one
    expect(details.find(row => row.label === 'Shows')?.value).toBeTruthy()
    expect(details.find(row => row.label === 'Status')).toMatchObject({ value: 'failed', tone: 'error' })
  })

  /**
   * A section's tab has no room for the run; its card names the whole id, so two windows comparing
   * two runs are told apart there too (viewer#42).
   */
  it('names the whole run in the card of a section panel, not on its tab', () => {
    openRun('success')
    const wrapper = mount(PanelTab, {
      props: { kindId: reportKindId('trade-history'), api: fakeApi() as unknown as DockviewPanelApi },
    })
    expect(wrapper.findComponent(HoverCard).props('title')).toBe('Trade History · r1')
    expect(wrapper.find('.panel-tab-subtitle').exists()).toBe(false)
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
