<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BookingPeriodTimeline from '@/components/runs/BookingPeriodTimeline.vue'
import BookingPeriodTable from '@/components/runs/BookingPeriodTable.vue'
import ScopeMark from '@/components/base/ScopeMark.vue'
import { amount } from '@/components/runs/report_format'
import { orderPeriods } from '@/components/runs/period_order'
import { useDisplaySettings } from '@/composables/use_display_settings'
import { useFillsPanel } from '@/composables/use_fills_panel'
import { useViewExpanded } from '@/composables/use_panel_view'
import { useScenarioSelection, showsUnit } from '@/composables/use_scenario_selection'
import type { LaneOrder } from '@/types/settings_types'
import type { BookingPeriodsReport } from '@/types/api/report_types'
import { plural, t } from '@/translate'

const props = defineProps<{
  model: BookingPeriodsReport
}>()

interface Verdict {
  tone: string
  mark: string
  text: string
}

/**
 * Only the two states worth saying out loud. A reconciliation that PASSED renders nothing at all —
 * see the note in the template — so it needs no wording, no tone and no glyph.
 *
 * `null` is not a pass with a missing number: the run reported no figure in this currency, so
 * nothing was compared, and that is shown as loudly as a failure — a tick there would claim
 * evidence that does not exist.
 */
const verdict = computed<Verdict>(() => {
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
 * The narrowing reaches the PERIODS, never the verdict above them. There is no per-unit version of
 * that check, and showing it over one lane would claim it was about that lane. It keeps its figures
 * and says whose they are.
 *
 * The two sides of the check, in FiniexTestingIDE's own division of labour (2026-10-07):
 * `total_net_pnl`, `total_fees` and `total_trades` are the sums over the PERIODS and are the
 * figures a consumer renders; `run_net_pnl` and `run_total_trades` are what the RUN reports and
 * exist to be compared against them, equal when `reconciles` holds. We render the `total_*` family
 * for that reason, and never the other.
 *
 * `unit_name` is the unit's identity here, the same value the roster calls `name`.
 */
// whether the reader left the period list open — kept as this panel's own view, across runs and reloads
const periodsOpen = useViewExpanded('periods-table')

const narrowing = useScenarioSelection()

/** A panel of its own gives the period table the height the rest leaves; the bundle's column does not. */
const fillsPanel = useFillsPanel()
const narrowed = computed(() => narrowing.units.value.length > 0)

const selectedPeriods = computed(() => {
  const units = narrowing.units.value
  if (!units.length) return props.model.periods
  return props.model.periods.filter(period => showsUnit(units, period.unit_name))
})

/** Each unit's served total, for the units on show — the table draws it after their periods. */
const shownTotals = computed(() =>
  props.model.unit_totals.filter(total => showsUnit(narrowing.units.value, total.unit_name)))

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
  <div class="booking-periods" :class="{ filling: fillsPanel }">
    <!-- The check comes first: it decides whether the rows below may be read as complete. -->
    <!--
      A CHECK THAT PASSED SAYS NOTHING.

      This reconciliation is ours, not the reader's: nobody opens a panel of booking periods asking
      whether our own arithmetic adds up. Where it fails, or where it could not run, that is the
      first thing they need — loud, framed, with both sides printed. Where it passes, the correct
      output is silence, and the periods below get the room.

      The explanation stays on the TITLE rather than the page: what the check proves is a caveat a
      reader wants once, and three lines of prose on every run is three lines of noise.
    -->
    <div v-if="model.reconciles !== true" class="verdict" :class="verdict.tone" :title="t('This compares completeness, not arithmetic: both figures descend from one value, so a wrong P&L moves them together and the check stays green.')">
      <span class="verdict-mark">{{ verdict.mark }}</span>
      <div class="verdict-body">
        <p class="verdict-text">
          <!-- a mark in the headline rather than a line of its own: a narrowing moves nothing -->
          <ScopeMark
            v-if="narrowed"
            :title="t('This check is the whole run — the periods below are those of the scenario in focus')"
          />
          {{ verdict.text }}
        </p>
        <p class="verdict-detail">
          {{ t('Periods') }}: {{ amount(model.total_net_pnl, model.currency) }} ·
          {{ plural(model.total_trades, t('trade'), t('trades')) }}
          &nbsp;|&nbsp;
          {{ t('Run') }}:
          <!-- the two are nullable apart from each other, so the count is shown only where it
               was stated rather than as an empty word beside a figure -->
          <template v-if="model.run_net_pnl !== null">
            {{ amount(model.run_net_pnl, model.currency) }}
            <template v-if="model.run_total_trades !== null">
              · {{ plural(model.run_total_trades, t('trade'), t('trades')) }}
            </template>
          </template>
          <template v-else>{{ t('nothing reported') }}</template>
        </p>
      </div>
    </div>

    <div v-if="!selectedPeriods.length" class="hint">
      {{ narrowed
        ? t('The scenario in focus booked no periods')
        : t('This run booked no periods') }}
    </div>
    <template v-else>
      <BookingPeriodTimeline
        v-model:order="laneOrder"
        :periods="orderedPeriods"
        :key-fields="model.keys.periods"
      />
      <BookingPeriodTable
        v-model:open="periodsOpen"
        class="period-table"
        :periods="orderedPeriods"
        :key-fields="model.keys.periods"
        :unit-totals="shownTotals"
        :fill="fillsPanel"
      />
    </template>

    <!-- No run-wide figures under the table (operator, 2026-10-19: never needed). The final equity
         over all accounts stands in the executive summary, with the account's deepest drawdown and
         the scenario it fell in; a unit's deepest period drawdown stays on its total's card. What
         is left is a caveat, and only where it applies: the rows above are one currency's. -->
    <p v-if="otherCurrencies.length" class="currencies-note">
      {{ t('Other account currencies') }}: {{ otherCurrencies.join(', ') }}
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

/* no `agrees` rule: a reconciliation that passed renders nothing at all, so the tone never occurs */
.verdict.disagrees { border-left-color: var(--color-error); }
.verdict.unchecked { border-left-color: var(--color-error); }

.verdict-mark {
  font-family: monospace;
  font-size: var(--font-size-lg);
}

.verdict.disagrees .verdict-mark,
.verdict.unchecked .verdict-mark { color: var(--color-error); }

.verdict-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.verdict-text,
.verdict-detail,
.verdict-note,
.currencies-note {
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.verdict-text {
  color: var(--color-text-primary);
}

.verdict-detail,
.verdict-note,
.currencies-note {
  color: var(--color-text-secondary);
}

.currencies-note {
  margin-top: var(--space-sm);
}

/* As a panel of its own, the panel's whole height, so the period table takes what the check and
   the timeline leave. Its cap was half the panel, whatever stood around it, and the rest stood
   empty below it (seen on screen 2026-10-19) — the run list's defect of 2026-10-16 again.
   Everything else keeps its own height; the table gives way and scrolls inside itself, keeping a
   few rows in a short panel. In the bundle's column the sections stack, and the list keeps its cap. */
.booking-periods.filling {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.booking-periods.filling > * {
  flex-shrink: 0;
}

.booking-periods.filling > .period-table {
  flex-shrink: 1;
}

.booking-periods.filling > .period-table[open] {
  min-height: min(8rem, 33cqh);
}

.hint {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-family: monospace;
}
</style>
