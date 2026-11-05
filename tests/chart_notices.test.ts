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
})
