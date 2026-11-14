<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import AppButton from '@/components/base/AppButton.vue'
import AppSlider from '@/components/base/AppSlider.vue'
import AppSwitch from '@/components/base/AppSwitch.vue'
import HintLine from '@/components/base/HintLine.vue'
import { holdsValues, plotSample, seriesTitle } from '@/components/indicator_drawing'
import { strategyOf } from '@/components/runs/config_shape'
import VisibilityEye from '@/components/VisibilityEye.vue'
import type { PlotSample } from '@/components/indicator_drawing'
import { useChartLayers } from '@/composables/use_chart_layers'
import { useViewExpanded, useViewRows } from '@/composables/use_panel_view'
import { framePaneOf, frameworkGroupsOf, hiddenByGroup, instanceOf, paneGroup, sourceGroup, workerGroup } from '@/layer_groups'
import type { LayerGroupKey } from '@/layer_groups'
import { layerDefinition } from '@/layer_registry'
import { panelKind } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { useHintsStore } from '@/stores/hints_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import { useRunsStore } from '@/stores/runs_store'
import type { ChartLayerId } from '@/types/chart_drawing_types'
import { CHART_PANE_IDS } from '@/types/chart_pane_types'
import type { ChartPaneId } from '@/types/chart_pane_types'
import type { IndicatorLayer, ServedLayerId } from '@/types/indicator_drawing_types'
import { LAYER_OPACITY_MIN } from '@/types/layer_types'
import type { LayerState } from '@/types/layer_types'
import { t } from '@/translate'

/**
 * The drawing layers of the chart last in front (viewer#41), the front one first — the order a list
 * of layers reads in — drawn as the app's lists are: one row each, no heading. In the row the lever
 * shows or hides the layer, ◐ opens the lever of its opacity, ⠿ drags it in front of or behind the
 * others, and the row itself opens its options, plain beneath the hint that explains them. The
 * candles and the volume stand behind them all and are never moved. It works on the chart last in
 * front, not on a link: another panel coming to the front, this one among them, leaves it on the same
 * chart.
 */
const { lastChart } = storeToRefs(useDockStore())
const {
  rows, show, setOpacity, setOption, setForm, reorder, showServed, setServedOpacity, groupsHidden, showGroup,
} = useChartLayers(() => lastChart.value)

/** The chart arranged, as its tab names it: `Run chart · ETHUSD_aug_sep`. */
const chartName = computed(() => {
  const kind = lastChart.value ? panelKind(lastChart.value) : null
  if (!kind) return null
  const subtitle = kind.subtitle?.() ?? null
  return subtitle ? `${kind.title} · ${subtitle}` : kind.title
})

/**
 * The layers that are shown and have nothing to draw, by id — the run chart's, the one chart that
 * draws layers today. Said in the row, with why: a lever that changes nothing on screen looked
 * broken until it said so (operator, on screen, 2026-10-19 — no position looked at, so neither the
 * levels nor the line had anything to draw).
 */
const runChart = useRunChartStore()
const empty = computed(() => {
  // with no bars the chart says so itself, for every layer at once
  if (lastChart.value !== 'run-chart' || !runChart.bars.length) return new Set<ChartLayerId>()
  return new Set<ChartLayerId>(runChart.layers.filter(layer => !layer.hidden && !layer.drawings.length).map(layer => layer.id))
})

/**
 * Why each shown layer draws nothing, in the order of the list — said below it as hints, one box
 * for all of them, where the panel's empty space is: in the row the reason was cut to a letter in a
 * narrow panel and lived only on hover (operator, on screen 2026-10-27: the line and the levels "did
 * nothing"), and a line under a row would push the rows below it the moment a position is chosen.
 * Hints, so a reader who knows it dismisses or bans them like any other (operator, 2026-10-27).
 */
const emptyHints = computed(() => [
  ...rows.value.flatMap(row => empty.value.has(row.id) ? layerDefinition(row.id).emptyHintId ?? [] : []),
  ...(served.value.some(layer => layer.shown && !layer.drawable) ? ['layer-empty-indicator'] : []),
])

/** Each pane's name in the list, as a heading above its layers. */
const PANE_TITLES: Record<ChartPaneId, string> = { price: t('Price pane'), volume: t('Volume pane') }

