<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BookingPeriodTimeline from '@/components/runs/BookingPeriodTimeline.vue'
import BookingPeriodTable from '@/components/runs/BookingPeriodTable.vue'
import { amount, magnitude } from '@/components/runs/report_format'
import { orderPeriods } from '@/components/runs/period_order'
import { useDisplaySettings } from '@/composables/use_display_settings'
import { useScenarioSelection, showsUnit } from '@/composables/use_scenario_selection'
import type { LaneOrder } from '@/types/settings_types'
import type { BookingPeriodsReport } from '@/types/api/report_types'
import { t } from '@/translate'

const props = defineProps<{
  model: BookingPeriodsReport
}>()

interface Verdict {
  tone: string
  mark: string
  text: string
}

/**
 * The reconciliation, in the three states it actually has. `null` is not a pass with a missing
 * number: the run reported no figure in this currency, so nothing was compared — and it is shown
 * as loudly as a failure, because a tick there would claim evidence that does not exist.
 */
const verdict = computed<Verdict>(() => {
  if (props.model.reconciles === true) {
    return {
      tone: 'agrees',
      mark: '✓',
      text: t('Every trade record is accounted for by the periods below'),
    }
  }
  if (props.model.reconciles === false) {
    return {
      tone: 'disagrees',
      mark: '✖',
      text: t('Records are missing — the periods do not account for what the run counted'),
    }
  }
  return {
    tone: 'unchecked',
    mark: '?',
    text: t('Not checked — the run reports no figure in this currency'),
  }
})

/**
 * One order for the chart and the table beneath it. Inside a run a lane is the UNIT: a simulation's
 * scenarios each carry their own period sequence. The default comes from the settings — by start
 * time out of the box, because that is what turns a scattered set of slices into a diagonal.
 *
 * Local afterwards: the toggle above the chart is a look at this run, not a change of preference.
 * Changing the preference adopts it here, so the setting visibly does something.
 */
const display = useDisplaySettings()
const laneOrder = ref<LaneOrder>(display.value.laneOrder)

watch(() => display.value.laneOrder, order => { laneOrder.value = order })

/**
 * The narrowing reaches the PERIODS, never the verdict above them. `reconciles`, `total_net_pnl`
 * and `total_trades` compare the whole run's booked records against the whole run's count — there
 * is no per-unit version of that check, and showing it over one lane would claim it was about that
 * lane. It keeps its figures and says whose they are.
 *
 * `unit_name` is the unit's identity here, the same value the roster calls `name`.
 */
const narrowing = useScenarioSelection()
const narrowed = computed(() => narrowing.units.value.length > 0)

const selectedPeriods = computed(() => {
  const units = narrowing.units.value
  if (!units.length) return props.model.periods
  return props.model.periods.filter(period => showsUnit(units, period.unit_name))
})

const orderedPeriods = computed(() =>
  orderPeriods(selectedPeriods.value, laneOrder.value, row => row.unit_name)
)

/**
 * The other account currencies this run booked, each served by its own response. `currencies`
 * carries EVERY currency including the one on show (settled 2026-09-23), so the current one is
 * filtered out here — the console does the same before printing. An empty list on an older
 * artifact is the not-back-filled case, not a run that booked nothing.
 */
const otherCurrencies = computed(() =>
  props.model.currencies.filter(entry => entry !== props.model.currency)
)
</script>

<template>
  <div class="booking-periods">
    <!-- The check comes first: it decides whether the rows below may be read as complete. -->
    <!-- The explanation is on the TITLE, not on the page. What the check proves is a caveat a
         reader wants once, and three lines of prose on every run is three lines of noise. -->
    <div class="verdict" :class="verdict.tone" :title="t('This compares completeness, not arithmetic: both figures descend from one value, so a wrong P&L moves them together and the check stays green.')">
      <span class="verdict-mark">{{ verdict.mark }}</span>
      <div class="verdict-body">
        <p class="verdict-text">{{ verdict.text }}</p>
        <p class="verdict-detail">
          {{ t('Periods') }}: {{ amount(model.total_net_pnl, model.currency) }} ·
          {{ model.total_trades }} {{ t('trades') }}
          &nbsp;|&nbsp;
          {{ t('Run') }}:
          <template v-if="model.run_net_pnl !== null">
            {{ amount(model.run_net_pnl, model.currency) }} ·
            {{ model.run_total_trades }} {{ t('trades') }}
          </template>
          <template v-else>{{ t('nothing reported') }}</template>
        </p>
        <p v-if="narrowed" class="verdict-scope">
          {{ t('This check is the whole run — the periods below are the chosen scenarios') }}
        </p>
      </div>
    </div>

    <div v-if="!selectedPeriods.length" class="hint">
      {{ narrowed
        ? t('The chosen scenarios booked no periods')
        : t('This run booked no periods') }}
    </div>
    <template v-else>
      <BookingPeriodTimeline
        v-model:order="laneOrder"
        :periods="orderedPeriods"
        :key-fields="model.key"
      />
      <BookingPeriodTable :periods="orderedPeriods" :key-fields="model.key" />
    </template>

    <!-- both figures are the RUN's: the deepest drawdown is taken across every period and the
         final equity is the account's, so neither has a per-scenario version to show -->
    <p class="footnote">
      <span v-if="narrowed" class="scope">{{ t('whole run') }}</span>
      {{ t('Deepest period drawdown') }}: {{ magnitude(model.deepest_period_drawdown, model.currency) }} ·
      {{ t('Final equity') }}: {{ amount(model.final_equity, model.currency) }}
      <template v-if="otherCurrencies.length">
        &nbsp;|&nbsp; {{ t('Other account currencies') }}: {{ otherCurrencies.join(', ') }}
      </template>
    </p>
  </div>
</template>

<style scoped>
.verdict {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm);
  margin-bottom: var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-bg-elevated);
}

.verdict.agrees { border-left-color: var(--color-positive); }
.verdict.disagrees { border-left-color: var(--color-error); }
.verdict.unchecked { border-left-color: var(--color-error); }

.verdict-mark {
  font-family: monospace;
  font-size: var(--font-size-lg);
}

.verdict.agrees .verdict-mark { color: var(--color-positive); }
.verdict.disagrees .verdict-mark,
.verdict.unchecked .verdict-mark { color: var(--color-error); }

.verdict-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

/* the scope of the check, in the annotation role — it marks the boundary between what the verdict
   covers and what is drawn below it */
.verdict-scope {
  margin: 0;
  color: var(--color-annotation);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/* the scope of a figure that cannot be split — marked, never filtered */
.scope {
  margin-right: var(--space-xs);
  padding: 0 var(--space-xs);
  border: 1px dashed var(--color-annotation);
  border-radius: 4px;
  color: var(--color-annotation);
}

.verdict-text,
.verdict-detail,
.verdict-note,
.footnote {
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.verdict-text {
  color: var(--color-text-primary);
}

.verdict-detail,
.verdict-note,
.footnote {
  color: var(--color-text-secondary);
}

.footnote {
  margin-top: var(--space-sm);
}

.hint {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-family: monospace;
}
</style>
