import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PathLabel from '@/components/base/PathLabel.vue'

/**
 * The guarantee this component has to keep: the string it is given comes out whole. Everything else
 * it does — dimming the folders, offering a break at each separator — is presentation, and a
 * presentation that loses a character would be a rendered value the backend never stated.
 */
describe('PathLabel', () => {
  const LONG = 'user_algos/touch_and_turn/touch_and_turn_range_worker.py'

  it('renders the whole path, separators included', () => {
    expect(mount(PathLabel, { props: { value: LONG } }).text()).toBe(LONG)
  })

  it('carries the name in its own ink and the folders in the secondary one', () => {
    const wrapper = mount(PathLabel, { props: { value: LONG } })
    expect(wrapper.find('.name').text()).toBe('touch_and_turn_range_worker.py')
    expect(wrapper.findAll('.folder').map(folder => folder.text()))
      .toEqual(['user_algos/', 'touch_and_turn/'])
  })

  // the break opportunities are the whole point: without them the label pushes its column sideways
  it('offers a break after every separator', () => {
    expect(mount(PathLabel, { props: { value: LONG } }).findAll('wbr').length).toBe(2)
  })

  it('treats a value with no separator as a name', () => {
    const wrapper = mount(PathLabel, { props: { value: 'bollinger' } })
    expect(wrapper.find('.name').text()).toBe('bollinger')
    expect(wrapper.findAll('.folder').length).toBe(0)
  })

  // wrapped and complete are not the same thing to somebody copying it
  it('keeps the full value reachable', () => {
    expect(mount(PathLabel, { props: { value: LONG } }).attributes('title')).toBe(LONG)
  })
})