/**
 * The workers' layers of the unit on the run chart (contract 55), drawn or not — the run chart's,
 * the one chart that draws them.
 */
const served = computed<IndicatorLayer[]>(() => lastChart.value === 'run-chart' ? runChart.indicatorLayers : [])

/** The worker instance a layer belongs to. */
function workerOf(layer: IndicatorLayer): string {
  return instanceOf(layer.entry.layer)
}

/** One source of a pane's layers: the framework's own, or one worker instance's (agreed with FiniexTestingIDE). */
interface PaneSource {
  worker: string
  layers: IndicatorLayer[]
}

/** A pane's workers, each with its layers, in the order served. */
function workersIn(layers: IndicatorLayer[]): PaneSource[] {
  const sources: PaneSource[] = []
  for (const layer of layers) {
    const worker = workerOf(layer)
    const known = sources.find(source => source.worker === worker)
    if (known) known.layers.push(layer)
    else sources.push({ worker, layers: [layer] })
  }
  return sources
}

/** The pane a layer of ours is drawn in (`framePaneOf`): the volume in its own while its option says so. */
function paneOf(row: LayerState): ChartPaneId {
  return framePaneOf(row.id, row.option)
}

/**
 * The layers grouped by the pane they are drawn in, top to bottom (operator, 2026-11-12), the way
 * TradingView's object tree is: the list grows, and a pane's layers fold away together. A pane with
 * no layer of the list draws no group.
 */
const groups = computed(() => {
  const ours = CHART_PANE_IDS.map(pane => ({
    pane: pane as string,
    title: PANE_TITLES[pane],
    rows: rows.value.filter(row => paneOf(row) === pane),
    workers: workersIn(served.value.filter(layer => layer.entry.pane === pane)),
  }))
  // a worker's own panes below ours, in the order served, each named by its first series
  const names = [...new Set(served.value.map(layer => layer.entry.pane))]
    .filter(pane => !(CHART_PANE_IDS as readonly string[]).includes(pane))
  const theirs = names.map(pane => {
    const layers = served.value.filter(layer => layer.entry.pane === pane)
    return { pane, title: `${layers[0]!.entry.title} ${t('pane')}`, rows: [] as LayerState[], workers: workersIn(layers) }
  })
  return [...ours, ...theirs]
    .filter(group => group.rows.length || group.workers.length)
    .map(group => ({
      ...group,
      // the workers under a heading of their own where they stand beside the framework's layers, and
      // the framework's under theirs; a line of its own only for a group (operator, 2026-11-14)
      workersHeading: group.rows.length > 0 && group.workers.length > 0,
      allWorkers: group.workers.flatMap(source => source.layers),
    }))
})

/**
 * Whether a group stands shown — a visibility of its own above its layers' switches, the way a
 * folder track's mute works in a DAW (operator, 2026-11-14): hidden, it hides everything in it and
 * changes no switch; shown again, each layer stands as it was set. Every group has its eye.
 */
function groupShown(key: LayerGroupKey): boolean {
  return !groupsHidden.value.has(key)
}

function toggleGroup(key: LayerGroupKey): void {
  showGroup(key, !groupShown(key))
}

/** A row of ours hidden by a group it belongs to — its pane, the framework's in it — whatever its switch says. */
function rowMuted(row: LayerState): boolean {
  return hiddenByGroup(groupsHidden.value, frameworkGroupsOf(paneOf(row)))
}

/**
 * Each plot of a worker's layer with its look, by the layer: the opened row's *Plots*, each line's
 * name beside its ink and dash — a legend, so a reader sees which line is whose (operator, on screen
 * 2026-11-13; under its plots since 2026-11-14: before the name it said nothing on its own).
 */
const plotsOf = computed(() => new Map<string, { id: string, sample: PlotSample }[]>(served.value.map(layer =>
  [layer.entry.layer, layer.entry.plots.map(plot => ({ id: plot.id, sample: plotSample(plot, layer.place) }))])))

const reports = useRunReportsStore()

/**
 * What a worker instance is, as the run's configuration names it: `tunnel`, `CORE/bollinger`. The
 * type only where the configuration on show is the run's and names the instance.
 */
