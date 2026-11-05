import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import HoverCard from '@/components/base/HoverCard.vue'

// Held so it can be unmounted. Wiping document.body instead removes the node the teleport still
// holds, and the component then tears down against nothing.
let mounted: VueWrapper | null = null

function mountCard(props: Record<string, unknown> = {}) {
  mounted = mount(HoverCard, {
    attachTo: document.body,
    props: {
      title: 'demo_bot · segment 7',
      details: [
        { label: 'Reason', value: 'session_end' },
        { label: 'Net P&L', value: '-207.80 USD', tone: 'negative' },
      ],
      ...props,
    },
    slots: { default: '<button class="trigger">seg 7</button>' },
  })
  return mounted
}

/** The card is portalled out of the component, so it is read off the document, not the wrapper. */
function card(): HTMLElement | null {
  return document.querySelector('.hover-card')
}

describe('HoverCard', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('stays out of the way until something asks for it', () => {
    mountCard()
    expect(card()).toBeNull()
  })

  // the reason it exists at all: a card inside a scrolling ancestor is clipped by it, which is
  // what happened when this lived inside the timeline
  it('renders outside the component, where nothing can clip it', async () => {
    const wrapper = mountCard()
    await wrapper.find('.trigger').trigger('focus')
    await flushPromises()
    const rendered = card()
    expect(rendered).not.toBeNull()
    expect(wrapper.element.contains(rendered)).toBe(false)
  })

  it('names the thing and lists every figure it was given', async () => {
    const wrapper = mountCard()
    await wrapper.find('.trigger').trigger('focus')
    await flushPromises()
    const text = card()?.textContent ?? ''
    expect(text).toContain('demo_bot · segment 7')
    expect(text).toContain('session_end')
    expect(text).toContain('-207.80 USD')
  })

  // a path is not a pair: it may wrap at its separators, and it comes out whole, spaces included
  it('lists paths one per row, each able to wrap at its separators', async () => {
    const wrapper = mountCard({ details: undefined, paths: [' M configs/mock/a.json', '…and more'] })
    await wrapper.find('.trigger').trigger('focus')
    await flushPromises()
    const rows = [...document.querySelectorAll('.card-paths li')].map(row => row.textContent)
    expect(rows).toEqual([' M configs/mock/a.json', '…and more'])
    expect(document.querySelectorAll('.card-paths wbr').length).toBeGreaterThan(0)
    expect(document.querySelector('.card-paths [title]')).toBeNull()
  })

  // the card formats nothing; it carries the polarity the caller attached, so a figure reads the
  // same here as it does in the table
  it('keeps the polarity the caller gave a figure', async () => {
    const wrapper = mountCard()
    await wrapper.find('.trigger').trigger('focus')
    await flushPromises()
    const values = card()?.querySelectorAll('dd') ?? []
    expect(values[1]?.className).toContain('negative')
  })

  // a caveat handed to a card used to be dropped: the pair carries it, the way a FigureBlock does,
  // and a pair without one carries no empty title
  it('carries the caveat of a figure on its pair, and only where there is one', async () => {
    const wrapper = mountCard({
      details: [
        { label: 'Spread', value: 'not recorded', title: 'No quote in the data.' },
        { label: 'Swap', value: '0.00 EUR' },
      ],
    })
    await wrapper.find('.trigger').trigger('focus')
    await flushPromises()
    const labels = card()?.querySelectorAll('dt') ?? []
    const values = card()?.querySelectorAll('dd') ?? []
    expect(labels[0]?.getAttribute('title')).toBe('No quote in the data.')
    expect(values[0]?.getAttribute('title')).toBe('No quote in the data.')
    expect(labels[1]?.hasAttribute('title')).toBe(false)
    expect(values[1]?.hasAttribute('title')).toBe(false)
  })

  // opening on FOCUS and not only on hover is what makes it exist for a keyboard at all
  it('opens on focus, not only under the pointer', async () => {
    const wrapper = mountCard()
    await wrapper.find('.trigger').trigger('focus')
    await flushPromises()
    expect(card()).not.toBeNull()
  })

  it('shows the heading alone when there are no figures', async () => {
    const wrapper = mountCard({ details: [] })
    await wrapper.find('.trigger').trigger('focus')
    await flushPromises()
    expect(card()?.querySelector('.card-rows')).toBeNull()
    expect(card()?.textContent).toContain('demo_bot')
  })
})
