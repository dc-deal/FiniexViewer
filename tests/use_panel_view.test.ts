import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { providePanelView, useViewExpanded } from '@/composables/use_panel_view'
import { useArrangementStore } from '@/stores/arrangement_store'

/** A panel that shows its period list or not, the way the booking periods do. */
const Reader = defineComponent({
  setup() {
    const open = useViewExpanded('periods-table')
    return () => h('button', { class: open.value ? 'open' : 'closed', onClick: () => { open.value = !open.value } })
  },
})

/** A host naming the panel it draws, the way the dock's panel host and the bundle's column do. */
function hosted(panel: string) {
  return defineComponent({
    setup() {
      providePanelView(panel)
      return () => h(Reader)
    },
  })
}

describe('use_panel_view', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('keeps a fold under the panel its host names', async () => {
    const wrapper = mount(hosted('report-booking-periods'))
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('button').classes()).toContain('open')
    expect(useArrangementStore().panelViews['report-booking-periods']).toEqual({ expanded: { 'periods-table': true } })
  })

  /** One id in the column and as a panel of its own: the second mount finds what the first kept. */
  it('finds a kept fold again under the same panel, and only there', () => {
    useArrangementStore().setPanelView('report-booking-periods', { expanded: { 'periods-table': true } })
    expect(mount(hosted('report-booking-periods')).find('button').classes()).toContain('open')
    expect(mount(hosted('deployments')).find('button').classes()).toContain('closed')
  })

  it('keeps nothing for a fold set back to its default', async () => {
    const wrapper = mount(hosted('deployments'))
    await wrapper.find('button').trigger('click')
    await wrapper.find('button').trigger('click')
    expect(useArrangementStore().panelViews).toEqual({})
  })

  /** Without a host it behaves as it did before anything was kept: for this mount, and stored nowhere. */
  it('lives for one mount only where no host names a panel', async () => {
    const wrapper = mount(Reader)
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('button').classes()).toContain('open')
    expect(useArrangementStore().panelViews).toEqual({})
    expect(mount(Reader).find('button').classes()).toContain('closed')
  })
})