function workerParts(layer: IndicatorLayer): string[] {
  const instance = workerOf(layer)
  const strategy = reports.config?.config ? strategyOf(reports.config.config) : null
  const type = strategy?.worker_instances[instance]
  return type ? [instance, type] : [instance]
}

/**
 * A pane's sources folded — the framework's layers, the workers', a worker's group. Every group
 * folds, and its state is kept (operator, 2026-11-14: "gruppen sollten alle einklappbar sein,
 * grundsätzlich, und wir merken uns den zustand"): the framework's and the workers' of our panes for
 * every run, as they are the same in each; a worker's group for its run, as the run names its workers.
 */
const foldedSources = useViewRows('sources-folded', () => runs.selectedRunId)
const sourceFolds: Partial<Record<string, { value: boolean }>> = {
  'price|framework': useViewExpanded('layers-framework-price', true),
  'price|workers': useViewExpanded('layers-workers-price', true),
  'volume|framework': useViewExpanded('layers-framework-volume', true),
  'volume|workers': useViewExpanded('layers-workers-volume', true),
}

/** Whether a source of a pane stands open: `framework`, `workers`, or `worker:<instance>`. */
function sourceOpen(pane: string, source: string): boolean {
  const kept = sourceFolds[`${pane}|${source}`]
  return kept ? kept.value : !foldedSources.has(`${pane}|${source}`)
}

function toggleSource(pane: string, source: string): void {
  const kept = sourceFolds[`${pane}|${source}`]
  if (kept) kept.value = !kept.value
  else foldedSources.toggle(`${pane}|${source}`)
}

/** Whether each of our panes' groups stands open — kept with this panel's view, open where nothing was kept. */
const folds: Record<ChartPaneId, { value: boolean }> = {
  price: useViewExpanded('layers-pane-price', true),
  volume: useViewExpanded('layers-pane-volume', true),
}

/** A worker's panes folded, kept for the run they belong to: another run names other panes. */
const runs = useRunsStore()
const foldedPanes = useViewRows('panes-folded', () => runs.selectedRunId)

function isOpen(pane: string): boolean {
  return Object.prototype.hasOwnProperty.call(folds, pane) ? folds[pane as ChartPaneId].value : !foldedPanes.has(pane)
}

function toggleFold(pane: string): void {
  if (Object.prototype.hasOwnProperty.call(folds, pane)) folds[pane as ChartPaneId].value = !folds[pane as ChartPaneId].value
  else foldedPanes.toggle(pane)
}

/**
 * What a drag leaves behind in one pane's group, written back as the movable layers' order — the one
 * way to move a layer (operator, 2026-10-28), through the package the run bundle's column already
 * sorts its sections with. Each group is a list of its own, so a layer is moved within its pane only.
 * The fixed ones, the candles and the volume, are shown, hidden and fainter like the rest, and never
 * moved.
 */
function reorderIn(pane: string, next: LayerState[]): void {
  const all = groups.value.flatMap(group => group.pane === pane ? next : group.rows)
  reorder(all.filter(row => !layerDefinition(row.id).fixed).map(row => row.id))
}

/** A drag never passes a fixed layer: the candles and the volume keep their places at the back. */
function refuseFixed(event: { related: HTMLElement }): boolean {
  return !event.related.classList.contains('fixed')
}

/**
 * What an empty layer waits for, in its row: the reader's next step where there is one. The line and
 * the levels draw for the position looked at, unless every position is asked for; the trades for
 * the unit on show (operator, 2026-10-28: "nothing to draw" said that, not what to do).
 */
function emptyWord(row: LayerState): string {
  if (row.id === 'state-frame') return t('no frame on show')
  if (row.id === 'trades' || row.id === 'periods' || row.id === 'refusals' || row.option) return t('none in view')
  return runChart.focus ? t('none for this position') : t('pick a position')
}

/** What the volume counts, said in its row: the traded volume, or the ticks where no trade prints. */
const volumeWord = computed(() => runChart.volumeBasis === 'traded' ? t('traded volume') : t('ticks per bar'))

/**
 * The closed row's words, only what the screen cannot show: what an empty layer waits for, and what
 * the volume counts. A switched option or the candles' form is seen elsewhere (operator, 2026-10-28).
 */
