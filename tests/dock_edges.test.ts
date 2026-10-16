import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import DockEdges from '@/components/dock/DockEdges.vue'
import { DOCK_EDGES, useDockStore } from '@/stores/dock_store'

/**
 * The dock's own edges: there only while a panel is dragged, showing the room a panel dropped on
 * one will take, and docking it there. Where they stand on screen needs a browser — `dock.spec.ts`.
 */
let mounted: VueWrapper | null = null

async function mountDragging(): Promise<VueWrapper> {
  useDockStore().dragging = { panel: 'runs' }
  mounted = mount(DockEdges)
  await nextTick()
  return mounted
}

describe('DockEdges', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('is not there while nothing is dragged', () => {
    mounted = mount(DockEdges)
    expect(mounted.find('.dock-edge').exists()).toBe(false)
  })

  it('offers every edge while a panel is dragged, and shows the room under the pointer', async () => {
    const wrapper = await mountDragging()
    expect(wrapper.findAll('.dock-edge').map(edge => edge.attributes('data-edge'))).toEqual([...DOCK_EDGES])
    expect(wrapper.find('.dock-edge-preview').exists()).toBe(false)

    await wrapper.find('[data-edge="bottom"]').trigger('dragenter')
    expect(wrapper.find('.dock-edge-preview').classes()).toContain('bottom')
    await wrapper.find('[data-edge="bottom"]').trigger('dragleave')
    expect(wrapper.find('.dock-edge-preview').exists()).toBe(false)
  })

  it('docks along the edge it is dropped on', async () => {
    const wrapper = await mountDragging()
    const dockToEdge = vi.spyOn(useDockStore(), 'dockToEdge')
    await wrapper.find('[data-edge="left"]').trigger('drop')
    expect(dockToEdge).toHaveBeenCalledWith('left')
  })

  // a drag abandoned with Escape, or dropped on one of dockview's own targets, ends here too
  it('takes its edges away when the drag ends anywhere', async () => {
    const wrapper = await mountDragging()
    window.dispatchEvent(new Event('dragend'))
    await nextTick()
    expect(useDockStore().dragging).toBeNull()
    expect(wrapper.find('.dock-edge').exists()).toBe(false)
  })
})
