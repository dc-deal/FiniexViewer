import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import AboutDialog from '@/components/AboutDialog.vue'

let mounted: VueWrapper | null = null

/** The dialog is portalled to the end of the document, so it is read there, as a reader meets it. */
function frame(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.app-dialog')
}

describe('AboutDialog', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  /**
   * The chart library's licence asks for a link to tradingview.com on a page the reader can open;
   * it stands here, in place of the logo the chart no longer draws.
   */
  it('links the chart library to tradingview.com, in a tab of its own', async () => {
    mounted = mount(AboutDialog, { attachTo: document.body, props: { open: true } })
    await flushPromises()
    const link = frame()!.querySelector<HTMLAnchorElement>('a.about-link')!
    expect(link.textContent).toBe('TradingView Lightweight Charts')
    expect(link.getAttribute('href')).toBe('https://www.tradingview.com/')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.parentElement!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Charts: TradingView Lightweight Charts (Apache 2.0)')
  })
})
