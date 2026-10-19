<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AppButton from '@/components/base/AppButton.vue'
import AppSlider from '@/components/base/AppSlider.vue'
import AppSwitch from '@/components/base/AppSwitch.vue'
import HintLine from '@/components/base/HintLine.vue'
import { useChartLayers } from '@/composables/use_chart_layers'
import { layerDefinition, layerSummary } from '@/layer_registry'
import { panelKind } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import type { ChartLayerId } from '@/types/chart_drawing_types'
import { LAYER_OPACITY_MIN } from '@/types/layer_types'
import { t } from '@/translate'

/**
 * The drawing layers of the chart last in front (viewer#41), the front one first — the order a list
 * of layers reads in — drawn as the app's lists are: one row each, no heading. In the row the lever
 * shows or hides the layer, ◐ opens the lever of its opacity, and the row itself opens the rest: its
 * option and its place in front of or behind the others. The candles stand behind them all and are
 * not arranged here. It works on the chart last in front, not on a link: another panel coming to the
 * front, this one among them, leaves it on the same chart.
 */
const { lastChart } = storeToRefs(useDockStore())
const { rows, show, setOpacity, setOption, move } = useChartLayers(() => lastChart.value)

/** The chart arranged, as its tab names it: `Run chart · ETHUSD_aug_sep`. */
const chartName = computed(() => {
  const kind = lastChart.value ? panelKind(lastChart.value) : null
  if (!kind) return null
  const subtitle = kind.subtitle?.() ?? null
  return subtitle ? `${kind.title} · ${subtitle}` : kind.title
})

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
      <ul class="layer-list">
        <li
          v-for="(row, index) in rows"
          :key="row.id"
          class="layer"
          :class="{ off: !row.shown }"
          :data-layer="row.id"
          :data-shown="row.shown"
          :data-opacity="row.opacity"
        >
          <div class="layer-row">
            <AppSwitch
              :model-value="row.shown"
              :aria-label="t('Shown')"
              :title="row.shown ? t('Hide this layer') : t('Show this layer')"
              data-action="show"
              @update:model-value="on => show(row.id, on)"
            />
            <button
              type="button"
              class="layer-head"
              :aria-expanded="opened.has(row.id)"
              :title="layerDefinition(row.id).description"
              data-action="open"
              @click="toggle(row.id)"
            >
              <span class="layer-marker" aria-hidden="true">{{ opened.has(row.id) ? '▾' : '▸' }}</span>
              <span class="layer-title">{{ layerDefinition(row.id).title }}</span>
              <span class="layer-summary">{{ row.shown ? layerSummary(row) : t('hidden') }}</span>
            </button>
            <AppSlider
              :model-value="row.opacity"
              :min="LAYER_OPACITY_MIN"
              :max="100"
              :step="10"
              :label="t('Opacity')"
              :title="t('How strongly the layer is drawn — a click opens the lever')"
              data-action="opacity"
              @update:model-value="value => setOpacity(row.id, value)"
            />
          </div>
          <div v-if="opened.has(row.id)" class="layer-options">
            <AppSwitch
              v-if="layerDefinition(row.id).option"
              :model-value="row.option === true"
              :label="layerDefinition(row.id).option!.label"
              :title="layerDefinition(row.id).option!.description"
              data-action="option"
              @update:model-value="on => setOption(row.id, on)"
            />
            <div class="option-line">
              <span class="option-name">{{ t('Order') }}</span>
              <AppButton
                size="compact"
                variant="quiet"
                :disabled="index === 0"
                :title="t('One place to the front')"
                data-action="front"
                @click="move(row.id, 1)"
              >
                ↑ {{ t('front') }}
              </AppButton>
              <AppButton
                size="compact"
                variant="quiet"
                :disabled="index === rows.length - 1"
                :title="t('One place to the back')"
                data-action="back"
                @click="move(row.id, -1)"
              >
                ↓ {{ t('back') }}
              </AppButton>
            </div>
          </div>
        </li>
        <li class="layer fixed">
          <div class="layer-row">
            <span class="fixed-mark" aria-hidden="true">▣</span>
            <span class="layer-title">{{ t('Candles') }}</span>
            <span class="layer-summary">{{ t('always behind the layers') }}</span>
          </div>
        </li>
      </ul>
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

.layer-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding-left: var(--space-sm);
}

.layer-head {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-xs) var(--space-xs) 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
}

.layer-head:hover {
  background-color: var(--color-bg-hover);
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
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-summary {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* a hidden layer's row goes grey, nothing more: the lever's position and the word say it too, and
   nothing in the row changes its size (operator, on screen, 2026-10-19) */
.layer.off .layer-title {
  color: var(--color-text-secondary);
}

/* the opened part is a boundary in the list, raised rather than coloured, as a group heading is */
.layer-options {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-xs) var(--space-sm) var(--space-xs) calc(var(--space-sm) + 26px + 2 * var(--space-xs) + 1em);
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

.option-name {
  color: var(--color-text-secondary);
}

/* the candles are not arranged: a mark where the lever stands elsewhere, the same width */
.fixed .layer-row {
  padding-block: var(--space-xs);
}

.fixed-mark {
  width: 26px;
  flex-shrink: 0;
  text-align: center;
  color: var(--color-text-secondary);
}

.fixed .layer-title {
  color: var(--color-text-secondary);
}

.hint {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
