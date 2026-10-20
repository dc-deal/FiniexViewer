import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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

  /**
   * What a lane MEANS is the caller's: the chart draws a way in only where the caller handed it
   * something to open, and runs that on a click without knowing what it opens.
   */
  it('puts a way in into a label only where the lane can be opened', async () => {
    let opened = 0
    const wrapper = mountChart([
      { ...lane('session', [[0, 10]]), open: () => { opened += 1 } },
      lane('unit', [[10, 20]]),
    ])
    const [session, unit] = wrapper.findAll('.lane-label')
    expect(session!.find('.jump-link').exists()).toBe(true)
    expect(unit!.find('.jump-link').exists()).toBe(false)
    expect(unit!.text()).toBe('unit')

    await session!.find('.jump-link').trigger('click')
    expect(opened).toBe(1)
  })

  /**
   * The label column keeps its own element, so its width, small font and clip stay the column's.
   * Put on the jump itself, the class lost to the link shape's inherited font — measured
   * 2026-10-12: run ids drawn at 16 px beside a 13.6 px axis caption.
   */
  it('keeps the label column as its own element around the jump', () => {
    const wrapper = mountChart([{ ...lane('session', [[0, 10]]), open: () => {} }])
    const label = wrapper.find('.lane-label')
    expect(label.element.tagName).toBe('SPAN')
    expect(label.classes()).not.toContain('jump-link')
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

  /**
   * Once the browser has measured, a label is judged in PIXELS. A share of the width was the rule
   * until 2026-10-14, and in a narrow panel it let `period 12` into a bar 40 px wide and three
   * stamps print into one. jsdom lays nothing out, so the widths are handed over by class: the
   * plot, and a probe of ten characters — 8 px each here.
   */
  describe('measured in pixels', () => {
    function stubWidths(axis: number): void {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const width = this.classList.contains('axis') ? axis : (this.classList.contains('probe') ? 80 : 0)
        return { width, height: 16, top: 0, left: 0, right: width, bottom: 16, x: 0, y: 0, toJSON: () => ({}) }
      })
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    function namedLane(spans: [number, number][]): TimelineLane {
      return {
        id: 'a',
        label: 'a',
        spans: spans.map(([from, to], index) => ({
          id: `a-${index}`, from, to, label: 'period 12', shortLabel: '12', tone: 'flat', title: 'period 12',
        })),
      }
    }

    // `period 12` takes 9 × 8 + 8 = 80 px, `12` takes 24 px; the plot is 400 px wide
    it('names a span where its characters fit, gives the short name where only that fits, else none', async () => {
      stubWidths(400)
      const wrapper = mountChart([namedLane([[0, 25], [30, 40], [50, 54]])])
      // measured on mount, drawn on the next tick
      await flushPromises()
      const captions = wrapper.findAll('.span').map(span => span.find('.span-label').exists() ? span.text() : '')
      expect(captions).toEqual(['period 12', '12', ''])
    })

    it('drops an axis label that fits on neither row, and always keeps both ends', async () => {
      stubWidths(200)
      const wrapper = mountChart([lane('a', [[0, 100]])], 0, 100, {
        ticks: 12,
        format: (v: number) => `mark ${Math.round(v)}`,
      })
      await flushPromises()
      const labels = wrapper.findAll('.tick').map(tick => tick.text())
      expect(labels.length).toBeGreaterThan(1)
      expect(labels.length).toBeLessThan(12)
      expect(labels[0]).toBe('mark 0')
      expect(labels.at(-1)).toBe('mark 100')
      // a pointer still belongs to every label that is drawn, and to no dropped one
      expect(wrapper.findAll('.stem')).toHaveLength(labels.length)
    })

    // `value 0` takes 56 px and `value 100` 72 px on a 400 px axis: centred on the ends, half of
    // each would hang past the axis
    it('slides a label along the axis until it lies wholly on it, its pointer staying at the mark', async () => {
      stubWidths(400)
      const wrapper = mountChart([lane('a', [[0, 100]])], 0, 100, { ticks: 3, format: (v: number) => `value ${v}` })
      await flushPromises()
      const ticks = wrapper.findAll('.tick')
      expect(ticks[0]!.classes()).toContain('start')
      expect(leftOf(ticks[0]!.attributes('style'))).toBe(0)
      expect(ticks.at(-1)!.classes()).toContain('start')
      expect(leftOf(ticks.at(-1)!.attributes('style'))).toBe(82)
      expect(leftOf(wrapper.findAll('.stem').at(-1)!.attributes('style'))).toBe(100)
    })

    it('draws no label wider than the whole axis', async () => {
      stubWidths(40)
      const wrapper = mountChart([lane('a', [[0, 100]])], 0, 100, { ticks: 3, format: (v: number) => `value ${v}` })
      await flushPromises()
      expect(wrapper.findAll('.tick')).toHaveLength(0)
    })

    /**
     * A bar's ring reaches 2 px past either side, so bars that start closer than that lie under the
     * next one's ring, all but the last — measured 2026-10-19, a year of daily periods read as an
     * empty lane. Here a hundred bars of 4 px each.
     */
    it('draws bars too close for their ring edge to edge, and says so beneath the lanes', async () => {
      stubWidths(400)
      const tight = lane('a', Array.from({ length: 100 }, (_, index): [number, number] => [index, index + 1]))
      const wrapper = mountChart([tight, lane('b', [[0, 50], [50, 100]])], 0, 100, { denseNote: 'edge to edge' })
      await flushPromises()
      expect(wrapper.findAll('.lane').map(node => node.classes().includes('dense'))).toEqual([true, false])
      expect(wrapper.find('.dense-note').text()).toBe('edge to edge')
    })

    it('keeps the ring where the bars stand apart, and says nothing', async () => {
      stubWidths(400)
      const wrapper = mountChart([lane('a', [[0, 20], [25, 45], [50, 70], [75, 95]])], 0, 100, {
        denseNote: 'edge to edge',
      })
      await flushPromises()
      expect(wrapper.find('.lane').classes()).not.toContain('dense')
      expect(wrapper.find('.dense-note').exists()).toBe(false)
    })
  })
})

describe('TimelineChart — an axis of time', () => {
  const DAY = 86_400_000
  const FROM = Date.UTC(2025, 9, 13, 0, 0, 0)

  function mountTime(to: number, ticks = 5, from = FROM) {
    return mount(TimelineChart, {
      props: {
        lanes: [{ id: 'a', label: 'a', spans: [{ id: 's', from, to, label: 'p', tone: 'flat', title: 'p' }] }],
        from,
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

  /**
   * Past a fortnight the step is the calendar's. Counted in days from the epoch, a year of booking
   * periods found no 365-day mark inside it and kept nothing but its two ends (measured 2026-10-19).
   */
  it('marks a year by the starts of its quarters', () => {
    const labels = mountTime(Date.UTC(2021, 11, 31, 23, 59), 4, Date.UTC(2021, 0, 1, 0, 0, 6))
      .findAll('.tick').map(node => node.text())
    expect(labels).toEqual(['2021-04-01T00:00Z', '2021-07-01T00:00Z', '2021-10-01T00:00Z'])
  })

  it('marks several years by their first days', () => {
    const labels = mountTime(Date.UTC(2024, 1, 1), 4, Date.UTC(2020, 2, 15))
      .findAll('.tick').map(node => node.text())
    expect(labels).toEqual(['2021-01-01T00:00Z', '2022-01-01T00:00Z', '2023-01-01T00:00Z', '2024-01-01T00:00Z'])
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
