<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import AppButton from '@/components/base/AppButton.vue'
import AppSlider from '@/components/base/AppSlider.vue'
import AppSwitch from '@/components/base/AppSwitch.vue'
import HintLine from '@/components/base/HintLine.vue'
import { useChartLayers } from '@/composables/use_chart_layers'
import { layerDefinition, layerSummary } from '@/layer_registry'
import { panelKind } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import type { ChartLayerId } from '@/types/chart_drawing_types'
import { LAYER_OPACITY_MIN } from '@/types/layer_types'
import type { LayerState } from '@/types/layer_types'
import { t } from '@/translate'

/**
 * The drawing layers of the chart last in front (viewer#41), the front one first — the order a list
 * of layers reads in — drawn as the app's lists are: one row each, no heading. In the row the lever
 * shows or hides the layer, ◐ opens the lever of its opacity, ⠿ drags it in front of or behind the
 * others, and the row itself opens the rest: what it draws, its option, and ↑ ↓ for the keyboard. The
 * candles and the volume stand behind them all and are never moved. It works on the chart last in front, not on a link: another panel coming to the
 * front, this one among them, leaves it on the same chart.
 */
const { lastChart } = storeToRefs(useDockStore())
const { rows, show, setOpacity, setOption, setForm, move, reorder } = useChartLayers(() => lastChart.value)

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
 * The layers that take a place among the others, front first. The fixed ones — the candles and the
 * volume, drawn by the chart library — are shown, hidden and fainter like the rest, and never moved.
 */
const movable = computed(() => rows.value.filter(row => !layerDefinition(row.id).fixed))

/**
 * The list as a drag sees it: every row, and what it leaves behind written back as the movable
 * layers' order (operator, 2026-10-28 — dragging as well as ↑ ↓, through the package the run
 * bundle's column already sorts its sections with).
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
  if (row.id === 'trades' || row.option) return t('none in view')
  return runChart.focus ? t('none for this position') : t('pick a position')
}

/** What the volume counts, said in its row: the traded volume, or the ticks where no trade prints. */
const volumeWord = computed(() => runChart.volumeBasis === 'traded' ? t('traded volume') : t('ticks per bar'))

/**
 * The closed row's words: what differs from the default, what the volume counts, the form the price
 * is drawn in, where a fixed layer stands, and what an empty one waits for.
 */
function summary(row: LayerState): string {
  const definition = layerDefinition(row.id)
  return [
    layerSummary(row),
    row.id === 'volume' ? volumeWord.value : '',
    definition.forms?.find(form => form.id === row.form)?.label ?? '',
    definition.place ?? '',
    empty.value.has(row.id) ? emptyWord(row) : '',
  ].filter(Boolean).join(' · ')
}

/** The rows opened — this mount's own, the way a list's folds are until it keeps them. */
const opened = ref(new Set<ChartLayerId>())

function toggle(id: ChartLayerId): void {
  const next = new Set(opened.value)
  if (!next.delete(id)) next.add(id)
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
              :aria-expanded="opened.has(row.id)"
              data-action="open"
              @click="toggle(row.id)"
            >
              <span class="layer-marker" aria-hidden="true">{{ opened.has(row.id) ? '▾' : '▸' }}</span>
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
          <div v-if="opened.has(row.id)" class="layer-options">
            <p class="layer-description">{{ layerDefinition(row.id).description }}</p>
            <template v-if="layerDefinition(row.id).option">
              <AppSwitch
                compact
                :model-value="row.option === true"
                :label="layerDefinition(row.id).option!.label"
                data-action="option"
                @update:model-value="on => setOption(row.id, on)"
              />
              <p class="layer-description">{{ layerDefinition(row.id).option!.description }}</p>
            </template>
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
            <!-- the keyboard's way to move it, beside the grip the pointer drags -->
            <div v-if="!layerDefinition(row.id).fixed" class="option-line">
              <AppButton
                size="compact"
                variant="quiet"
                glyph
                :aria-label="t('One place to the front')"
                :disabled="movable.indexOf(row) === 0"
                data-action="front"
                @click="move(row.id, 1)"
              >↑</AppButton>
              <AppButton
                size="compact"
                variant="quiet"
                glyph
                :aria-label="t('One place to the back')"
                :disabled="movable.indexOf(row) === movable.length - 1"
                data-action="back"
                @click="move(row.id, -1)"
              >↓</AppButton>
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
  align-items: center;
  gap: var(--space-xs);
  /* as tall as a row of the app's lists: 25 px, where four pixels a side made it 28 */
  padding: 2px var(--space-xs) 2px 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
}

/* read once when a row is opened, so it takes less room than the row itself */
.layer-description {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.layer-head:active {
  background-color: var(--color-bg-active);
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

.layer-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* the title comes first: the summary gives way an overwhelming share faster, so a narrow panel
   cuts it before the title — at 240 px a summary beside the candles had squeezed their title out */
.layer-summary {
  flex: 0 1000 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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