function summary(row: LayerState): string {
  if (empty.value.has(row.id)) return emptyWord(row)
  return row.id === 'volume' ? volumeWord.value : ''
}

/** The rows opened — this mount's own, the way a list's folds are until it keeps them. */
const opened = ref(new Set<ChartLayerId>())

/**
 * A worker's closed row says what the screen cannot: where the chart's timeframe cannot draw it, the
 * timeframes that can — its own and every finer one; where its series holds no value at all in the
 * stretch read, that it draws nothing there (on screen 2026-11-13: a setup that never formed looked
 * like a layer that failed to draw).
 */
function servedSummary(layer: IndicatorLayer): string {
  if (!layer.drawable) return `${layer.entry.timeframe} ${t('and finer')}`
  return holdsValues(layer.entry) ? '' : t('no values in view')
}

/** A worker's rows opened, by layer — onto the hint that says what a worker's series is, and its pane's look. */
const openedServed = ref(new Set<string>())

/**
 * The pane whose frame and background a row sets (operator, 2026-11-13: in the options of the
 * pane's first row) — the candles' for the pane of the candles, the volume's while it stands in a
 * pane of its own, a worker's first series for its own pane. None for every other row.
 */
function lookPane(row: LayerState): string | null {
  if (row.id === 'candles') return 'price'
  return row.id === 'volume' && paneOf(row) === 'volume' ? 'volume' : null
}

/** The worker's pane a served row sets the look of: its pane's first series, in a pane of its own. */
function servedLookPane(layer: IndicatorLayer): string | null {
  if (layer.entry.pane === 'price') return null
  const first = served.value.find(other => other.entry.pane === layer.entry.pane)
  return first === layer ? layer.entry.pane : null
}

/** A pane's look as kept: both parts off where nothing is. */
function lookOf(pane: string): { frame: boolean, background: boolean } {
  const kept = runChart.paneLooks && Object.prototype.hasOwnProperty.call(runChart.paneLooks, pane) ? runChart.paneLooks[pane] : undefined
  return { frame: kept?.frame === true, background: kept?.background === true }
}

function toggleServed(layer: IndicatorLayer): void {
  const next = new Set(openedServed.value)
  if (!next.delete(layer.entry.layer)) next.add(layer.entry.layer)
  openedServed.value = next
}

const hints = useHintsStore()

/**
 * Whether a row has anything to open onto: an option, the candles' forms, or its hint not yet put
 * away. A layer with neither of the first two — the booking periods — opened onto nothing once its
 * hint was dismissed (operator, on screen 2026-10-29) — then it shows no marker, and a click opens nothing.
 */
function openable(row: LayerState): boolean {
  const definition = layerDefinition(row.id)
  return Boolean(definition.option || definition.forms) || hints.isVisible(definition.hintId)
}

function toggle(row: LayerState): void {
  if (!openable(row)) return
  const next = new Set(opened.value)
  if (!next.delete(row.id)) next.add(row.id)
  opened.value = next
}
</script>

