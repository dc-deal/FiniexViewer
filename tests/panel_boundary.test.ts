import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import AccordionPanel from '@/components/panels/AccordionPanel.vue'

/**
 * The boundary around one panel, and why it is not a nicety.
 *
 * Measured 2026-10-01 in a real browser: `units_absent` is null on 17 of 45 stored runs, the
 * Executive Summary read it as an array inside a computed, and the throw took ELEVEN panels off the
 * screen — the reader was left with an empty workspace because ONE section could not draw. Vue
 * unwinds a render error to the nearest component that handles it, so with nothing handling it the
 * error reached the view.
 */
const BOOM = 'rendered nothing on purpose'

/** A panel that throws while rendering, the way a computed over an unexpected null does. */
const Exploding = defineComponent({
  setup() {
    return () => {
      throw new Error(BOOM)
    }
  },
})

const Fine = defineComponent({
  setup: () => () => h('p', { class: 'fine' }, 'drawn'),
})

/**
 * A panel that throws on ONE model and not on another — which is what a real one does. The
 * exploding component above throws on every attempt, and is the other case this has to separate.
 */
const breaks = ref(true)
const Fickle = defineComponent({
  setup: () => () => {
    if (breaks.value) throw new Error(BOOM)
    return h('p', { class: 'fine' }, 'drawn')
  },
})

function mountWith(content: unknown, resetOn: unknown = 'run-a') {
  return mount(AccordionPanel, {
    props: {
      title: 'Executive Summary',
      icon: '📊',
      open: true,
      pinned: false,
      locked: false,
      resetOn,
    },
    slots: { default: () => h(content as never) },
  })
}

describe('AccordionPanel as an error boundary', () => {
  beforeEach(() => {
    // the stack belongs in the console for whoever is debugging, and nowhere near the reader
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('draws its content when nothing is wrong', () => {
    const wrapper = mountWith(Fine)
    expect(wrapper.find('.fine').exists()).toBe(true)
    expect(wrapper.find('.panel-failed').exists()).toBe(false)
    expect(wrapper.find('.panel-failed-mark').exists()).toBe(false)
  })

  it('keeps a panel that threw inside its own frame', async () => {
    const wrapper = mountWith(Exploding)
    await flushPromises()
    expect(wrapper.find('.panel-failed').text()).toContain('could not be drawn')
    // the panel is still a panel: its title and its controls are untouched
    expect(wrapper.find('.panel-title').text()).toBe('Executive Summary')
    expect(wrapper.findAll('.panel-control')).toHaveLength(3)
  })

  /** A folded panel hides the sentence, so the header has to carry the news. */
  it('marks the header, so a folded panel still says it failed', async () => {
    const wrapper = mountWith(Exploding)
    await flushPromises()
    expect(wrapper.find('.panel-failed-mark').exists()).toBe(true)
  })

  /** Never on screen (§10) — but never swallowed either, or a defect becomes invisible. */
  it('writes the error to the console and not into the page', async () => {
    const wrapper = mountWith(Exploding)
    await flushPromises()
    expect(wrapper.text()).not.toContain(BOOM)
    expect(console.error).toHaveBeenCalled()
  })

  /**
   * The failure belongs to what was being shown, not to the panel. A defect on one run must not
   * follow the reader to the next — which is why `PanelColumn` hands the model down as the signal.
   */
  it('gives a failed panel another go once it is showing something else', async () => {
    breaks.value = true
    const wrapper = mountWith(Fickle, 'run-a')
    await flushPromises()
    expect(wrapper.find('.panel-failed').exists()).toBe(true)

    // the next run carries a model this panel can draw
    breaks.value = false
    await wrapper.setProps({ resetOn: 'run-b' })
    await flushPromises()
    expect(wrapper.find('.panel-failed').exists()).toBe(false)
    expect(wrapper.find('.panel-failed-mark').exists()).toBe(false)
    expect(wrapper.find('.fine').exists()).toBe(true)
  })

  /**
   * The other half of the retry, and the one that would hang: a panel whose defect is in the code
   * rather than in one run's data throws again on the second attempt. It has to settle on the
   * frame, not loop between drawing and failing.
   */
  it('settles rather than looping where the next model fails as well', async () => {
    const wrapper = mountWith(Exploding, 'run-a')
    await flushPromises()

    await wrapper.setProps({ resetOn: 'run-b' })
    await flushPromises()
    expect(wrapper.find('.panel-failed').exists()).toBe(true)
  })
})
