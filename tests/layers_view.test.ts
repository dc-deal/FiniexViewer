import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LayersView from '@/views/LayersView.vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useDockStore } from '@/stores/dock_store'

/**
 * The Layers panel over the chart last in front: its drawing layers front first, one row each —
 * the lever shows or hides a layer, the row opens its option and its place — kept with that chart's
 * own view. The lever of the opacity is the slider's own, tested there.
 */
let mounted: VueWrapper | null = null

function mountOn(chart: string | null): VueWrapper {
  useDockStore().lastChart = chart
  mounted = mount(LayersView)
  return mounted
}

function row(wrapper: VueWrapper, layer: string) {
  return wrapper.find(`[data-layer="${layer}"]`)
}

function order(wrapper: VueWrapper): (string | undefined)[] {
  return wrapper.findAll('[data-layer]').map(entry => entry.attributes('data-layer'))
}

describe('LayersView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('lists the chart\'s layers front first, the candles behind them all, under the chart\'s name', () => {
    const wrapper = mountOn('run-chart')
    expect(order(wrapper)).toEqual(['trades', 'entry-exit', 'levels'])
    expect(wrapper.find('.fixed').text()).toContain('Candles')
    expect(wrapper.find('.chart-name').text()).toBe('Run chart')
  })

  /** Grey is enough: the lever's position says it, and nothing in the row changes its size. */
  it('hides a layer at its lever, and the row goes grey', async () => {
    const wrapper = mountOn('run-chart')
    await row(wrapper, 'levels').find('[data-action="show"]').trigger('click')
    expect(row(wrapper, 'levels').attributes('data-shown')).toBe('false')
    expect(row(wrapper, 'levels').classes()).toContain('off')
    expect(row(wrapper, 'levels').find('[data-action="show"]').attributes('aria-checked')).toBe('false')
    expect(useArrangementStore().panelViews['run-chart']?.layers).toEqual({ hidden: ['levels'] })
  })

  /** The row opens what is set less often; a layer without an option offers its place only. */
  it('opens a row for its option and its place, and switches the option there', async () => {
    const wrapper = mountOn('run-chart')
    expect(wrapper.find('.layer-options').exists()).toBe(false)
    await row(wrapper, 'entry-exit').find('[data-action="open"]').trigger('click')
    expect(row(wrapper, 'entry-exit').find('[data-action="option"]').exists()).toBe(false)
    await row(wrapper, 'levels').find('[data-action="open"]').trigger('click')
    expect(row(wrapper, 'levels').find('[data-action="open"]').attributes('aria-expanded')).toBe('true')
    await row(wrapper, 'levels').find('[data-action="option"]').trigger('click')
    expect(useArrangementStore().panelViews['run-chart']?.layers).toEqual({ options: { 'every-position': true } })
    expect(row(wrapper, 'levels').find('.layer-summary').text()).toContain('every position')
  })

  /** A lever that changes nothing on screen looked broken: the row says there is nothing to draw, and why. */
  it('says a shown layer has nothing to draw, and why, and says nothing of a hidden one', async () => {
    // no run chosen: the run chart has nothing to draw on any layer
    const wrapper = mountOn('run-chart')
    const summary = row(wrapper, 'levels').find('.layer-summary')
    expect(summary.text()).toBe('nothing to draw')
    expect(summary.attributes('title')).toContain('position looked at')
    await row(wrapper, 'levels').find('[data-action="show"]').trigger('click')
    expect(row(wrapper, 'levels').find('.layer-summary').text()).toBe('')
  })

  /** One place at a time; the front layer goes no further forward, the back one no further back. */
  it('moves a layer one place, and offers no step past either end', async () => {
    const wrapper = mountOn('run-chart')
    await row(wrapper, 'trades').find('[data-action="open"]').trigger('click')
    await row(wrapper, 'levels').find('[data-action="open"]').trigger('click')
    expect(row(wrapper, 'trades').find('[data-action="front"]').attributes('disabled')).toBeDefined()
    expect(row(wrapper, 'levels').find('[data-action="back"]').attributes('disabled')).toBeDefined()
    await row(wrapper, 'levels').find('[data-action="front"]').trigger('click')
    expect(order(wrapper)).toEqual(['trades', 'levels', 'entry-exit'])
  })

  it('puts the handle of each layer\'s opacity in its row', () => {
    const wrapper = mountOn('run-chart')
    expect(row(wrapper, 'trades').find('[data-action="opacity"]').attributes('aria-label')).toBe('Opacity: 100 %')
  })

  it('says what to open where no chart that draws layers is open', () => {
    const wrapper = mountOn(null)
    expect(wrapper.find('[data-layer]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Open the run chart to arrange what it draws')
  })
})