<template>
  <div class="layers-view">
    <HintLine id="layers" />
    <HintLine v-if="served.length" id="layer-workers" />
    <p v-if="!chartName" class="hint">{{ t('Open the run chart to arrange what it draws') }}</p>
    <template v-else>
      <p class="chart-name" :data-chart="lastChart">{{ chartName }}</p>
      <section v-for="group in groups" :key="group.pane" class="pane-group" :data-pane-group="group.pane">
        <!-- a heading told by its form, an uppercase label, as the figure blocks have it; its eye hides the
             pane and everything in it — a pane of its own gives its room up — and changes no switch -->
        <div class="pane-heading-row">
          <button
            type="button"
            class="pane-heading"
            :aria-expanded="isOpen(group.pane)"
            data-action="fold-pane"
            @click="toggleFold(group.pane)"
          >
            <span class="layer-marker" aria-hidden="true">{{ isOpen(group.pane) ? '▾' : '▸' }}</span>
            <span>{{ group.title }}</span>
          </button>
          <VisibilityEye
            :shown="groupShown(paneGroup(group.pane))"
            :hide-label="t('Hide this pane')"
            :show-label="t('Show this pane')"
            data-action="show-pane"
            @toggle="toggleGroup(paneGroup(group.pane))"
          />
        </div>
        <!-- the framework's own layers, named as a source only where a worker's stand beside them -->
        <p v-if="isOpen(group.pane) && group.workersHeading" class="source-heading" data-source="framework">
          <button
            type="button"
            class="source-fold"
            :aria-expanded="sourceOpen(group.pane, 'framework')"
            data-action="fold-framework"
            @click="toggleSource(group.pane, 'framework')"
          >
            <span class="layer-marker" aria-hidden="true">{{ sourceOpen(group.pane, 'framework') ? '▾' : '▸' }}</span>
            <span>{{ t('Framework') }}</span>
          </button>
          <VisibilityEye
            :shown="groupShown(sourceGroup(group.pane, 'framework'))"
            :hide-label="t('Hide the framework layers of this pane')"
            :show-label="t('Show the framework layers of this pane')"
            data-action="show-framework"
            @toggle="toggleGroup(sourceGroup(group.pane, 'framework'))"
          />
        </p>
        <VueDraggable
          v-if="isOpen(group.pane) && group.rows.length && (!group.workersHeading || sourceOpen(group.pane, 'framework'))"
          :model-value="group.rows"
          tag="ul"
          class="layer-list"
          handle=".layer-grip"
          :animation="120"
          :on-move="refuseFixed"
          @update:model-value="(next: LayerState[]) => reorderIn(group.pane, next)"
        >
        <!-- one row a layer, front first, the fixed ones last — the candles, then the volume behind
             them. What a control does is the hint's above; what a layer draws stands in its opened
             row: neither is a browser tooltip (operator, 2026-10-27) -->
        <li
          v-for="row in group.rows"
          :key="row.id"
          class="layer"
          :class="{ off: !row.shown, muted: rowMuted(row), fixed: layerDefinition(row.id).fixed }"
          :data-layer="row.id"
          :data-shown="row.shown"
          :data-muted="rowMuted(row)"
          :data-opacity="row.opacity"
        >
          <div class="layer-row">
            <!-- a fixed layer keeps the grip's room, so every row's controls stand in one column -->
            <span class="layer-grip" aria-hidden="true">{{ layerDefinition(row.id).fixed ? '' : '⠿' }}</span>
            <AppSwitch
              compact
              :model-value="row.shown"
              :aria-label="t('Shown')"
              data-action="show"
              @update:model-value="on => show(row.id, on)"
            />
            <button
              type="button"
              class="layer-head"
              :class="{ inert: !openable(row) }"
              :aria-expanded="openable(row) ? opened.has(row.id) : undefined"
              data-action="open"
              @click="toggle(row)"
            >
              <span class="layer-marker" aria-hidden="true">{{ openable(row) ? opened.has(row.id) ? '▾' : '▸' : '' }}</span>
              <span class="layer-title">{{ layerDefinition(row.id).title }}</span>
              <span class="layer-summary">{{ summary(row) }}</span>
            </button>
            <AppSlider
              :model-value="row.opacity"
              :min="LAYER_OPACITY_MIN"
              :max="100"
              :step="10"
              :label="t('Opacity')"
              data-action="opacity"
              @update:model-value="value => setOpacity(row.id, value)"
            />
          </div>
          <div v-if="openable(row) && opened.has(row.id)" class="layer-options">
            <!-- what it draws and what its option does, in one hint: the options below stand plain,
                 the way an editor's do, and a reader who knows them dismisses it (operator, 2026-10-28) -->
            <HintLine :id="layerDefinition(row.id).hintId" />
            <AppSwitch
              v-if="layerDefinition(row.id).option"
              compact
              :model-value="row.option === true"
              :label="layerDefinition(row.id).option!.label"
              data-action="option"
              @update:model-value="on => setOption(row.id, on)"
            />
            <!-- the forms: one chosen, shown the way a toggle group shows its choice -->
            <div v-if="layerDefinition(row.id).forms" class="option-line" data-action="forms">
              <AppButton
                v-for="form in layerDefinition(row.id).forms"
                :key="form.id"
                size="compact"
                variant="quiet"
                :active="row.form === form.id"
                :data-form="form.id"
                @click="setForm(row.id, form.id)"
              >
                {{ form.label }}
              </AppButton>
            </div>
            <!-- the look of the pane this row stands first in: set apart by a frame, a background -->
            <template v-if="lookPane(row)">
              <AppSwitch
                compact
                :model-value="lookOf(lookPane(row)!).frame"
                :label="t('Frame')"
                data-action="pane-frame"
                @update:model-value="on => runChart.setPaneLook(lookPane(row)!, 'frame', on)"
              />
              <AppSwitch
                compact
                :model-value="lookOf(lookPane(row)!).background"
                :label="t('Background')"
                data-action="pane-background"
                @update:model-value="on => runChart.setPaneLook(lookPane(row)!, 'background', on)"
              />
            </template>
          </div>
        </li>
        </VueDraggable>
        <!-- a worker's layers: shown, hidden and fainter like ours, never moved — they stand where the
             run recorded them, in the order served (contract 55) -->
        <!-- the workers of a pane that holds the framework's layers too, under a heading of their own
             that folds them and whose eye hides or shows them all; the framework's have none, as hiding
             the default makes no sense (operator, 2026-11-13). A line of its own only for a group:
             a worker gets a heading where it draws more than one layer in the pane (operator,
             2026-11-14) — its name otherwise in its opened row -->
        <p v-if="isOpen(group.pane) && group.workersHeading" class="source-heading" data-source="workers">
          <button
            type="button"
            class="source-fold"
            :aria-expanded="sourceOpen(group.pane, 'workers')"
            data-action="fold-workers"
            @click="toggleSource(group.pane, 'workers')"
          >
            <span class="layer-marker" aria-hidden="true">{{ sourceOpen(group.pane, 'workers') ? '▾' : '▸' }}</span>
            <span>{{ t('Workers') }}</span>
          </button>
          <VisibilityEye
            :shown="groupShown(sourceGroup(group.pane, 'workers'))"
            :hide-label="t('Hide every worker of this pane')"
            :show-label="t('Show every worker of this pane')"
            data-action="show-workers"
            @toggle="toggleGroup(sourceGroup(group.pane, 'workers'))"
          />
        </p>
        <template v-for="source in isOpen(group.pane) && (!group.workersHeading || sourceOpen(group.pane, 'workers')) ? group.workers : []" :key="source.worker">
          <p v-if="source.layers.length > 1" class="source-heading" :class="{ under: group.workersHeading }" :data-source="source.worker">
            <button
              type="button"
              class="source-fold"
              :aria-expanded="sourceOpen(group.pane, `worker:${source.worker}`)"
              data-action="fold-worker"
              @click="toggleSource(group.pane, `worker:${source.worker}`)"
            >
              <span class="layer-marker" aria-hidden="true">{{ sourceOpen(group.pane, `worker:${source.worker}`) ? '▾' : '▸' }}</span>
              <span>{{ source.worker }}</span>
            </button>
            <VisibilityEye
              :shown="groupShown(workerGroup(group.pane, source.worker))"
              :hide-label="t('Hide this worker')"
              :show-label="t('Show this worker')"
              data-action="show-worker"
              @toggle="toggleGroup(workerGroup(group.pane, source.worker))"
            />
          </p>
          <ul v-if="source.layers.length < 2 || sourceOpen(group.pane, `worker:${source.worker}`)" class="layer-list">
            <li
              v-for="layer in source.layers"
              :key="layer.entry.layer"
              class="layer served"
              :class="{ off: !layer.shown, muted: layer.muted }"
              :data-layer="layer.entry.layer"
              :data-shown="layer.shown"
              :data-muted="layer.muted"
              :data-opacity="layer.opacity"
              :data-drawable="layer.drawable"
            >
              <div class="layer-row">
                <span class="layer-grip" aria-hidden="true" />
                <AppSwitch
                  compact
                  :model-value="layer.shown"
                  :aria-label="t('Shown')"
                  data-action="show"
                  @update:model-value="on => showServed(layer.entry.layer as ServedLayerId, on)"
                />
                <button
                  type="button"
                  class="layer-head"
                  :aria-expanded="openedServed.has(layer.entry.layer)"
                  data-action="open"
                  @click="toggleServed(layer)"
                >
                  <span class="layer-marker" aria-hidden="true">{{ openedServed.has(layer.entry.layer) ? '▾' : '▸' }}</span>
                  <!-- the timeframe the worker was served, in a column of its own: head information,
                       never cut by a long name (operator, 2026-11-14) — the series' own, as served -->
                  <span class="layer-timeframe">{{ layer.entry.timeframe }}</span>
                  <span class="layer-title">{{ seriesTitle(layer.entry) }}</span>
                  <span class="layer-summary">{{ servedSummary(layer) }}</span>
                </button>
                <AppSlider
                  :model-value="layer.opacity"
                  :min="LAYER_OPACITY_MIN"
                  :max="100"
                  :step="10"
                  :label="t('Opacity')"
                  data-action="opacity"
                  @update:model-value="value => setServedOpacity(layer.entry.layer as ServedLayerId, value)"
                />
              </div>
              <div v-if="openedServed.has(layer.entry.layer)" class="layer-options">
                <HintLine id="layer-indicator" />
                <!-- what drew it, and each of its lines with its look: a label and its value, as the
                     app's figure lines are -->
                <p class="layer-fact" data-fact="worker">
                  <span class="fact-label">{{ t('Worker') }}</span>
                  <!-- the instance and its type each whole: a narrow panel breaks between them, never inside -->
                  <span class="fact-parts">
                    <span v-for="(part, at) in workerParts(layer)" :key="at" class="fact-part">{{ at ? `· ${part}` : part }}</span>
                  </span>
                </p>
                <p class="layer-fact" data-fact="plots">
                  <span class="fact-label">{{ t('Plots') }}</span>
                  <span class="plot-list">
                    <span v-for="plot in plotsOf.get(layer.entry.layer) ?? []" :key="plot.id" class="plot-item" :data-plot="plot.id">
                      <svg
                        class="plot-sample"
                        :data-form="plot.sample.form"
                        viewBox="0 0 16 8"
                        aria-hidden="true"
                        :style="{ color: plot.sample.ink, opacity: plot.sample.alpha }"
                      >
                        <template v-if="plot.sample.form === 'bars'">
                          <rect x="1" y="3" width="3" height="5" fill="currentColor" />
                          <rect x="6.5" y="0" width="3" height="8" fill="currentColor" />
                          <rect x="12" y="4" width="3" height="4" fill="currentColor" />
                        </template>
                        <template v-else>
                          <path v-if="plot.sample.form === 'area'" d="M0 5 L8 2 L16 3 L16 8 L0 8 Z" fill="currentColor" fill-opacity="0.25" />
                          <path
                            :d="plot.sample.form === 'area' ? 'M0 5 L8 2 L16 3' : 'M0 4 L16 4'"
                            fill="none"
                            stroke="currentColor"
                            :stroke-width="plot.sample.width"
                            :stroke-dasharray="plot.sample.dash || undefined"
                          />
                        </template>
                      </svg>
                      {{ plot.id }}
                    </span>
                  </span>
                </p>
                <template v-if="servedLookPane(layer)">
                  <AppSwitch
                    compact
                    :model-value="lookOf(servedLookPane(layer)!).frame"
                    :label="t('Frame')"
                    data-action="pane-frame"
                    @update:model-value="on => runChart.setPaneLook(servedLookPane(layer)!, 'frame', on)"
                  />
                  <AppSwitch
                    compact
                    :model-value="lookOf(servedLookPane(layer)!).background"
                    :label="t('Background')"
                    data-action="pane-background"
                    @update:model-value="on => runChart.setPaneLook(servedLookPane(layer)!, 'background', on)"
                  />
                </template>
              </div>
            </li>
          </ul>
        </template>
      </section>
      <HintLine v-if="emptyHints.length" :id="emptyHints" />
    </template>
  </div>
