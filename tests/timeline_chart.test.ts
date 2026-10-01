import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TimelineChart from '@/components/base/TimelineChart.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import type { TimelineLane } from '@/types/timeline_types'

function lane(id: string, spans: [number, number][]): TimelineLane {
  return {
    id,
    label: id,
    spans: spans.map(([from, to], index) => ({
      id: `${id}-${index}`,
      from,
      to,
      label: `s${index}`,
      tone: 'flat',
      title: `${id} ${from}-${to}`,
    })),
  }
}

function mountChart(lanes: TimelineLane[], from = 0, to = 100, extra: object = {}) {
  return mount(TimelineChart, {
    props: { lanes, from, to, format: (v: number) => String(Math.round(v)), ...extra },
  })
}

function leftOf(style: string | undefined): number {
  return Number(/left:\s*([\d.]+)%/.exec(style ?? '')?.[1] ?? -1)
}

function widthOf(style: string | undefined): number {
  return Number(/width:\s*([\d.]+)%/.exec(style ?? '')?.[1] ?? -1)
}

describe('TimelineChart', () => {
  it('places a span as a percentage of the scale it was given', () => {
    const wrapper = mountChart([lane('a', [[25, 75]])])
    const style = wrapper.find('.span').attributes('style')
    expect(leftOf(style)).toBeCloseTo(25)
    expect(widthOf(style)).toBeCloseTo(50)
  })

  it('gives every lane its own row, in the order supplied', () => {
    const wrapper = mountChart([lane('first', [[0, 10]]), lane('second', [[10, 20]])])
    const labels = wrapper.findAll('.lane-label').map(node => node.text())
    expect(labels).toEqual(['first', 'second'])
  })

  // A span outside the scale is a caller error, and drawing it off the edge hides it instead of
  // showing it wrong. Clamped, so it stays visible at the boundary it exceeded.
  it('clamps a span that reaches past the scale rather than drawing it off the edge', () => {
    const wrapper = mountChart([lane('a', [[-50, 150]])])
    const style = wrapper.find('.span').attributes('style')
    expect(leftOf(style)).toBe(0)
    expect(widthOf(style)).toBe(100)
  })

  // A scale of no length divides by zero in the naive formula and writes NaN into the style, which
  // renders as an invisible chart rather than as an error.
  it('survives a scale with no length at all', () => {
    const wrapper = mountChart([lane('a', [[5, 5]])], 5, 5)
    expect(wrapper.html()).not.toContain('NaN')
    expect(wrapper.findAll('.span')).toHaveLength(1)
  })

  it('draws the axis above the lanes, with the requested number of ticks', () => {
    const wrapper = mountChart([lane('a', [[0, 100]])], 0, 100, { ticks: 3 })
    const ticks = wrapper.findAll('.tick').map(node => node.text())
    expect(ticks).toEqual(['0', '50', '100'])
    // the axis row precedes the first lane in document order
    expect(wrapper.html().indexOf('axis-row')).toBeLessThan(wrapper.html().indexOf('lane-row'))
  })

  /**
   * The two extreme labels hang INWARDS, which is a layout property and not decoration. A `mid`
   * label at 100 % is pulled back visually by a transform, but a transform does not shrink the
   * LAYOUT box — so half the label stayed past the chart's right edge and the panel around it
   * offered a scrollbar for 67 px of nothing. Scrolling that phantom then slid the lane-label
   * column out of view, which is how `GBPUSD_blocks_01` came to read as `locks_01`.
   */
  it('hangs the first and last labels inwards, so neither reaches past the chart', () => {
    const wrapper = mountChart([lane('a', [[0, 100]])], 0, 100, { ticks: 4 })
    const edges = wrapper.findAll('.tick').map(node => node.classes()
      .find(name => ['start', 'mid', 'end'].includes(name)))
    expect(edges).toEqual(['start', 'mid', 'mid', 'end'])
  })

  // two ticks is the floor, and then BOTH of them are extremes
  it('makes both labels extremes where the axis carries only two', () => {
    const wrapper = mountChart([lane('a', [[0, 100]])], 0, 100, { ticks: 2 })
    const edges = wrapper.findAll('.tick').map(node => node.classes()
      .find(name => ['start', 'mid', 'end'].includes(name)))
    expect(edges).toEqual(['start', 'end'])
  })

  // The note moved off the page and onto the axis itself: it is a caveat a reader wants ONCE,
  // not a paragraph under every chart.
  it('keeps what the scale means on the axis, within reach rather than in the way', () => {
    const wrapper = mountChart([lane('a', [[0, 1]])], 0, 1, { scaleNote: 'wall clock' })
    expect(wrapper.find('.axis').attributes('title')).toBe('wall clock')
  })


  /**
   * Breaking a TIME axis is honest only because of what is removed: cutting an EMPTY stretch
   * leaves every drawn length untouched, while COMPRESSING it would claim a proportion the data
   * does not have. These three hold that distinction.
   */
  describe('a broken axis', () => {
    // two stretches of equal length, 900 units of nothing between them
    const spaced = [lane('a', [[0, 10]]), lane('b', [[910, 920]])]

    it('stays linear when nothing asks it to collapse', () => {
      const wrapper = mountChart(spaced, 0, 920)
      expect(wrapper.findAll('.gap')).toHaveLength(0)
      const widths = wrapper.findAll('.span').map(node => widthOf(node.attributes('style')))
      expect(widths[0]).toBeLessThan(2)
    })

    it('removes an empty stretch longer than the threshold and names it', () => {
      const wrapper = mountChart(spaced, 0, 920, {
        collapseGapsLongerThan: 100,
        formatGap: (length: number) => `${length} idle`,
      })
      // one break, drawn once per lane plus its label on the axis
      expect(wrapper.findAll('.gap')).toHaveLength(spaced.length)
      expect(wrapper.find('.gap-label').text()).toBe('900 idle')
    })

    // the property that makes the break legitimate: equal durations stay equal
    it('keeps two equally long spans equally wide across the break', () => {
      const wrapper = mountChart(spaced, 0, 920, { collapseGapsLongerThan: 100 })
      const widths = wrapper.findAll('.span').map(node => widthOf(node.attributes('style')))
      expect(widths).toHaveLength(2)
      expect(widths[0]).toBeCloseTo(widths[1] as number, 5)
      // and they now occupy a real share of the plot instead of a sliver
      expect(widths[0]).toBeGreaterThan(20)
    })

    it('leaves a gap shorter than the threshold in place', () => {
      const wrapper = mountChart(spaced, 0, 920, { collapseGapsLongerThan: 1000 })
      expect(wrapper.findAll('.gap')).toHaveLength(0)
    })

    /**
     * Two things at once. An evenly spaced tick can land inside a stretch that was removed and
     * would name a moment the chart does not show — so the labels follow the kept pieces. And a
     * piece gets ONE label rather than two: its edges can sit closer together than a single label
     * is wide, and two of them then overprint into a smear.
     */
    it('labels each kept piece once, as the range it covers', () => {
      const wrapper = mountChart(spaced, 0, 920, { collapseGapsLongerThan: 100 })
      const ticks = wrapper.findAll('.tick').map(node => node.text())
      expect(ticks).toEqual(['0 → 10', '910 → 920'])
    })

    it('lets the caller render that range, because only it knows the units', () => {
      const wrapper = mountChart(spaced, 0, 920, {
        collapseGapsLongerThan: 100,
        formatRange: (from: number, to: number) => `${from}..${to}`,
      })
      expect(wrapper.findAll('.tick').map(node => node.text())).toEqual(['0..10', '910..920'])
    })
  })

  /**
   * The card itself is portalled out of the page, so what the chart owes is the WIRING: every span
   * hands its own title and figures to its own card. What the card then does with them — flipping,
   * shifting, opening on focus — is held in hover_card.test.ts.
   */
  describe('the hover layer', () => {
    it('gives every span its own card, carrying the figures of that span', () => {
      const wrapper = mountChart([{
        id: 'a',
        label: 'a',
        spans: [{
          id: 'x',
          from: 0,
          to: 10,
          label: 'seg 7',
          tone: 'negative',
          title: 'demo_bot · segment 7',
          details: [{ label: 'Net P&L', value: '-207.80 USD', tone: 'negative' }],
        }],
      }])
      const cards = wrapper.findAllComponents(HoverCard)
      expect(cards).toHaveLength(1)
      expect(cards[0]?.props('title')).toBe('demo_bot · segment 7')
      expect(cards[0]?.props('details')).toEqual([
        { label: 'Net P&L', value: '-207.80 USD', tone: 'negative' },
      ])
    })

    // a span that only answers the mouse does not exist for a keyboard
    it('makes every span reachable by keyboard', () => {
      const wrapper = mountChart([lane('a', [[0, 10]])])
      expect(wrapper.find('.span').attributes('tabindex')).toBe('0')
    })
  })

  /**
   * Labels are staggered rather than shrunk or dropped: shrinking makes the axis unreadable and
   * dropping loses a moment the reader needs. The pointer is what stops a staggered label from
   * being ambiguous about which mark it belongs to.
   */
  describe('a crowded axis', () => {
    it('moves a label that would collide onto the second row', () => {
      // five ticks across the plot puts them 25 % apart — wider than the collision threshold
      const roomy = mountChart([lane('a', [[0, 100]])], 0, 100, { ticks: 5 })
      expect(roomy.findAll('.tick.row-1')).toHaveLength(0)

      // twelve puts them 9 % apart, which cannot hold a timestamp
      const crowded = mountChart([lane('a', [[0, 100]])], 0, 100, { ticks: 12 })
      expect(crowded.findAll('.tick.row-1').length).toBeGreaterThan(0)
    })

    it('gives every label a pointer to the mark it names', () => {
      const wrapper = mountChart([lane('a', [[0, 100]])], 0, 100, { ticks: 12 })
      expect(wrapper.findAll('.stem')).toHaveLength(wrapper.findAll('.tick').length)
    })
  })

  it('renders nothing at all when there is no lane', () => {
    expect(mountChart([]).find('.timeline').exists()).toBe(false)
  })
})

