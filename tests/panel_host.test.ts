import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import type { DockviewPanelApi } from 'dockview-vue'
import PanelHost from '@/components/dock/PanelHost.vue'
import { onPanelShownAgain } from '@/composables/use_panel_visibility'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useDockStore } from '@/stores/dock_store'

const counts = { mounted: 0, shownAgain: 0 }

vi.mock('@/panel_kinds', async importOriginal => {
  const Probe = defineComponent({
    setup() {
      counts.mounted += 1
      onPanelShownAgain(() => { counts.shownAgain += 1 })
      return () => h('p', { class: 'probe' }, 'drawn')
    },
  })
  const Broken = defineComponent({
    setup() {
      return () => { throw new Error('a panel that cannot draw') }
    },
  })
  const { useViewExpanded } = await import('@/composables/use_panel_view')
  const Keeper = defineComponent({
    setup() {
      // the panel asks for its own view and opens a fold; WHERE that is kept is the host's to say
      useViewExpanded('periods-table').value = true
      return () => h('p', { class: 'keeper' }, 'kept')
    },
  })
  const kinds: Record<string, object> = {
    probe: { id: 'probe', title: 'Probe', icon: 'form-list', order: 1, opensByDefault: true, component: Probe },
    broken: { id: 'broken', title: 'Broken', icon: 'form-list', order: 2, opensByDefault: false, component: Broken },
    keeper: { id: 'keeper', title: 'Keeper', icon: 'form-list', order: 3, opensByDefault: false, component: Keeper },
  }
  // the rest of the module as it is: the dock store the host reports to reads it
  return { ...await importOriginal<typeof import('@/panel_kinds')>(), panelKind: (id: string) => kinds[id] ?? null }
})

/** A panel's handle in the dock, reduced to what the host reads: is it on screen, and when that changes. */
function fakeApi(visible: boolean) {
  let listener: ((event: { isVisible: boolean }) => void) | null = null
  const api = {
    isVisible: visible,
    onDidVisibilityChange: (fn: (event: { isVisible: boolean }) => void) => {
      listener = fn
      return { dispose: () => { listener = null } }
    },
  }
  return {
    api: api as unknown as DockviewPanelApi,
    show: (isVisible: boolean) => listener?.({ isVisible }),
  }
}

describe('PanelHost', () => {
  beforeEach(() => {
    counts.mounted = 0
    counts.shownAgain = 0
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A tab behind another costs nothing until it is picked — and is not drawn twice after. */
  it('draws its panel the first time it is shown, and keeps it after', async () => {
    const dock = fakeApi(false)
    const wrapper = mount(PanelHost, { props: { kindId: 'probe', api: dock.api } })
    expect(wrapper.find('.probe').exists()).toBe(false)

    dock.show(true)
    await flushPromises()
    expect(wrapper.find('.probe').exists()).toBe(true)

    dock.show(false)
    dock.show(true)
    await flushPromises()
    expect(counts.mounted).toBe(1)
  })

  /** A docked panel stays mounted, so the list it shows is fetched again when it comes BACK. */
  it('tells its panel when it is shown again, never on the first showing', async () => {
    const dock = fakeApi(true)
    mount(PanelHost, { props: { kindId: 'probe', api: dock.api } })
    await flushPromises()
    expect(counts.shownAgain).toBe(0)

    // apart in time, as in a browser: a hide and a show in ONE tick are no change to watch
    dock.show(false)
    await flushPromises()
    dock.show(true)
    await flushPromises()
    expect(counts.shownAgain).toBe(1)
  })

  /**
   * The dock keeps which panels are on show, so one panel can ask about another: the run bundle
   * offers *Show in list* only where the run list is not already in view.
   */
  it('tells the dock whether its panel is on show, and withdraws when it goes', async () => {
    const dock = fakeApi(true)
    const wrapper = mount(PanelHost, { props: { kindId: 'probe', api: dock.api } })
    expect(useDockStore().shownIds).toEqual(['probe'])

    dock.show(false)
    expect(useDockStore().shownIds).toEqual([])
    dock.show(true)
    expect(useDockStore().shownIds).toEqual(['probe'])

    wrapper.unmount()
    expect(useDockStore().shownIds).toEqual([])
  })

  it('stops a panel that throws at its own frame, with a sentence and the stack in the console', async () => {
    const console = vi.spyOn(globalThis.console, 'error').mockImplementation(() => {})
    const wrapper = mount(PanelHost, { props: { kindId: 'broken', api: fakeApi(true).api } })
    await flushPromises()

    expect(wrapper.text()).toContain('This panel could not be drawn')
    expect(wrapper.text()).not.toContain('a panel that cannot draw')
    expect(console).toHaveBeenCalled()
  })

  it('says so for a kind this version does not know', () => {
    const wrapper = mount(PanelHost, { props: { kindId: 'retired', api: fakeApi(true).api } })
    expect(wrapper.text()).toContain('This panel could not be drawn')
  })

  /** The host names the panel it draws: what the panel keeps of its own view stands under that id. */
  it('keeps what its panel keeps of its view under the panel\'s id', async () => {
    mount(PanelHost, { props: { kindId: 'keeper', api: fakeApi(true).api } })
    await flushPromises()
    expect(useArrangementStore().panelViews['keeper']).toEqual({ expanded: { 'periods-table': true } })
  })
})
