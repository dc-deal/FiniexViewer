import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppSwitch from '@/components/base/AppSwitch.vue'

/** The app's one on/off control outside a menu: a lever, announced as a switch, its word part of the click. */
describe('AppSwitch', () => {
  it('says its state as a switch, and asks for the other one at a click', async () => {
    const wrapper = mount(AppSwitch, { props: { modelValue: false } })
    const lever = wrapper.get('button')
    expect(lever.attributes('role')).toBe('switch')
    expect(lever.attributes('aria-checked')).toBe('false')
    await lever.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('stands on when on, and its word is part of what is clicked', async () => {
    const wrapper = mount(AppSwitch, { props: { modelValue: true, label: 'signs' } })
    expect(wrapper.get('button').classes()).toContain('on')
    expect(wrapper.get('button').attributes('aria-checked')).toBe('true')
    await wrapper.get('.switch-label').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  /** A dense row's lever, beside a glyph control it would otherwise outweigh (2026-10-28). */
  it('takes the compact size where asked, and the full one otherwise', () => {
    expect(mount(AppSwitch, { props: { modelValue: false, compact: true } }).get('button').classes()).toContain('compact')
    expect(mount(AppSwitch, { props: { modelValue: false } }).get('button').classes()).not.toContain('compact')
  })

  it('asks for nothing while it cannot be used', async () => {
    const wrapper = mount(AppSwitch, { props: { modelValue: false, disabled: true } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
