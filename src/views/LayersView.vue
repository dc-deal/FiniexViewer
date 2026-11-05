<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import AppButton from '@/components/base/AppButton.vue'
import AppSlider from '@/components/base/AppSlider.vue'
import AppSwitch from '@/components/base/AppSwitch.vue'
import HintLine from '@/components/base/HintLine.vue'
import { useChartLayers } from '@/composables/use_chart_layers'
import { layerDefinition } from '@/layer_registry'
import { panelKind } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { useHintsStore } from '@/stores/hints_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import type { ChartLayerId } from '@/types/chart_drawing_types'
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
const { rows, show, setOpacity, setOption, setForm, reorder } = useChartLayers(() => lastChart.value)

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
const emptyHints = computed(() => rows.value.flatMap(row =>
  empty.value.has(row.id) ? layerDefinition(row.id).emptyHintId ?? [] : []))

/**
 * The list as a drag sees it: every row, and what it leaves behind written back as the movable
 * layers' order — the one way to move a layer (operator, 2026-10-28), through the package the run
 * bundle's column already sorts its sections with. The fixed ones, the candles and the volume, are
 * shown, hidden and fainter like the rest, and never moved.
 */
const ordered = computed({
  get: () => rows.value,
  set: (next: LayerState[]) => reorder(next.filter(row => !layerDefinition(row.id).fixed).map(row => row.id)),
})

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
  if (row.id === 'trades' || row.option) return t('none in view')
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

const hints = useHintsStore()

/**
 * Whether a row has anything to open onto: an option, the candles' forms, or its hint not yet put
 * away. The volume has neither of the first two, and once its hint was dismissed it opened onto
 * nothing (operator, on screen 2026-10-29) — then it shows no marker, and a click opens nothing.
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
    <p v-if="!chartName" class="hint">{{ t('Open the run chart to arrange what it draws') }}</p>
    <template v-else>
      <p class="chart-name" :data-chart="lastChart">{{ chartName }}</p>
      <VueDraggable
        v-model="ordered"
        tag="ul"
        class="layer-list"
        handle=".layer-grip"
        :animation="120"
        :on-move="refuseFixed"
      >
        <!-- one row a layer, front first, the fixed ones last — the candles, then the volume behind
             them. What a control does is the hint's above; what a layer draws stands in its opened
             row: neither is a browser tooltip (operator, 2026-10-27) -->
        <li
          v-for="row in ordered"
          :key="row.id"
          class="layer"
          :class="{ off: !row.shown, fixed: layerDefinition(row.id).fixed }"
          :data-layer="row.id"
          :data-shown="row.shown"
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
          </div>
        </li>
      </VueDraggable>
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
