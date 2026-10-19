import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import AppSlider from '@/components/base/AppSlider.vue'

/**
 * A share along a scale, set by a lever that opens from its handle. The lever is portalled to the
 * page's body, so it is found there rather than in the component.
 */
let mounted: VueWrapper | null = null

function mountAt(value: number): VueWrapper {
  mounted = mount(AppSlider, { props: { modelValue: value, min: 10, max: 100, step: 10, label: 'Opacity' }, attachTo: document.body })
  return mounted
}

function lever(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="slider"]')
}

describe('AppSlider', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  /** The handle says the value only where it is below the top — at the top there is nothing to say. */
  it('shows the value on its handle where it is below the top of the scale', () => {
    expect(mountAt(100).get('.slider-handle-value').text()).toBe('')
    mounted!.unmount()
    expect(mountAt(70).get('.slider-handle-value').text()).toBe('70%')
    expect(mounted!.get('button').attributes('aria-label')).toBe('Opacity: 70 %')
  })

  it('opens a vertical lever at a click, and steps the value with the arrows', async () => {
    const wrapper = mountAt(70)
    expect(lever()).toBeNull()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    const thumb = lever()!
    expect(thumb.getAttribute('aria-valuenow')).toBe('70')
    expect(thumb.getAttribute('aria-orientation')).toBe('vertical')
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[80]])
  })
})
