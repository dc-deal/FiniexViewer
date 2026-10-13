import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { DockviewPanelApi } from 'dockview-vue'
import PanelHost from '@/components/dock/PanelHost.vue'
import { onPanelShownAgain } from '@/composables/use_panel_visibility'

const counts = { mounted: 0, shownAgain: 0 }

vi.mock('@/panel_kinds', () => {
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
  const kinds: Record<string, object> = {
    probe: { id: 'probe', title: 'Probe', icon: 'form-list', order: 1, opensByDefault: true, component: Probe },
    broken: { id: 'broken', title: 'Broken', icon: 'form-sheet', order: 2, opensByDefault: false, component: Broken },
  }
  return { panelKind: (id: string) => kinds[id] ?? null }
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
})
