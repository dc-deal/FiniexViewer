import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { DockviewPanelApi } from 'dockview-vue'
import PanelTab from '@/components/dock/PanelTab.vue'

function fakeApi() {
  return { title: 'stored title', close: vi.fn() }
}

describe('PanelTab', () => {
  /** The icon is the FORM — a list, a chart — and the title tells two lists apart. */
  it('shows the form of its kind and the kind\'s title', () => {
    const wrapper = mount(PanelTab, { props: { kindId: 'chart', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(wrapper.find('[data-icon="form-chart"]').exists()).toBe(true)
    expect(wrapper.find('.panel-tab-title').text()).toBe('Chart')
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

  it('names what the close button does, for a pointer and for a screen reader', () => {
    const wrapper = mount(PanelTab, { props: { kindId: 'runs', api: fakeApi() as unknown as DockviewPanelApi } })
    const close = wrapper.find('.panel-tab-close')
    expect(close.attributes('aria-label')).toBe('Close panel')
    expect(close.attributes('title')).toBe('Close panel')
  })

  it('falls back to the stored title for a kind it does not know', () => {
    const wrapper = mount(PanelTab, { props: { kindId: 'retired', api: fakeApi() as unknown as DockviewPanelApi } })
    expect(wrapper.find('.panel-tab-title').text()).toBe('stored title')
  })
})
