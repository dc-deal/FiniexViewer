import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TimelineChart from '@/components/base/TimelineChart.vue'
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

  it('states what the scale means when the caller says so', () => {
    expect(mountChart([lane('a', [[0, 1]])], 0, 1, { scaleNote: 'wall clock' }).text())
      .toContain('wall clock')
  })

  // A rule marks a boundary every lane shares. It is drawn inside each lane rather than as one
  // overlay, so it lands in the 2px surface gap between two adjacent spans — the only place a
  // boundary that falls exactly on a span edge can be seen.
  it('rules each marker across every lane, at its position on the scale', () => {
    const wrapper = mountChart(
      [lane('a', [[0, 50]]), lane('b', [[50, 100]])], 0, 100, { markers: [50] }
    )
    const rules = wrapper.findAll('.rule')
    expect(rules).toHaveLength(2)
    expect(leftOf(rules[0]?.attributes('style'))).toBeCloseTo(50)
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

    // an evenly spaced tick can land inside a stretch that was removed, and would then name a
    // moment the chart does not show
    it('moves its ticks to the edges of what it kept', () => {
      const wrapper = mountChart(spaced, 0, 920, { collapseGapsLongerThan: 100 })
      const ticks = wrapper.findAll('.tick').map(node => node.text())
      expect(ticks).toEqual(['0', '10', '910', '920'])
    })
  })

  it('renders nothing at all when there is no lane', () => {
    expect(mountChart([]).find('.timeline').exists()).toBe(false)
  })
})