</template>

<style scoped>
.layers-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  height: 100%;
  padding: var(--space-sm);
  overflow-y: auto;
  /* the scrollbar's track is held free: one appearing, as a hint below the list grows, moves no row
     (operator, on screen 2026-10-27) */
  scrollbar-gutter: stable;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.chart-name {
  margin: 0;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-border);
}

/* a pane's heading: its fold, told by its form — an uppercase label in the ink of structure */
/* a pane's heading and its eye on one line, the eye at the end where every eye of the panel stands */
.pane-heading-row {
  display: flex;
  align-items: center;
  padding-right: var(--space-xs);
}

/* a row its group hides: its own switch stays as set, the whole row faint — the group's eye says why */
.layer.muted .layer-row {
  opacity: 0.45;
}

.pane-heading {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  width: 100%;
  padding: var(--space-xs);
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font: inherit;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: left;
  cursor: pointer;
}

.pane-heading:hover {
  background-color: var(--color-bg-hover);
}

.pane-heading:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* a source within a pane — the framework's, a worker's — told by its form like the pane's heading,
   set in under it; its eye, where it has one, at the row's end */
.source-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
  margin: 0;
  padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-md);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* a worker under the pane's WORKERS: one step further in */
.source-heading.under {
  padding-left: calc(var(--space-md) + var(--space-md));
}

