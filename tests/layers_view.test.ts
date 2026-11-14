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
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { RunConfigReport, RunInfo } from '@/types/api/report_types'
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

    function mountWithSeries(series = SERIES): VueWrapper {
      const runs = useRunsStore()
      runs.runs = (runsList as unknown as { runs: RunInfo[] }).runs
      useContextStore().selectRun(RUN)
      // the chart's store first: it lets go of the series while no chart is on show, as it should
      useRunChartStore()
      useIndicatorSeriesStore().series = series
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

    /**
     * A line of its own only for a group (operator, 2026-11-14): the framework's and the workers'
     * where both stand in a pane, a worker only where it draws more than one layer there. Each row
     * says the timeframe its worker was served in a column of its own, never cut by its name.
     */
    it('lists each in the pane its series names, a line of its own only for a group', () => {
      const wrapper = mountWithSeries()
      const own = [...new Set(SERIES.map(entry => entry.pane).filter(pane => pane !== 'price'))]
      expect(wrapper.findAll('[data-pane-group]').map(group => group.attributes('data-pane-group')))
        .toEqual(['price', 'volume', ...own])
      // the candles' pane: the framework's layers and the workers', each worker drawing one layer
      // there and standing as its row alone
      const price = wrapper.find('[data-pane-group="price"]')
      expect(price.findAll('.source-heading').map(heading => heading.attributes('data-source'))).toEqual(['framework', 'workers'])
      // a pane of one worker's: no source named
      expect(wrapper.find(`[data-pane-group="${own[0]}"] .source-heading`).exists()).toBe(false)
      const rsi = SERIES.find(entry => entry.layer === 'worker:rsi_fast')!
      expect(wrapper.find('[data-pane-group="rsi_fast"] .pane-heading').text()).toContain(`${rsi.title} pane`)
      expect(row(wrapper, 'worker:rsi_fast').find('.layer-title').text()).toBe(`RSI ${rsi.inputs['period']}`)
      expect(row(wrapper, 'worker:rsi_fast').find('.layer-timeframe').text()).toBe(rsi.timeframe)
      // never moved: no grip
      expect(row(wrapper, 'worker:rsi_fast').find('.layer-grip').text()).toBe('')
    })

    /**
     * The workers apart from the framework, hidden whole by one eye (operator, 2026-11-13: "kann ich
     * gruppe ausblenden komplett? wobei es aber keinen sinn macht die standardgruppe auszublenden").
     */
    it('puts the workers of the candles\' pane under a heading whose eye hides them all, the framework\'s left alone', async () => {
      const wrapper = mountWithSeries()
      const price = () => wrapper.find('[data-pane-group="price"]')
      const workers = SERIES.filter(entry => entry.pane === 'price').map(entry => entry.layer)
      // the framework's heading folds and has its own eye, untouched by the workers'
      expect(price().find('[data-source="framework"] [data-action="show-framework"]').attributes('aria-pressed')).toBe('true')
      const eye = () => price().find('[data-source="workers"] [data-action="show-workers"]')
      expect(eye().attributes('aria-pressed')).toBe('true')

      await eye().trigger('click')
      // the group hidden above its layers: each keeps its own switch, faint while its group hides it
      expect(useArrangementStore().panelViews['run-chart']?.layers?.groupsHidden).toEqual(['workers:price'])
      expect(useArrangementStore().panelViews['run-chart']?.layers?.served?.hidden).toBeUndefined()
      expect(eye().attributes('aria-pressed')).toBe('false')
      for (const layer of workers) {
        expect(row(wrapper, layer).attributes('data-shown')).toBe('true')
        expect(row(wrapper, layer).attributes('data-muted')).toBe('true')
      }
      expect(row(wrapper, 'candles').attributes('data-muted')).toBe('false')

      await eye().trigger('click')
      expect(useArrangementStore().panelViews['run-chart']?.layers?.groupsHidden).toBeUndefined()
      expect(row(wrapper, workers[0]!).attributes('data-muted')).toBe('false')
    })

    /** A worker drawing two layers in one pane is a group: a heading of its own, which folds and hides them. */
    it('gives a worker with two layers in a pane a heading that folds them and an eye that hides them', async () => {
      const first = SERIES.find(entry => entry.pane === 'price')!
      const worker = first.layer.split(':')[1]!
      const second = { ...first, layer: `${first.layer}:second` }
      const wrapper = mountWithSeries([...SERIES, second])
      const heading = () => wrapper.find(`[data-source="${worker}"]`)
      expect(heading().exists()).toBe(true)

      await heading().find('[data-action="show-worker"]').trigger('click')
      expect(useArrangementStore().panelViews['run-chart']?.layers?.groupsHidden).toEqual([`worker:price|${worker}`])
      expect(row(wrapper, first.layer).attributes('data-muted')).toBe('true')
      expect(row(wrapper, second.layer).attributes('data-muted')).toBe('true')
      expect(heading().find('[data-action="show-worker"]').attributes('aria-pressed')).toBe('false')

      await heading().find('[data-action="fold-worker"]').trigger('click')
      expect(row(wrapper, second.layer).exists()).toBe(false)
      expect(useArrangementStore().panelViews['layers']?.rows?.keys['sources-folded']).toEqual([`price|worker:${worker}`])
    })

    /** The workers of a pane fold away as one (operator, 2026-11-14: "ich kann worker nicht einklappen?"). */
    it('folds the workers of a pane away under their heading, kept for the run', async () => {
      const wrapper = mountWithSeries()
      const onCandles = SERIES.find(entry => entry.pane === 'price')!.layer
      await wrapper.find('[data-pane-group="price"] [data-action="fold-workers"]').trigger('click')
      expect(row(wrapper, onCandles).exists()).toBe(false)
      expect(row(wrapper, 'candles').exists()).toBe(true)
      // the workers of the candles' pane are the same in every run: their fold is kept for all
      expect(useArrangementStore().panelViews['layers']?.expanded).toEqual({ 'layers-workers-price': false })
      await wrapper.find('[data-pane-group="price"] [data-action="fold-workers"]').trigger('click')
      expect(row(wrapper, onCandles).exists()).toBe(true)
    })

    /**
     * Every group has its eye (operator, 2026-11-14): a pane's, the framework's — each a visibility
     * above its layers' switches, the way a folder track's mute works in a DAW.
     */
    it('hides a pane and the framework layers by their eyes, every switch kept as set', async () => {
      const wrapper = mountWithSeries()
      await wrapper.find('[data-pane-group="price"] [data-action="show-framework"]').trigger('click')
      expect(row(wrapper, 'candles').attributes('data-muted')).toBe('true')
      expect(row(wrapper, 'candles').attributes('data-shown')).toBe('true')
      const onCandles = SERIES.find(entry => entry.pane === 'price')!.layer
      expect(row(wrapper, onCandles).attributes('data-muted')).toBe('false')

      await wrapper.find('[data-pane-group="rsi_fast"] [data-action="show-pane"]').trigger('click')
      expect(row(wrapper, 'worker:rsi_fast').attributes('data-muted')).toBe('true')
      expect(useArrangementStore().panelViews['run-chart']?.layers?.groupsHidden).toEqual(['framework:price', 'pane:rsi_fast'])
      // the chart draws none of them, and its own switches stand
      const chart = useRunChartStore()
      expect(chart.layers.every(layer => layer.hidden)).toBe(true)
      expect(chart.indicatorLayers.find(layer => layer.entry.layer === 'worker:rsi_fast')).toMatchObject({ shown: true, muted: true })
    })

    /** The framework's layers fold away as the workers' do (operator, 2026-11-14). */
    it('folds the layers of the framework away under their heading, those of the workers left open', async () => {
      const wrapper = mountWithSeries()
      const onCandles = SERIES.find(entry => entry.pane === 'price')!.layer
      const fold = () => wrapper.find('[data-pane-group="price"] [data-action="fold-framework"]')
      expect(fold().attributes('aria-expanded')).toBe('true')
      await fold().trigger('click')
      expect(fold().attributes('aria-expanded')).toBe('false')
      expect(row(wrapper, 'candles').exists()).toBe(false)
      expect(row(wrapper, onCandles).exists()).toBe(true)
      await fold().trigger('click')
      expect(row(wrapper, 'candles').exists()).toBe(true)
    })

    /**
     * Which line is whose (operator, on screen 2026-11-13; under the opened row since 2026-11-14): the
     * opened row names the worker as the run's configuration does, and shows each plot by its name
     * beside its ink and dash.
     */
    it('opens a worker\'s row onto the worker that drew it and each of its plots with its look', async () => {
      const [first, second] = SERIES.filter(entry => entry.pane === 'price')
      useRunReportsStore().config = {
        run_id: RUN,
        config: { strategy_config: { worker_instances: { [first!.layer.split(':')[1]!]: 'CORE/bollinger' } } },
      } as unknown as RunConfigReport
      const wrapper = mountWithSeries()
      expect(row(wrapper, first!.layer).find('.plot-sample').exists()).toBe(false)
      await row(wrapper, first!.layer).find('[data-action="open"]').trigger('click')
      await row(wrapper, second!.layer).find('[data-action="open"]').trigger('click')
      const options = (layer: string) => row(wrapper, layer).find('.layer-options')
      const parts = (layer: string) => options(layer).findAll('[data-fact="worker"] .fact-part').map(part => part.text())
      expect(parts(first!.layer)).toEqual([first!.layer.split(':')[1], '· CORE/bollinger'])
      // a worker the configuration does not name: its instance alone
      expect(parts(second!.layer)).toEqual([second!.layer.split(':')[1]])
      expect(options(first!.layer).findAll('[data-plot]').map(plot => plot.attributes('data-plot')))
        .toEqual(first!.plots.map(plot => plot.id))
      expect(options(first!.layer).find('.plot-sample').attributes('style')).toContain('var(--color-text-primary)')
      expect(options(second!.layer).find('.plot-sample').attributes('style')).toContain('var(--color-text-secondary)')
      // the MACD's first plot is its histogram: bars
      await row(wrapper, 'worker:macd_main').find('[data-action="open"]').trigger('click')
      expect(row(wrapper, 'worker:macd_main').find('.plot-sample').attributes('data-form')).toBe('bars')
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

    /** A worker's row opens onto the hint that says what it is while it stands, and onto its worker and plots always. */
    it('opens a worker\'s row onto the hint that says what it is, and onto its facts once that is put away', async () => {
      const wrapper = mountWithSeries()
      const onCandles = SERIES.find(entry => entry.pane === 'price')!.layer
      await row(wrapper, onCandles).find('[data-action="open"]').trigger('click')
      expect(row(wrapper, onCandles).find('.layer-options').text()).toContain('What a worker of the strategy computed')
      useHintsStore().ban('layer-indicator')
      await wrapper.vm.$nextTick()
      expect(row(wrapper, onCandles).find('.layer-options').text()).not.toContain('What a worker of the strategy computed')
      expect(row(wrapper, onCandles).find('[data-fact="plots"]').exists()).toBe(true)
      expect(row(wrapper, onCandles).find('.layer-marker').text()).toBe('▾')
    })

    /**
     * A pane is set apart from its first row (operator, 2026-11-13): the candles' pane from the
     * candles', the volume's from its own, a worker's from its first series — a later one sets nothing.
     */
    it('sets a pane apart from its first row, and from no other', async () => {
      const wrapper = mountWithSeries()
      await row(wrapper, 'candles').find('[data-action="open"]').trigger('click')
      await row(wrapper, 'candles').find('[data-action="pane-frame"]').trigger('click')
      await row(wrapper, 'volume').find('[data-action="open"]').trigger('click')
      await row(wrapper, 'volume').find('[data-action="pane-background"]').trigger('click')
      await row(wrapper, 'worker:rsi_fast').find('[data-action="open"]').trigger('click')
      await row(wrapper, 'worker:rsi_fast').find('[data-action="pane-frame"]').trigger('click')
      expect(useArrangementStore().panelViews['run-chart']?.looks).toEqual({
        price: { frame: true }, volume: { background: true }, rsi_fast: { frame: true },
      })
      // a series on the candles sets nothing: the candles' row does
      const onCandles = SERIES.find(entry => entry.pane === 'price')!.layer
      await row(wrapper, onCandles).find('[data-action="open"]').trigger('click')
      expect(row(wrapper, onCandles).find('[data-action="pane-frame"]').exists()).toBe(false)
      // nor does the trades' row, which stands first in the list of the candles' pane
      await row(wrapper, 'trades').find('[data-action="open"]').trigger('click')
      expect(row(wrapper, 'trades').find('[data-action="pane-frame"]').exists()).toBe(false)
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
