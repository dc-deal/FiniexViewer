import { describe, it, expect } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import RuleHeading from '@/components/base/RuleHeading.vue'

/** The heading that parts a panel into blocks: its words between two rules, at the panel's own size. */
describe('RuleHeading', () => {
  it('is a heading with its words, and what stands in their line, between its rules', () => {
    const wrapper = mount(RuleHeading, {
      slots: { default: () => ['USD', h('span', { class: 'scope' }, 'whole run')] },
    })
    const heading = wrapper.get('h3.rule-heading')
    expect(heading.get('.rule-heading-words').text()).toBe('USDwhole run')
    expect(heading.find('.rule-heading-words .scope').exists()).toBe(true)
  })

  /** A caller's class lands on the heading itself, so a panel can name its heading for a test or a rule. */
  it('wears the class it is given', () => {
    const wrapper = mount(RuleHeading, { attrs: { class: 'currency-title' }, slots: { default: () => 'EUR' } })
    expect(wrapper.get('h3').classes()).toEqual(expect.arrayContaining(['rule-heading', 'currency-title']))
    expect(wrapper.text()).toBe('EUR')
  })
})
