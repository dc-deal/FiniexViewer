import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LayersView from '@/views/LayersView.vue'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useDockStore } from '@/stores/dock_store'
import { useHintsStore } from '@/stores/hints_store'
import { useRunChartStore } from '@/stores/run_chart_store'

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

  it('lists the chart\'s layers front first, the candles behind the drawings and the volume behind them, under the chart\'s name', () => {
    const wrapper = mountOn('run-chart')
    expect(order(wrapper)).toEqual(['trades', 'entry-exit', 'levels', 'state-frame', 'candles', 'volume'])
    expect(wrapper.find('.fixed').text()).toContain('Candles')
    expect(wrapper.find('.chart-name').text()).toBe('Run chart')
  })

  /**
   * The volume is drawn by the chart library behind the candles: it is shown, hidden and made fainter
   * like the others, opens to what it draws, is never moved, and says what it counts.
   */
  it('offers the volume its lever and its opacity, and no place to move it to', async () => {
    const wrapper = mountOn('run-chart')
    const volume = row(wrapper, 'volume')
    expect(volume.classes()).toContain('fixed')
    expect(volume.find('[data-action="opacity"]').exists()).toBe(true)
    // no bars loaded: no price basis stated, so it counts ticks
    expect(volume.find('.layer-summary').text()).toBe('ticks per bar')
    await volume.find('[data-action="open"]').trigger('click')
    expect(row(wrapper, 'volume').find('.hint-line').text()).toContain('What traded in each bar')
    expect(row(wrapper, 'volume').find('[data-action="forms"]').exists()).toBe(false)
    await row(wrapper, 'volume').find('[data-action="show"]').trigger('click')
    expect(useArrangementStore().panelViews['run-chart']?.layers).toEqual({ hidden: ['volume'] })
  })

  /**
   * The candles are a layer too (operator, 2026-10-27): shown, hidden and fainter, never moved, and
   * drawn in the form the reader picks in their opened row.
   */
  it('offers the candles their forms, one chosen, and keeps the one picked', async () => {
    const wrapper = mountOn('run-chart')
    // the form is seen on the chart, and the closed row does not repeat it (operator, 2026-10-28)
    expect(row(wrapper, 'candles').find('.layer-summary').text()).toBe('')
    await row(wrapper, 'candles').find('[data-action="open"]').trigger('click')
    const forms = row(wrapper, 'candles').findAll('[data-action="forms"] button')
    expect(forms.map(button => button.attributes('data-form'))).toEqual(['candles', 'bars', 'line', 'area'])
    expect(row(wrapper, 'candles').find('[data-form="candles"]').attributes('aria-pressed')).toBe('true')
    await row(wrapper, 'candles').find('[data-form="line"]').trigger('click')
    expect(useArrangementStore().panelViews['run-chart']?.layers).toEqual({ forms: { candles: 'line' } })
    expect(row(wrapper, 'candles').find('.layer-summary').text()).toBe('')
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

  /**
   * The row opens what is set less often, plain beneath the one hint that explains it (operator,
   * 2026-10-28). The levels and the line each offer every position, and each keeps its own:
   * switching one leaves the other as it was — and the closed row does not repeat the switch.
   */
  it('opens a row to its hint and its plain option, and switches the option there', async () => {
    const wrapper = mountOn('run-chart')
    expect(wrapper.find('.layer-options').exists()).toBe(false)
    await row(wrapper, 'levels').find('[data-action="open"]').trigger('click')
    expect(row(wrapper, 'levels').find('[data-action="open"]').attributes('aria-expanded')).toBe('true')
    expect(row(wrapper, 'levels').find('.layer-options .hint-line').text()).toContain('The stop loss and take profit')
    expect(row(wrapper, 'levels').find('[data-action="front"]').exists()).toBe(false)
    await row(wrapper, 'levels').find('[data-action="option"]').trigger('click')
    expect(useArrangementStore().panelViews['run-chart']?.layers).toEqual({ options: { 'every-position': true } })
    expect(row(wrapper, 'levels').find('.layer-summary').text()).not.toContain('every position')
    await row(wrapper, 'entry-exit').find('[data-action="open"]').trigger('click')
    await row(wrapper, 'entry-exit').find('[data-action="option"]').trigger('click')
    expect(useArrangementStore().panelViews['run-chart']?.layers)
      .toEqual({ options: { 'every-position': true, 'every-position-line': true } })
  })

  /**
   * A lever that changes nothing on screen looked broken: the row says what the layer waits for — the
   * reader's next step where there is one (operator, 2026-10-28) — and the hint below says why.
   */
  it('says what a shown layer that draws nothing waits for, and says nothing of a hidden one', async () => {
    // a window of bars, and no trade, no position looked at: the drawing layers have nothing to draw.
    // The bars are the loader's and read-only on the store; the panel reads only that there are some
    Object.defineProperty(useRunChartStore(), 'bars', { value: [{ time: 1_761_886_800, open: 1, high: 1, low: 1, close: 1 }] })
    const wrapper = mountOn('run-chart')
    const summary = row(wrapper, 'levels').find('.layer-summary')
    expect(summary.text()).toBe('pick a position')
    expect(row(wrapper, 'trades').find('.layer-summary').text()).toBe('none in view')
    expect(row(wrapper, 'state-frame').find('.layer-summary').text()).toBe('no frame on show')
    // why stands in the hint below, the one pattern an explanation takes — never in a browser tooltip
    expect(summary.attributes('title')).toBeUndefined()
    // and below the list, in full, front first, as hints in one box: a narrow panel cuts the row's
    // word to a letter
    const below = () => wrapper.findAll('.hint-line').at(-1)!.text()
    expect(below()).toContain('The entry–exit line is drawn for the position looked at')
    expect(below().indexOf('The trades')).toBeLessThan(below().indexOf('The levels'))
    await row(wrapper, 'levels').find('[data-action="show"]').trigger('click')
    expect(row(wrapper, 'levels').find('.layer-summary').text()).toBe('')
    expect(below()).not.toContain('The levels are drawn')
    // every position asked for, no position is waited for: there is simply none in view
    await row(wrapper, 'entry-exit').find('[data-action="open"]').trigger('click')
    await row(wrapper, 'entry-exit').find('[data-action="option"]').trigger('click')
    expect(row(wrapper, 'entry-exit').find('.layer-summary').text()).toContain('none in view')
  })

  /** Dragged by its grip, never a fixed layer: the candles and the volume keep their places at the back. */
  it('offers a grip on every movable layer and none on a fixed one', () => {
    const wrapper = mountOn('run-chart')
    expect(row(wrapper, 'trades').find('.layer-grip').text()).toBe('⠿')
    expect(row(wrapper, 'candles').find('.layer-grip').text()).toBe('')
    expect(row(wrapper, 'volume').find('.layer-grip').text()).toBe('')
  })

  /** With no bars the chart says so itself: no layer is said to draw nothing, and no hint stands below. */
  it('says nothing of a layer drawing nothing while the chart has no bars at all', () => {
    const wrapper = mountOn('run-chart')
    expect(row(wrapper, 'levels').find('.layer-summary').text()).toBe('')
    expect(wrapper.findAll('.hint-line')).toHaveLength(1)
  })

  /**
   * A row opens only onto something (operator, on screen 2026-10-29): the volume has no option and no
   * forms, so once its hint is put away it shows no marker and a click opens nothing. A layer with an
   * option still opens onto it.
   */
  it('opens a row with nothing left to show onto nothing at all', async () => {
    useHintsStore().ban('layer-volume')
    useHintsStore().ban('layer-trades')
    const wrapper = mountOn('run-chart')
    expect(row(wrapper, 'volume').find('.layer-marker').text()).toBe('')
    expect(row(wrapper, 'volume').find('[data-action="open"]').attributes('aria-expanded')).toBeUndefined()
    await row(wrapper, 'volume').find('[data-action="open"]').trigger('click')
    expect(row(wrapper, 'volume').find('.layer-options').exists()).toBe(false)
    await row(wrapper, 'trades').find('[data-action="open"]').trigger('click')
    expect(row(wrapper, 'trades').find('[data-action="option"]').exists()).toBe(true)
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
