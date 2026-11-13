import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartNotices from '@/components/runs/ChartNotices.vue'

/**
 * What the run chart says about what it draws, in the corner of its plot. Where there is nothing to
 * say nothing stands there; a finer timeframe is offered with how many candles it draws apart, and
 * taking it is the caller's to carry out.
 */
describe('ChartNotices', () => {
  const OFFER = { timeframe: 'M5', candles: 3, apart: 2, at: 1761886830 }

  it('says nothing where there is nothing to say', () => {
    const wrapper = mount(ChartNotices, { props: { offer: null } })
    expect(wrapper.find('.chart-notices').exists()).toBe(false)
  })

  it('offers the finer timeframe with the candles it draws apart, and hands the choice back', async () => {
    const wrapper = mount(ChartNotices, { props: { offer: OFFER } })
    const notice = wrapper.find('.chart-notice.offer')
    expect(notice.text()).toContain('Candles whose marks a finer timeframe draws apart: 2')
    const button = notice.find('.offer-timeframe')
    expect(button.text()).toBe('M5')
    await button.trigger('click')
    expect(wrapper.emitted('accept')).toHaveLength(1)
  })

  /** A worker's series on a coarser timeframe than its own is not drawn: the one that draws them is offered. */
  it('offers the timeframe that draws every series shown, and hands it back', async () => {
    const wrapper = mount(ChartNotices, { props: { offer: null, seriesOffer: { timeframe: 'M15', apart: 3 } } })
    const notice = wrapper.find('.chart-notice.series-offer')
    expect(notice.text()).toContain('Series this timeframe cannot draw: 3')
    await notice.find('[data-action="series-timeframe"]').trigger('click')
    expect(wrapper.emitted('acceptSeries')).toEqual([['M15']])
  })

  /** Read a stretch at a time, the series can stop short of the bars: said with its glyph and the instant. */
  it('says why the series could not be read, with the glyph of an error', () => {
    const wrapper = mount(ChartNotices, { props: { offer: null, seriesError: 'The indicator series could not be read: network down' } })
    expect(wrapper.find('.chart-notice.series-error').text()).toBe('✖ The indicator series could not be read: network down')
  })

  it('says where the series stop, where a read took its pages', () => {
    const at = Date.parse('2026-10-25T20:40:03Z') / 1000
    const wrapper = mount(ChartNotices, { props: { offer: null, seriesCutAt: at } })
    expect(wrapper.find('.chart-notice.series-cut').text()).toBe('⚠ Series read up to 2026-10-25 20:40:03Z')
  })
})
