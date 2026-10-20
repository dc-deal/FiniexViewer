import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { providePanelView, useViewExpanded, useViewRows } from '@/composables/use_panel_view'
import { useArrangementStore } from '@/stores/arrangement_store'

/** A panel that shows its period list or not, the way the booking periods do. */
const Reader = defineComponent({
  setup() {
    const open = useViewExpanded('periods-table')
    return () => h('button', { class: open.value ? 'open' : 'closed', onClick: () => { open.value = !open.value } })
  },
})

/** A host naming the panel it draws, the way the dock's panel host and the bundle's column do. */
function hosted(panel: string, inner: ReturnType<typeof defineComponent> = Reader) {
  return defineComponent({
    setup() {
      providePanelView(panel)
      return () => h(inner)
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

  describe('rows of one run', () => {
    /** The rows a panel under `panel` keeps for whatever `scope` names at the moment of asking. */
    function rowsUnder(panel: string, scope: () => string | null) {
      let rows!: ReturnType<typeof useViewRows>
      const Inner = defineComponent({
        setup() {
          rows = useViewRows('fills-open', scope)
          return () => h('i')
        },
      })
      mount(hosted(panel, Inner))
      return rows
    }

    it('keeps the rows of the run on show, and finds none of them under another', () => {
      let run = 'run_1'
      const rows = rowsUnder('report-trade-history', () => run)
      rows.set('t1', true)
      expect(rows.has('t1')).toBe(true)
      run = 'run_2'
      expect(rows.has('t1')).toBe(false)
      expect(useArrangementStore().panelViews['report-trade-history']?.rows)
        .toEqual({ scope: 'run_1', keys: { 'fills-open': ['t1'] } })
    })

    /** A panel keeps ONE run's rows: the first change under another replaces them whole. */
    it('replaces the rows whole when another run writes', () => {
      let run = 'run_1'
      const rows = rowsUnder('report-trade-history', () => run)
      rows.set('t1', true)
      run = 'run_2'
      rows.set('t9', true)
      expect(useArrangementStore().panelViews['report-trade-history']?.rows)
        .toEqual({ scope: 'run_2', keys: { 'fills-open': ['t9'] } })
    })

    it('keeps nothing for a key set back off', () => {
      const rows = rowsUnder('report-trade-history', () => 'run_1')
      rows.toggle('t1')
      rows.toggle('t1')
      expect(useArrangementStore().panelViews).toEqual({})
    })

    it('keeps nothing where no run is on show to bind the rows to', () => {
      const rows = rowsUnder('report-trade-history', () => null)
      rows.set('t1', true)
      expect(rows.has('t1')).toBe(false)
      expect(useArrangementStore().panelViews).toEqual({})
    })
  })
})