/* a heading that folds what is under it: the heading's own words, a control by its marker */
.source-fold {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.source-fold:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* the timeframe a worker was served: three characters wide whatever it says (M1 to M30), so the names
   beside it stand in one column, in the ink of structure so it does not read as part of the name */
.layer-timeframe {
  flex: none;
  width: 3ch;
  color: var(--color-text-secondary);
}

/* the title beside the marker and the timeframe, with the two gaps between them: wider, it would wrap
   onto the line the head's height cuts away, and the row would show no name at all */
.layer.served .layer-title {
  max-width: calc(100% - 1em - 3ch - 2 * var(--space-xs) - 2px);
}

/* a fact of the opened row: its label, then its value — the app's figure line */
.layer-fact {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  margin: 0;
  min-width: 0;
}

.fact-label {
  flex: none;
  min-width: 7ch;
  color: var(--color-text-secondary);
}

.fact-parts {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-xs);
  min-width: 0;
}

.fact-part {
  white-space: nowrap;
}

.plot-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-sm);
  min-width: 0;
}

.plot-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

/* a line in a few pixels, in its ink, its dash and its strength */
.plot-sample {
  flex: none;
  width: 16px;
  height: 8px;
}

/* a row of the app's lists: the same rule below, the same padding, the surface under the pointer */
.layer {
  border-bottom: 1px solid var(--color-border);
}

