<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { activeServer } from '@/active_server'
import AppButton from '@/components/base/AppButton.vue'
import AppSelect from '@/components/base/AppSelect.vue'
import { instanceOf } from '@/layer_groups'
import { writeLink } from '@/link_address'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useRunsStore } from '@/stores/runs_store'
import type { ChartUnitBlock } from '@/types/run_chart_types'
import { t } from '@/translate'

/**
 * What the run chart shows — which unit, in which timeframe — beside the tabs while it is the panel
 * in front: `EURGBP_refusals_01 · M1`. A unit nothing can be drawn for stays listed, disabled, with
 * the reason, so the list is the run's whole set of units rather than a shorter one. ≡ Layers opens
 * the panel that arranges what the chart draws, beside it — marked while that panel is open. 🔗
 * copies a link to the view on show (viewer#60).
 */
const chart = useRunChartStore()
const { units, unit, timeframe, coveredTimeframes, indicatorLayers, visibleMiddle } = storeToRefs(chart)
const runs = useRunsStore()
const context = useContextStore()
const dock = useDockStore()
const { openIds } = storeToRefs(dock)

const BLOCKED: Record<ChartUnitBlock, string> = {
  'no-ticks': t('processed no tick'),
  'no-market': t('names no market'),
}

/**
 * How many workers of the unit on show were served each timeframe (operator, 2026-11-14: "ich sehe
 * nicht welche worker auf welchen timeframes arbeiten") — counted over the series the window serves,
 * each worker once. The Layers panel names them, in the timeframe column of their rows.
 */
const workersOn = computed(() => {
  const workers = new Map<string, Set<string>>()
  for (const layer of indicatorLayers.value) {
    const held = workers.get(layer.entry.timeframe) ?? new Set<string>()
    held.add(instanceOf(layer.entry.layer))
    workers.set(layer.entry.timeframe, held)
  }
  return workers
})

/** The timeframes the market is rendered in, each marked with how many workers were served it. */
const timeframeOptions = computed(() => coveredTimeframes.value.map(tf => {
  const count = workersOn.value.get(tf)?.size ?? 0
  return { value: tf, label: count ? `${tf} ● ${count}` : tf }
}))

const unitOptions = computed(() => (units.value ?? []).map(entry => ({
  value: entry.name,
  label: entry.block ? `${entry.name} — ${BLOCKED[entry.block]}` : entry.name,
  disabled: entry.block !== null,
})))

/**
 * The view on show as a link (viewer#60): this window's server, the run, the scenarios in focus — or,
 * with none in focus, the unit on show, so the chart opens on it — the position marked, and the
 * timeframe with the bar in the middle of the stretch on show. Never the layout.
 */
const linkToView = computed<string | null>(() => {
  const run = runs.selectedRunId
  if (!run) return null
  const focus = runs.selectedUnits
  const at = visibleMiddle.value
  return writeLink(`${window.location.origin}${window.location.pathname}`, {
    server: activeServer().id,
    run,
    units: focus.length ? [...focus] : unit.value ? [unit.value.name] : [],
    position: context.main.run.position,
    chart: timeframe.value && at !== null ? { timeframe: timeframe.value, at } : null,
  })
})

/** What the copy came to, said at the button for a moment: copied, or the clipboard refused it. */
const copied = ref<'done' | 'failed' | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyLink(): Promise<void> {
  const link = linkToView.value
  if (!link) return
  try {
    await navigator.clipboard.writeText(link)
    copied.value = 'done'
  } catch {
    copied.value = 'failed'
  }
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = null }, 2000)
}

onUnmounted(() => clearTimeout(copiedTimer))
</script>

<template>
  <div class="run-chart-quick-bar">
    <AppSelect
      class="unit-select"
      compact
      :label="t('Unit')"
      :model-value="unit?.name ?? null"
      :options="unitOptions"
      :placeholder="t('Unit')"
      :disabled="!unitOptions.length"
      @update:model-value="chart.chooseUnit"
    />
    <span class="quick-separator" aria-hidden="true">·</span>
    <AppSelect
      compact
      :label="t('Timeframe')"
      :model-value="timeframe"
      :options="timeframeOptions"
      :placeholder="timeframe ? undefined : t('Timeframe')"
      :disabled="!coveredTimeframes.length"
      @update:model-value="chart.chooseTimeframe"
    />
    <span class="quick-separator" aria-hidden="true">·</span>
    <AppButton
      class="layers-button"
      size="compact"
      :marked="openIds.includes('layers')"
      :aria-label="t('Layers')"
      data-action="layers"
      @click="dock.reveal('layers', 'command')"
    >
      <!-- what it does is said by the quick bar's hint, never on a browser tooltip -->
      ≡ <span class="layers-word">{{ t('Layers') }}</span>
    </AppButton>
    <!-- what it copies is said by its hint; what came of it, at the button itself, where the click was -->
    <AppButton
      class="link-button"
      :class="{ failed: copied === 'failed' }"
      size="compact"
      :disabled="!linkToView"
      :aria-label="t('Copy a link to this view')"
      data-action="copy-link"
      @click="copyLink"
    >
      {{ copied === 'done' ? '✓' : copied === 'failed' ? '✕' : '🔗' }}
    </AppButton>
  </div>
</template>

<style scoped>
.run-chart-quick-bar {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  height: 100%;
  min-width: 0;
  padding: 0 var(--space-sm);
}

/* The unit gives way — a long unit name is cut, and the tab beside it names the unit too — so
   ≡ Layers stays whole and in reach. Below about 630 px the bar overflowed its group's header, and
   the button stood past the group's edge, reached only by scrolling the group (2026-10-28). It is
   cut with …, as the tab is, never mid-letter; the timeframe is never cut: three characters, and
   `M1(` named no timeframe at all (operator, 2026-10-29). A select is as wide as its widest
   option, so the timeframe's placeholder is offered only while none is chosen: the word stood
   wider than any timeframe and pushed ≡ Layers past the group's edge. */
.run-chart-quick-bar > .unit-select {
  flex: 0 1 auto;
  min-width: 3rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.run-chart-quick-bar > :not(.unit-select) {
  flex: none;
}

.quick-separator {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* the glyph and the word stay one line, however narrow the tab bar: wrapped, ≡ stood above Layers */
.layers-button {
  white-space: nowrap;
}

/* one width for its three glyphs, so the answer at the click moves nothing beside it */
.link-button {
  min-width: 2.2em;
  justify-content: center;
}

.link-button.failed {
  color: var(--color-error);
}

/* In a short header the word gives way and ≡ stays: at the run chart's first width, 457 px beside a
   1800 px window, the tab and the bar did not fit together (2026-10-28). */
@container dock-header (max-width: 32rem) {
  .layers-word {
    display: none;
  }
}
</style>