describe('TimelineChart — an axis of time', () => {
  const DAY = 86_400_000
  const FROM = Date.UTC(2025, 9, 13, 0, 0, 0)

  function mountTime(to: number, ticks = 5) {
    return mount(TimelineChart, {
      props: {
        lanes: [{ id: 'a', label: 'a', spans: [{ id: 's', from: FROM, to, label: 'p', tone: 'flat', title: 'p' }] }],
        from: FROM,
        to,
        ticks,
        naturalTime: true,
        format: (value: number) => new Date(value).toISOString().slice(0, 16) + 'Z',
      },
    })
  }

  /**
   * Divided evenly, a four-mark axis over two days lands on `23:59:40Z` — a quarter of the span and
   * nothing a reader recognises, which makes the stem under it mark nothing. On a natural step the
   * marks are midnights and hours.
   */
  it('marks round moments rather than equal divisions', () => {
    const labels = mountTime(FROM + 3 * DAY).findAll('.tick').map(node => node.text())
    expect(labels.every(label => label.endsWith(':00Z'))).toBe(true)
    expect(labels.some(label => label.endsWith('T00:00Z'))).toBe(true)
  })

  it('takes a finer step for a shorter span', () => {
    const labels = mountTime(FROM + 6 * 3_600_000).findAll('.tick').map(node => node.text())
    expect(labels.length).toBeGreaterThan(2)
    expect(labels.every(label => label.endsWith(':00Z'))).toBe(true)
  })

  /**
   * A span with no round moment inside it keeps its own two ends — an axis with one mark says less
   * than an axis with none.
   */
  it('keeps its own ends where no round moment falls inside', () => {
    const labels = mountTime(FROM + 30_000).findAll('.tick').map(node => node.text())
    expect(labels).toHaveLength(2)
  })

  /** Opt-in, because this chart's scale is a NUMBER and only its caller knows it is a millisecond. */
  it('divides evenly where the caller did not say the scale is time', () => {
    const wrapper = mount(TimelineChart, {
      props: {
        lanes: [{ id: 'a', label: 'a', spans: [{ id: 's', from: 0, to: 100, label: 'p', tone: 'flat', title: 'p' }] }],
        from: 0,
        to: 100,
        ticks: 3,
        format: (value: number) => String(value),
      },
    })
    expect(wrapper.findAll('.tick').map(node => node.text())).toEqual(['0', '50', '100'])
  })
})