/* the surface under the pointer spans the whole row, its three controls with it */
.layer-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding-left: var(--space-xs);
}

.layer-row:hover {
  background-color: var(--color-bg-hover);
}

.layer-grip {
  flex-shrink: 0;
  width: 1em;
  color: var(--color-text-secondary);
  text-align: center;
  cursor: grab;
  user-select: none;
}

.layer.fixed .layer-grip {
  cursor: default;
}

.layer-head {
  flex: 1;
  min-width: 0;
  display: flex;
  /* the words beside the title stand only where they fit whole: they wrap onto a second line the
     moment they would not, and the head's height cuts that line away (operator, 2026-10-28) */
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: center;
  column-gap: var(--space-xs);
  height: calc(1.5em + 4px);
  overflow: hidden;
  line-height: 1.5;
  /* as tall as a row of the app's lists: 25 px, where four pixels a side made it 28 */
  padding: 2px var(--space-xs) 2px 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
}

.layer-head:active:not(.inert) {
  background-color: var(--color-bg-active);
}

/* a row with nothing to open onto offers no click: no marker, no pointer, no press */
.layer-head.inert {
  cursor: default;
}

.layer-head:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.layer-marker {
  width: 1em;
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

/* the title comes first, always beside its marker, and is cut with … only where the panel is
   narrower than the title itself */
.layer-title {
  flex: 0 1 auto;
  max-width: calc(100% - 1em - var(--space-xs));
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-summary {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* a hidden layer's row goes grey, nothing more: the lever's position says it too, and nothing in
   the row changes its size (operator, on screen, 2026-10-19) */
.layer.off .layer-title {
  color: var(--color-text-secondary);
}

/* the opened part is a boundary in the list, raised rather than coloured, as a group heading is */
.layer-options {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-xs) var(--space-sm) var(--space-xs) calc(var(--space-xs) + 1em + 22px + 3 * var(--space-xs) + 1em);
  border-top: 1px solid var(--color-border);
  background-color: var(--color-bg-elevated);
}

.option-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
  min-height: 24px;
}

.hint {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
