import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppIcon from '@/components/base/AppIcon.vue'

describe('AppIcon', () => {
  /** The meaning is on the element, so a test or a reader finds an icon by what it says. */
  it('draws the registry\'s drawing for a meaning and says which meaning it is', () => {
    const orders = mount(AppIcon, { props: { name: 'kind-orders' } })
    expect(orders.element.tagName.toLowerCase()).toBe('svg')
    expect(orders.attributes('data-icon')).toBe('kind-orders')
    expect(orders.classes()).toContain('tabler-icon-hourglass')
    expect(orders.classes()).toContain('app-icon')

    // a second meaning draws its own drawing, not the first one again
    const broker = mount(AppIcon, { props: { name: 'kind-broker' } })
    expect(broker.classes()).toContain('tabler-icon-building-bank')
    expect(broker.classes()).not.toContain('tabler-icon-hourglass')
  })

  /** An icon travels with a word, and the word is what a screen reader reads out. */
  it('is hidden from a screen reader', () => {
    expect(mount(AppIcon, { props: { name: 'kind-orders' } }).attributes('aria-hidden')).toBe('true')
  })

  /** It takes the colour of where it sits — a role colour is the caller's, never the drawing's. */
  it('draws in the colour of its element, with the stroke the registry settled on', () => {
    const wrapper = mount(AppIcon, { props: { name: 'kind-broker' } })
    expect(wrapper.attributes('stroke')).toBe('currentColor')
    expect(wrapper.attributes('stroke-width')).toBe('2')
  })
})
