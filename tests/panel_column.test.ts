import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import PanelColumn from '@/components/panels/PanelColumn.vue'

/**
 * A ResizeObserver that reports when the test says so — the column remembers the height a panel's
 * content last had, and only a measurement can hand it one.
 */
let report: ((entries: ResizeObserverEntry[]) => void) | null = null
const observed: Element[] = []

class MeasuringObserver {
  constructor(callback: (entries: ResizeObserverEntry[]) => void) { report = callback }
  observe(element: Element): void { observed.push(element) }
  unobserve(): void {}
  disconnect(): void {}
}

function mountColumn(sources: Record<string, unknown>, pending: Record<string, boolean> = {}) {
  return mount(PanelColumn, { props: { sources, pending }, attachTo: document.body })
}

describe('PanelColumn', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    observed.length = 0
    report = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** A section this run does not carry is skipped, never shown empty. */
  it('leaves out a panel whose section the run does not carry', () => {
    const wrapper = mountColumn({ runSummary: null })
    expect(wrapper.find('[data-panel="executive"]').exists()).toBe(false)
  })

  /** One on its way is neither: it keeps its place, so a run change does not collapse the column. */
  it('keeps a panel whose section is on its way, saying so instead of showing nothing', () => {
    const wrapper = mountColumn({ runSummary: null }, { runSummary: true })
    const panel = wrapper.find('[data-panel="executive"]')
    expect(panel.exists()).toBe(true)
    const loading = panel.find('.panel-loading')
    expect(loading.attributes('aria-busy')).toBe('true')
    expect(loading.text()).toContain('Loading')
  })

  it('keeps the room the panel took while its section loads', async () => {
    vi.stubGlobal('ResizeObserver', MeasuringObserver)
    const wrapper = mountColumn({ runSummary: null }, { runSummary: true })
    await flushPromises()
    const body = observed.find(element => (element as HTMLElement).dataset['heightOf'] === 'executive')!
    report!([{ target: body, contentRect: { height: 240 } } as unknown as ResizeObserverEntry])

    await wrapper.setProps({ sources: { runSummary: null }, pending: { runSummary: false } })
    await wrapper.setProps({ sources: { runSummary: null }, pending: { runSummary: true } })
    const loading = wrapper.find('[data-panel="executive"] .panel-loading')
    expect((loading.element as HTMLElement).style.minHeight).toBe('240px')
  })
})
