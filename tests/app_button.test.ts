import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppButton from '@/components/base/AppButton.vue'

describe('AppButton', () => {
  it('renders what it was given', () => {
    expect(mount(AppButton, { slots: { default: 'Restore defaults' } }).text())
      .toBe('Restore defaults')
  })

  /**
   * `solid` is a control with a surface of its own; `quiet` is an action inside a line of text and
   * must not stamp a box into a sentence.
   */
  it('is solid unless asked to be quiet', () => {
    expect(mount(AppButton).classes()).toContain('solid')
    expect(mount(AppButton, { props: { variant: 'quiet' } }).classes()).toContain('quiet')
  })

  /**
   * `aria-pressed` turns a button into a TOGGLE for a screen reader. A plain button that carries
   * it claims a state it does not have, so it is present only where `active` is actually used.
   */
  it('announces a toggle only where it is one', () => {
    expect(mount(AppButton).attributes('aria-pressed')).toBeUndefined()
    expect(mount(AppButton, { props: { active: false } }).attributes('aria-pressed'))
      .toBeUndefined()
    expect(mount(AppButton, { props: { active: true } }).attributes('aria-pressed')).toBe('true')
  })

  it('marks the chosen one of a group', () => {
    expect(mount(AppButton, { props: { active: true } }).classes()).toContain('active')
    expect(mount(AppButton).classes()).not.toContain('active')
  })

  // The native attribute, so the browser blocks the click rather than a handler declining it.
  it('is genuinely disabled, not merely styled as it', async () => {
    const wrapper = mount(AppButton, { props: { disabled: true } })
    expect(wrapper.attributes('disabled')).toBeDefined()
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('passes the click on when it is not disabled', async () => {
    const wrapper = mount(AppButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  // A button inside a form would submit it; every button here is an action, never a submit.
  it('never submits a form by accident', () => {
    expect(mount(AppButton).attributes('type')).toBe('button')
  })

  it('takes less room where a row of them has to fit', () => {
    expect(mount(AppButton).classes()).toContain('normal')
    expect(mount(AppButton, { props: { size: 'compact' } }).classes()).toContain('compact')
  })

  /**
   * The distinction `marked` exists for. A facet's popover trigger holds a state worth showing —
   * values are picked — but it is a DISCLOSURE: the primitive already gives it `aria-expanded`,
   * and `aria-pressed` beside that would announce two roles at once. So `marked` takes the chosen
   * look and says nothing, while what such a control states in words carries the meaning.
   */
  it('wears the chosen look without announcing a toggle', () => {
    const marked = mount(AppButton, { props: { marked: true } })
    expect(marked.classes()).toContain('active')
    expect(marked.attributes('aria-pressed')).toBeUndefined()
  })

  it('still announces the real toggle', () => {
    const toggle = mount(AppButton, { props: { active: true } })
    expect(toggle.classes()).toContain('active')
    expect(toggle.attributes('aria-pressed')).toBe('true')
  })
})
