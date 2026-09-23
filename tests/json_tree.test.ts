import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import JsonTree from '@/components/base/JsonTree.vue'

function mountTree(value: unknown, openTo = 9) {
  return mount(JsonTree, { props: { value, openTo } })
}

describe('JsonTree', () => {
  it('names every key and shows its value', () => {
    const text = mountTree({ symbol: 'BTCUSD', lots: 0.1, enabled: true }).text()
    expect(text).toContain('symbol')
    expect(text).toContain('"BTCUSD"')
    expect(text).toContain('0.1')
    expect(text).toContain('true')
  })

  // an empty string is a value; unquoted it would read as a gap in the rendering
  it('quotes strings, so an empty one is still visible', () => {
    expect(mountTree({ note: '' }).text()).toContain('""')
  })

  it('gives array entries their index, so nothing is nameless', () => {
    const text = mountTree({ sequence: [{ direction: 'LONG' }, { direction: 'SHORT' }] }).text()
    expect(text).toContain('0')
    expect(text).toContain('1')
    expect(text).toContain('"SHORT"')
  })

  it('marks null as the different kind of value it is', () => {
    const wrapper = mountTree({ conversion_rate: null })
    expect(wrapper.find('.leaf.null').text()).toBe('null')
  })

  // a folded branch has to say whether opening it is worth it
  it('says how much a folded branch holds', () => {
    const wrapper = mountTree({ workers: { a: 1, b: 2, c: 3 } }, 1)
    expect(wrapper.text()).toContain('{3}')
  })

  it('opens only as deep as it was asked to', () => {
    const value = { outer: { inner: { deep: 'value' } } }
    expect(mountTree(value, 1).text()).not.toContain('"value"')
    expect(mountTree(value, 9).text()).toContain('"value"')
  })

  it('can start entirely folded and open on request', async () => {
    const wrapper = mountTree({ symbol: 'BTCUSD' }, 0)
    expect(wrapper.text()).not.toContain('symbol')
    await wrapper.find('.toggle').trigger('click')
    expect(wrapper.text()).toContain('symbol')
  })
})
