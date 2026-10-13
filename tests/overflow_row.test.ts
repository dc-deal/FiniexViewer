import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import OverflowRow from '@/components/base/OverflowRow.vue'
import { stubOverflowWidths as stubWidths } from './overflow_harness'

const ITEMS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']

let mounted: VueWrapper | null = null

async function mountRow(endFrom?: number): Promise<VueWrapper> {
  mounted = mount(OverflowRow, {
    // mount() does not infer the row's item type, so the key reads an unknown
    props: { items: ITEMS, itemKey: (item: unknown) => String(item), moreLabel: 'More', endFrom },
    slots: {
      item: '<span class="probe">{{ params.item }}</span>',
      menu: '<span v-for="item in params.hidden" :key="item" class="menu-probe">{{ item }}</span>',
    },
    attachTo: document.body,
  })
  await flushPromises()
  return mounted
}

function cellsOf(wrapper: VueWrapper, gone: boolean): string[] {
  return wrapper.findAll('.overflow-cell')
    .filter(cell => cell.classes().includes('overflow-gone') === gone)
    .map(cell => cell.text())
}

describe('OverflowRow', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = null
    vi.restoreAllMocks()
  })

  /** The wider the row, the less waits behind the control — until nothing does and it is gone. */
  it('shows every item and no control where the row has room for all of them', async () => {
    stubWidths(1000, 100, 40)
    const wrapper = await mountRow()
    expect(cellsOf(wrapper, true)).toEqual([])
    expect(wrapper.find('.overflow-more-cell').classes()).toContain('overflow-idle')
    expect(wrapper.emitted('overflow')!.at(-1)).toEqual([0])
  })

  it('puts what does not fit behind the control, from the end and in order', async () => {
    // control 40, then 100 per item: 140, 240, 340, 440 > 350
    stubWidths(350, 100, 40)
    const wrapper = await mountRow()
    expect(cellsOf(wrapper, false)).toEqual(['alpha', 'beta', 'gamma'])
    expect(cellsOf(wrapper, true)).toEqual(['delta', 'epsilon'])
    expect(wrapper.find('.overflow-more').text()).toBe('+2 ▾')
    expect(wrapper.emitted('overflow')!.at(-1)).toEqual([2])
  })

  /** An item behind the control is laid out to be measured, and is out of reach for everything else. */
  it('takes a hidden item out of reach of the keyboard and of a screen reader', async () => {
    stubWidths(350, 100, 40)
    const wrapper = await mountRow()
    const gone = wrapper.findAll('.overflow-cell.overflow-gone')
    expect(gone.length).toBeGreaterThan(0)
    for (const cell of gone) {
      expect(cell.attributes('aria-hidden')).toBe('true')
      expect(cell.attributes('inert')).toBeDefined()
    }
  })

  it('hands the menu exactly what waits behind the control', async () => {
    stubWidths(350, 100, 40)
    const wrapper = await mountRow()
    await wrapper.find('.overflow-more').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const listed = [...document.querySelectorAll('.menu-probe')].map(node => node.textContent)
    expect(listed).toEqual(['delta', 'epsilon'])
  })

  /** A group of actions stands at the end while it fits; once it has gone, the control takes its place. */
  it('stands the end group at the end, and the control there once that group has gone', async () => {
    stubWidths(1000, 100, 40)
    const wide = await mountRow(3)
    expect(wide.findAll('.overflow-cell')[3]!.classes()).toContain('overflow-end')
    wide.unmount()
    vi.restoreAllMocks()

    stubWidths(350, 100, 40)
    const narrow = await mountRow(3)
    expect(narrow.findAll('.overflow-cell.overflow-end')).toHaveLength(0)
    expect(narrow.find('.overflow-more-cell').classes()).toContain('overflow-end')
  })
})
