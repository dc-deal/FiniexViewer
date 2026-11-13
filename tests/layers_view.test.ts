import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import LayersView from '@/views/LayersView.vue'
import { providePanelView } from '@/composables/use_panel_view'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useDockStore } from '@/stores/dock_store'
import { useHintsStore } from '@/stores/hints_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useIndicatorSeriesStore } from '@/stores/indicator_series_store'
import { useContextStore } from '@/stores/context_store'
import { useRunsStore } from '@/stores/runs_store'
import type { RunInfo } from '@/types/api/report_types'
import type { RecordedWindow } from '@/types/api/state_frame_types'
import seriesWindow from './fixtures/recorded_window_series.json'
import runsList from './fixtures/runs_list.json'

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
    expect(order(wrapper)).toEqual(['trades', 'entry-exit', 'levels', 'state-frame', 'refusals', 'periods', 'candles', 'volume'])
    expect(wrapper.find('.fixed').text()).toContain('Candles')
    expect(wrapper.find('.chart-name').text()).toBe('Run chart')
  })

  /** Grouped by the pane each is drawn in, the way TradingView's object tree is (operator, 2026-11-12). */
  it('groups the layers by the pane they are drawn in, the volume in its own while its option says so', async () => {
    const wrapper = mountOn('run-chart')
    const groups = (): (string | undefined)[] => wrapper.findAll('[data-pane-group]').map(group => group.attributes('data-pane-group'))
    expect(groups()).toEqual(['price', 'volume'])
    expect(wrapper.find('[data-pane-group="price"] .pane-heading').text()).toContain('Price pane')
    expect(wrapper.find('[data-pane-group="price"] [data-layer="candles"]').exists()).toBe(true)
    expect(wrapper.find('[data-pane-group="volume"] [data-layer="volume"]').exists()).toBe(true)

    // its option off, the volume stands in the pane of the candles, behind them
    await row(wrapper, 'volume').find('[data-action="open"]').trigger('click')
    await row(wrapper, 'volume').find('[data-action="option"]').trigger('click')
    expect(groups()).toEqual(['price'])
    expect(order(wrapper).slice(-2)).toEqual(['candles', 'volume'])
  })

  /** A pane's layers fold away together, and the fold is kept with the panel's view, as a list's is. */
  it('folds the layers of a pane away, and keeps the fold with the view of the panel', async () => {
    useDockStore().lastChart = 'run-chart'
    const Host = defineComponent({
      setup() {
        providePanelView('layers')
        return () => h(LayersView)
      },
    })
    mounted = mount(Host)
    const heading = mounted.find('[data-pane-group="price"] [data-action="fold-pane"]')
    expect(heading.attributes('aria-expanded')).toBe('true')
    await heading.trigger('click')
    expect(mounted.find('[data-layer="trades"]').exists()).toBe(false)
    expect(mounted.find('[data-pane-group="price"] [data-action="fold-pane"]').attributes('aria-expanded')).toBe('false')
    expect(mounted.find('[data-layer="volume"]').exists()).toBe(true)
    expect(useArrangementStore().panelViews['layers']?.expanded).toEqual({ 'layers-pane-price': false })
  })

  /**
   * The volume is drawn by the chart library behind the candles: it is shown, hidden and made fainter
   * like the others, opens to what it draws and to its own pane, is never moved, and says what it counts.
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
    // its own pane by default: switched off, it is kept, and the volume goes into the pane of the candles
    await row(wrapper, 'volume').find('[data-action="option"]').trigger('click')
    expect(useArrangementStore().panelViews['run-chart']?.layers).toEqual({ options: { 'own-pane': false } })
    await row(wrapper, 'volume').find('[data-action="show"]').trigger('click')
    expect(useArrangementStore().panelViews['run-chart']?.layers).toEqual({ hidden: ['volume'], options: { 'own-pane': false } })
  })

  /** The heights of the chart's panes stand beside its layers: a change here leaves the ones dragged alone. */
  it('keeps the heights the reader dragged through every change of a layer', async () => {
    const panes = { price: 1.4, volume: 1.1 }
    useArrangementStore().setPanelView('run-chart', { panes })
    const wrapper = mountOn('run-chart')
    await row(wrapper, 'volume').find('[data-action="open"]').trigger('click')
    await row(wrapper, 'volume').find('[data-action="option"]').trigger('click')
    await row(wrapper, 'volume').find('[data-action="show"]').trigger('click')
    await row(wrapper, 'trades').find('[data-action="show"]').trigger('click')
    expect(useArrangementStore().panelViews['run-chart']).toEqual({
      layers: { hidden: ['volume', 'trades'], options: { 'own-pane': false } }, panes,
    })
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
   * A row opens only onto something (operator, on screen 2026-10-29): the booking periods have no
   * option and no forms, so once their hint is put away they show no marker and a click opens
   * nothing. A layer with an option still opens onto it.
   */
  it('opens a row with nothing left to show onto nothing at all', async () => {
    useHintsStore().ban('layer-periods')
    useHintsStore().ban('layer-trades')
    const wrapper = mountOn('run-chart')
    expect(row(wrapper, 'periods').find('.layer-marker').text()).toBe('')
    expect(row(wrapper, 'periods').find('[data-action="open"]').attributes('aria-expanded')).toBeUndefined()
    await row(wrapper, 'periods').find('[data-action="open"]').trigger('click')
    expect(row(wrapper, 'periods').find('.layer-options').exists()).toBe(false)
    await row(wrapper, 'trades').find('[data-action="open"]').trigger('click')
    expect(row(wrapper, 'trades').find('[data-action="option"]').exists()).toBe(true)
  })

  it('puts the handle of each layer\'s opacity in its row', () => {
    const wrapper = mountOn('run-chart')
    expect(row(wrapper, 'trades').find('[data-action="opacity"]').attributes('aria-label')).toBe('Opacity: 100 %')
  })

  /**
   * A worker's layers (contract 55), from the session FiniexTestingIDE produced to draw every kind of
   * pane: each in the pane its series names — a pane of their own grouped like ours — and a source
   * named only where a pane holds two: the framework's and a worker's, or two workers'.
   */
  describe('a worker\'s layers', () => {
    const SERIES = (seriesWindow as RecordedWindow).indicator_series
    const RUN = (seriesWindow as RecordedWindow).run_id

    function mountWithSeries(): VueWrapper {
      const runs = useRunsStore()
      runs.runs = (runsList as unknown as { runs: RunInfo[] }).runs
      useContextStore().selectRun(RUN)
      // the chart's store first: it lets go of the series while no chart is on show, as it should
      useRunChartStore()
      useIndicatorSeriesStore().series = SERIES
      useDockStore().lastChart = 'run-chart'
      const Host = defineComponent({
        setup() {
          providePanelView('layers')
          return () => h(LayersView)
        },
      })
      mounted = mount(Host)
      return mounted
    }

    it('lists each in the pane its series names, a source named only where a pane holds two', () => {
      const wrapper = mountWithSeries()
      const own = [...new Set(SERIES.map(entry => entry.pane).filter(pane => pane !== 'price'))]
      expect(wrapper.findAll('[data-pane-group]').map(group => group.attributes('data-pane-group')))
        .toEqual(['price', 'volume', ...own])
      // the candles' pane: the framework's layers and two workers' — each source named
      const price = wrapper.find('[data-pane-group="price"]')
      const workers = [...new Set(SERIES.filter(entry => entry.pane === 'price').map(entry => entry.layer.split(':')[1]))]
      expect(price.findAll('.source-heading').map(heading => heading.attributes('data-source'))).toEqual(['framework', ...workers])
      // a pane of one worker's: no source named
      expect(wrapper.find(`[data-pane-group="${own[0]}"] .source-heading`).exists()).toBe(false)
      const rsi = SERIES.find(entry => entry.layer === 'worker:rsi_fast')!
      expect(wrapper.find('[data-pane-group="rsi_fast"] .pane-heading').text()).toContain(`${rsi.title} pane`)
      expect(row(wrapper, 'worker:rsi_fast').find('.layer-title').text()).toBe(`RSI ${rsi.inputs['period']} · ${rsi.timeframe}`)
      // never moved: no grip
      expect(row(wrapper, 'worker:rsi_fast').find('.layer-grip').text()).toBe('')
    })

    it('shows, hides and fades a worker\'s layer by its id, kept with the chart\'s view', async () => {
      const wrapper = mountWithSeries()
      await row(wrapper, 'worker:macd_main').find('[data-action="show"]').trigger('click')
      expect(useArrangementStore().panelViews['run-chart']?.layers?.served?.hidden).toEqual(['worker:macd_main'])
      expect(row(wrapper, 'worker:macd_main').attributes('data-shown')).toBe('false')
      expect(row(wrapper, 'worker:macd_main').classes()).toContain('off')
    })

    /** With no timeframe on show — here no market is covered — no series can be drawn: each row says which can. */
    it('says where the timeframe on show cannot draw a worker\'s layer, and why below the list', () => {
      const wrapper = mountWithSeries()
      const rsi = row(wrapper, 'worker:rsi_fast')
      expect(rsi.attributes('data-drawable')).toBe('false')
      expect(rsi.find('.layer-summary').text()).toBe('M5 and finer')
      expect(wrapper.text()).toContain('A worker\'s series stands on its own timeframe and every finer one')
    })

    it('opens a worker\'s row onto the hint that says what it is, and onto nothing once that is put away', async () => {
      const wrapper = mountWithSeries()
      await row(wrapper, 'worker:rsi_fast').find('[data-action="open"]').trigger('click')
      expect(row(wrapper, 'worker:rsi_fast').find('.layer-options').text()).toContain('What a worker of the strategy computed')
      useHintsStore().ban('layer-indicator')
      await wrapper.vm.$nextTick()
      expect(row(wrapper, 'worker:rsi_fast').find('.layer-options').exists()).toBe(false)
      expect(row(wrapper, 'worker:rsi_fast').find('.layer-marker').text()).toBe('')
    })

    /** Another run names other panes, so a worker's pane folded is kept for its run alone. */
    it('folds a worker\'s pane away, kept with the panel\'s view for the run', async () => {
      const wrapper = mountWithSeries()
      const heading = wrapper.find('[data-pane-group="rsi_fast"] [data-action="fold-pane"]')
      await heading.trigger('click')
      expect(heading.attributes('aria-expanded')).toBe('false')
      expect(row(wrapper, 'worker:rsi_fast').exists()).toBe(false)
      expect(useArrangementStore().panelViews['layers']?.rows).toEqual({ scope: RUN, keys: { 'panes-folded': ['rsi_fast'] } })
      await heading.trigger('click')
      expect(row(wrapper, 'worker:rsi_fast').exists()).toBe(true)
    })
  })

  it('says what to open where no chart that draws layers is open', () => {
    const wrapper = mountOn(null)
    expect(wrapper.find('[data-layer]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Open the run chart to arrange what it draws')
  })
})
