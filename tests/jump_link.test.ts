import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import JumpLink from '@/components/base/JumpLink.vue'

describe('JumpLink', () => {
  /** A jump asks the host to put the reader somewhere; it loads no address, so it is no anchor. */
  it('is a button in the link shape of the one button component', () => {
    const wrapper = mount(JumpLink, { slots: { default: '20261012_074826_88026ae2' } })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.classes()).toContain('app-button')
    expect(wrapper.classes()).toContain('link')
  })

  /** The link's ink says it is clicked; an arrow on some links read as a second kind (2026-10-28). */
  it('names its target and wears nothing beside it', () => {
    const wrapper = mount(JumpLink, { slots: { default: 'pos_eurgbp_1' } })
    expect(wrapper.find('.jump-name').text()).toBe('pos_eurgbp_1')
    expect(wrapper.text()).toBe('pos_eurgbp_1')
  })

  /** What the click does is the caller's to say, and so is the class a test or a layout finds it by. */
  it('hands the click, the title and the class of its caller to the button', async () => {
    let clicks = 0
    const wrapper = mount(JumpLink, {
      attrs: { class: 'to-trades', title: 'Show this position', onClick: () => { clicks += 1 } },
      slots: { default: 'pos_eurgbp_1' },
    })
    expect(wrapper.classes()).toContain('to-trades')
    expect(wrapper.attributes('title')).toBe('Show this position')
    await wrapper.trigger('click')
    expect(clicks).toBe(1)
  })
})
