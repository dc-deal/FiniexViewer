import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartCard from '@/components/base/ChartCard.vue'
import type { FigureCard } from '@/types/figure_types'

const CARD: FigureCard = {
  title: 'pos_1 · long 0.1',
  details: [{ label: 'Net', value: '-0.40 EUR', tone: 'negative' }],
}

/** The card's inline placement, for a pointer at (x, y) in a frame of 800 × 400. */
function placement(x: number, y: number): string {
  return mount(ChartCard, { props: { card: CARD, x, y, width: 800, height: 400 } })
    .find('.chart-card').attributes('style') ?? ''
}

describe('ChartCard', () => {
  it('says what the card says: its heading, and its pairs in their tone', () => {
    const card = mount(ChartCard, { props: { card: CARD, x: 100, y: 80, width: 800, height: 400 } })
    expect(card.find('.card-title').text()).toBe('pos_1 · long 0.1')
    expect(card.find('dd').text()).toBe('-0.40 EUR')
    expect(card.find('dd').classes()).toContain('negative')
  })

  /** Beside the pointer, never over it — so it never covers the mark it describes. */
  it('stands beside the pointer on the side with more room', () => {
    // in the top left quarter: to the right of the pointer and below it
    expect(placement(100, 80)).toContain('left: 114px')
    expect(placement(100, 80)).toContain('top: 94px')
    // in the bottom right quarter: to the left and above
    expect(placement(700, 350)).toContain('right: 114px')
    expect(placement(700, 350)).toContain('bottom: 64px')
  })

  it('keeps to the room on its side, so it never leaves the frame', () => {
    expect(placement(100, 80)).toContain('max-width: 672px')
    expect(placement(100, 80)).toContain('max-height: 292px')
  })
})
