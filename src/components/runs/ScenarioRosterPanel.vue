<script setup lang="ts">
import { computed, watch } from 'vue'
import FacetBar from '@/components/base/FacetBar.vue'
import HintLine from '@/components/base/HintLine.vue'
import AppButton from '@/components/base/AppButton.vue'
import RecordList from '@/components/base/RecordList.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import { useFacetQuery } from '@/composables/use_facet_query'
import { useScenarioSelection } from '@/composables/use_scenario_selection'
import {
  amount, magnitude, marketSpan, numberOrNa, percentFigure, percentOrNa, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { FacetDefinition, SortDefinition } from '@/types/facet_types'
import type { ListCard, ListColumn } from '@/types/list_types'
import type { Figure } from '@/types/figure_types'
import type { ScenarioRosterView, ScenarioRow } from '@/types/api/scenario_types'
import type { PortfolioUnitRow } from '@/types/api/report_types'
import { t } from '@/translate'

/**
 * Every scenario the run declared — the ones that produced nothing included, each with its reason.
 *
 * This is the only complete list: `portfolio`, `broker` and `run-summary` each answer a narrower
 * question, and comparing them is how a reader would otherwise discover that two scenarios are
 * missing. Settled with the backend 2026-09-25.
 *
 * A plain list under a facet bar rather than anything cleverer — the arrangement that carries a
 * tracker of thousands of rows, and the one the operator asked for.
 */
const props = defineProps<{
  model: ScenarioRosterView
}>()

const roster = computed(() => props.model.scenarios)

/**
 * What each scenario EARNED, by unit name — the documented foreign key, not a guess.
 *
 * A scenario with no portfolio row is not a scenario that earned nothing: the portfolio is the
 * shorter list by construction (declared · attempted · produced · counted), so an absent row means
 * the unit produced no result at all, and the roster shows nothing rather than a zero.
 */
const earnings = computed(() => {
  const byUnit = new Map<string, PortfolioUnitRow>()
  for (const unit of props.model.portfolio?.units ?? []) byUnit.set(unit.name, unit)
  return byUnit
})

/**
 * Which scenarios reported an error. The response declares `keys.errors: ["name"]` — ONE row per
 * unit — so this is a MARK, never a count: "2 errors" could not occur and would be an invention.
 */
const failedUnits = computed(() =>
  new Set((props.model.warningsErrors?.errors ?? []).map(row => row.name))
)

/**
 * Warnings scoped to a UNIT. A warning whose scope is `run` belongs to the whole run and is shown
 * in its own panel, not against a row here — attaching it to every scenario would multiply one
 * notice into forty.
 */
const warnedUnits = computed(() => {
  const counts = new Map<string, number>()
  for (const row of props.model.warningsErrors?.warnings ?? []) {
    if (row.scope === 'run') continue
    counts.set(row.scope, (counts.get(row.scope) ?? 0) + 1)
  }
  return counts
})

// the narrowing rides in the URL under `unitf` / `unitq` / `unitsort` — the same two words the
// `run=` and `unit=` params already use
const { selection, search, sort } = useFacetQuery('unit', 'name')

// a different run is a different roster, so a narrowing made for the old one means nothing
watch(() => props.model, () => {
  selection.value = {}
  search.value = ''
})

/**
 * A value the row does not state is NOT offered as a facet value: `market_type` is empty on every
 * run recorded before contract 5, and an empty string in a dropdown reads as a category rather
 * than as an absence. The bar drops a facet that has nothing left to offer.
 */
function stated(value: string): string[] {
  return value ? [value] : []
}

/** What a unit earned, or null where the portfolio has no row for it. */
function earned(row: ScenarioRow): PortfolioUnitRow | null {
  return earnings.value.get(row.name) ?? null
}

/**
 * The two facets that answer the questions an operator actually arrives with — *did anything
 * happen* and *did it go wrong* — rather than describing the configuration, which the five above
 * already do.
 *
 * Neither infers a category. "traded" is whether a stated count is zero, and profit / loss is the
 * SIGN of a stated figure — the same polarity this project already renders as a colour, here as a
 * filter instead. A unit with no portfolio row is claimed by neither value, which is the rule that
 * a row stating no value is never claimed by a facet.
 */
const facets: FacetDefinition<ScenarioRow>[] = [
  { id: 'symbol', label: 'Symbol', valuesOf: row => stated(row.symbol) },
  { id: 'market', label: 'Market', valuesOf: row => stated(row.market_type) },
  { id: 'currency', label: 'Currency', valuesOf: row => stated(row.account_currency) },
  { id: 'status', label: 'State', valuesOf: row => stated(row.status) },
  // the glossary's word for this value: 'kraken_spot' is a BROKER entry, not a data origin —
  // and 'data source' collides with the provenance complex, which is a different thing entirely
  { id: 'source', label: 'Broker', valuesOf: row => stated(row.data_broker_type) },
  {
    id: 'activity',
    label: 'Activity',
    valuesOf: row => {
      const unit = earned(row)
      if (!unit) return []
      return [unit.total_trades > 0 ? 'traded' : 'no trades']
    },
  },
  {
    id: 'result',
    label: 'Result',
    valuesOf: row => {
      const unit = earned(row)
      if (!unit || unit.total_trades === 0) return []
      if (unit.net_profit > 0) return ['profit']
      if (unit.net_profit < 0) return ['loss']
      return ['flat']
    },
  },
  {
    id: 'trouble',
    label: 'Trouble',
    valuesOf: row => {
      const marks: string[] = []
      if (failedUnits.value.has(row.name)) marks.push('error')
      if (warnedUnits.value.has(row.name)) marks.push('warning')
      return marks
    },
  },
]

/**
 * A scenario with no portfolio row sorts LAST on every figure that comes from one, whichever
 * direction is chosen. It has no value rather than a low one, and letting it sort as zero would
 * put "produced nothing" above "lost money", which is a ranking nobody asked for.
 */
function byUnit(pick: (unit: PortfolioUnitRow) => number) {
  return (a: ScenarioRow, b: ScenarioRow): number => {
    const left = earned(a)
    const right = earned(b)
    if (!left && !right) return 0
    if (!left) return 1
    if (!right) return -1
    return pick(right) - pick(left)
  }
}

/**
 * Nothing sorts by `worker_count`, `trades_requested` or the signal counters: measured over 370
 * rows on 2026-09-27, all five read 0 on EVERY row, including the 18 that processed ticks and
 * closed positions. A sort over a field that is always zero is a control that does nothing.
 */
const sorts: SortDefinition<ScenarioRow>[] = [
  { id: 'name', label: 'name', compare: (a, b) => a.name.localeCompare(b.name) },
  { id: 'pnl', label: 'net P&L', compare: byUnit(unit => unit.net_profit) },
  { id: 'trades', label: 'trades', compare: byUnit(unit => unit.total_trades) },
  {
    id: 'covered',
    label: 'tick timespan',
    compare: (a, b) => b.tick_timespan_seconds - a.tick_timespan_seconds,
  },
  { id: 'ticks', label: 'ticks', compare: (a, b) => b.ticks_processed - a.ticks_processed },
  {
    id: 'execution',
    label: 'execution time',
    compare: (a, b) => b.execution_time_ms - a.execution_time_ms,
  },
]

/**
 * Twelve columns, and the reason there are twelve rather than the four a name-and-meta line held:
 * a roster row answers *what was this scenario* and *what did it do*, and both halves were prose
 * before. Read down a column, forty scenarios compare; read across a sentence, they do not.
 *
 * Proportional tracks throughout — a `1fr` for the name and shares of the rest — because a content
 * sized track is measured from the cells that exist, and a narrowed list has different cells.
 *
 * The **tick timespan** is the market time a scenario actually processed, from its first to its
 * last tick; both words are the backend's. It is distinct from the *data window* it was declared
 * with, so a tick-limited scenario ends before the window it was given.
 */
const columns: ListColumn[] = [
  { label: t('Scenario'), width: 'minmax(9rem, 14fr)', rank: 1 },
  { label: t('Symbol'), width: 'minmax(0, 8fr)', rank: 3 },
  { label: t('Market'), width: 'minmax(0, 7fr)', rank: 4 },
  { label: t('Currency'), width: 'minmax(0, 5fr)', rank: 4 },
  // a broker name is an identity, not a figure: `kraken_sp…` names nothing
  { label: t('Broker'), width: 'minmax(0, 10fr)', rank: 4 },
  { label: t('Tick timespan'), width: 'minmax(0, 11fr)', figure: true, rank: 2 },
  { label: t('Ticks'), width: 'minmax(0, 9fr)', figure: true, rank: 3 },
  { label: t('Took'), width: 'minmax(0, 7fr)', figure: true, rank: 4 },
  { label: t('Trades'), width: 'minmax(0, 10fr)', figure: true, rank: 2 },
  { label: t('Win Rate'), width: 'minmax(0, 7fr)', figure: true, rank: 4 },
  { label: t('Net P&L'), width: 'minmax(0, 10fr)', figure: true, rank: 1 },
  { label: t('PF'), width: 'minmax(0, 5fr)', figure: true, rank: 4 },
  // the three the portfolio panel carried and nothing else did — per UNIT, not per run
  { label: t('Max DD'), width: 'minmax(0, 9fr)', figure: true, rank: 3 },
  { label: t('Fees'), width: 'minmax(0, 8fr)', figure: true, rank: 4 },
  /*
   * A FLOOR on the state, alone among the twelve besides the name — and rank 1 with them.
   *
   * Measured at a 900 px window the state read `f…` and `s…`, and whether a scenario failed is the
   * one thing a reader opens this list for. `✓ success` needs 4.5rem.
   *
   * The ranks above follow the same measurement: `market`, `currency` and `broker` carried the
   * SAME value on all ten rows there, so they are the first to go. What a narrow list keeps is
   * WHICH scenario, what it earned, and whether it worked.
   */
  { label: t('State'), width: 'minmax(4.5rem, 8fr)', rank: 1 },
]

/**
 * What the row has no width for — the ACCOUNT half of a scenario, which is why the portfolio panel
 * existed and is now gone.
 *
 * The portfolio response carries FIFTY fields per unit and that panel printed seventeen of them.
 * The four worth a column are columns; the rest are here, because they answer *what happened to
 * this account* rather than *how do these scenarios compare* — and a card is where a question about
 * ONE row belongs.
 *
 * Nothing is derived. Every line names a served field, `open_positions` excepted: it is on the wire
 * and not mirrored, so the count is not claimed.
 */
function card(row: ScenarioRow): ListCard | null {
  const unit = earned(row)
  if (!unit) return null
  const money = (value: number) => amount(value, unit.currency)
  const details: Figure[] = [
    { label: t('Opened with'), value: money(unit.initial_balance) },
    {
      label: t('Balance'),
      value: money(unit.current_balance),
      title: t('Realised only. The equity below values what is still open as well.'),
    },
    {
      label: t('Final equity'),
      value: money(unit.final_equity),
      title: unit.final_equity_valued
        ? t('Marked at the close of the run.')
        : t('The valuation did not succeed — this is not the same as an equity of zero.'),
      tone: unit.final_equity_valued ? '' : 'warning',
    },
    { label: t('Unrealised'), value: money(unit.unrealized_pnl), tone: signClass(unit.unrealized_pnl) },
    { label: t('Max equity'), value: money(unit.max_equity) },
    {
      label: t('Deepest drawdown'),
      value: `${magnitude(unit.account_max_drawdown, unit.currency)} `
        + `(${percentFigure(unit.account_max_dd_pct)})`,
    },
    { label: t('Long / short'), value: `${unit.total_long_trades} / ${unit.total_short_trades}` },
    { label: t('Spread'), value: money(unit.total_spread_cost) },
    { label: t('Commission'), value: money(unit.total_commission) },
    { label: t('Swap'), value: money(unit.total_swap) },
  ]
  // the maker/taker halves only where a fee of that kind was charged — two zeroes on every forex
  // row is noise, and on a spot row they are the whole cost
  if (unit.maker_fee || unit.taker_fee) {
    details.push({ label: t('Maker / taker'), value: `${money(unit.maker_fee)} / ${money(unit.taker_fee)}` })
  }
  // where a decline began, and whether it was inherited — a drawdown carried in from an earlier
  // session is not one this scenario produced
  if (unit.drawdown_started_at) {
    details.push({ label: t('Drawdown began'), value: utcInstant(unit.drawdown_started_at) })
  }
  if (unit.drawdown_carried_from) {
    details.push({ label: t('Carried from'), value: unit.drawdown_carried_from })
  }
  if (unit.drawdown_restarts) {
    details.push({ label: t('Drawdown restarts'), value: String(unit.drawdown_restarts) })
  }
  details.push({ label: t('Fees charged'), value: money(unit.fees_charged) })
  return { title: `${row.name} · ${unit.currency}`, details }
}

/** Polarity of what a unit earned — the same role the figure carries everywhere else. */
function signOf(row: ScenarioRow): string {
  const unit = earned(row)
  if (!unit || unit.net_profit === 0) return ''
  return unit.net_profit > 0 ? 'positive' : 'negative'
}

/**
 * The **execution time**: how long the scenario took on the machine, which says nothing about how
 * much market time it processed. Held back until contract 13, where the field stopped carrying
 * seconds under a millisecond name — 1.98 for 13,584 ticks was 1.98 SECONDS, and sorting by a
 * figure whose unit is unknown ranks scenarios by a number nobody can read.
 */
function took(milliseconds: number): string {
  if (!milliseconds) return ''
  if (milliseconds < 1000) return `${milliseconds.toFixed(0)} ms`
  return `${(milliseconds / 1000).toFixed(1)} s`
}

const shown = computed(() => sortRows(
  applyFacets({
    rows: roster.value.units,
    definitions: facets,
    selection: selection.value,
    search: search.value,
    searchOf: row => row.name,
  }),
  sorts,
  sort.value
))

const failed = computed(() => roster.value.units.filter(row => row.status === 'failed').length)

/**
 * The roster is where a scenario is CHOSEN — it is the only complete list, so it is the only place
 * every scenario can be reached from, the ones that produced nothing included. A second click on a
 * marked row takes it out again, which makes the row its own way back out.
 */
const narrowing = useScenarioSelection()
const picked = computed(() => narrowing.units.value)

function isPicked(name: string): boolean {
  return picked.value.includes(name)
}

/** Two sentences rather than one with a number in it — "1 scenarios" is how that reads otherwise. */
const chosenLabel = computed(() =>
  picked.value.length === 1
    ? t('1 scenario chosen — every section below shows only it')
    : `${picked.value.length} ${t('scenarios chosen — every section below shows only these')}`
)
</script>

<template>
  <div class="scenario-roster">
    <!-- the count of what never ran belongs above the filter: it is a property of the RUN, and a
         narrowed list would otherwise hide the very rows a reader most needs to see -->
    <p v-if="failed" class="roster-notice">
      <span class="mark">⚠</span>
      {{ failed }} {{ t('of') }} {{ roster.units.length }}
      {{ t('scenarios produced nothing — their reason is on the row') }}
    </p>

    <!-- The state where the CLICK happens. It is also said once above the panel column, because it
         governs every section there — but a reader who just clicked is looking here.

         It says CHOSEN, not "showing only": this list still shows every scenario, and the facet
         count beside it already means "how many rows are listed". Two counts over scenarios that
         contradict each other are worse than one. -->
    <p v-if="picked.length" class="roster-picked">
      <span class="mark" aria-hidden="true">⌖</span>
      <span>{{ chosenLabel }}</span>
      <AppButton variant="quiet" @click="narrowing.clear()">
        {{ t('Clear') }}
      </AppButton>
    </p>
    <!-- and where nothing is picked, what picking would do -->
    <HintLine v-else id="scenario-pick" />

    <FacetBar
      v-model:selection="selection"
      v-model:search="search"
      v-model:sort="sort"
      :rows="roster.units"
      :facets="facets"
      :sorts="sorts"
      :search-of="row => row.name"
      :search-placeholder="t('Search scenarios')"
    />

    <p v-if="!shown.length" class="hint">{{ t('No scenario matches') }}</p>

    <!-- What it WAS and what it DID, in one row of columns. The figures after the broker come from
         the portfolio row joined on the unit name; a scenario the portfolio has no row for shows
         none of them rather than zeros, because "produced nothing" and "earned nothing" are
         different statements.

         Still not printed: worker_count, trades_requested and the signal counters read 0 on every
         row measured. -->
    <RecordList
      v-else
      class="roster-list"
      :rows="shown"
      :columns="columns"
      :row-key="row => row.name"
      :is-picked="row => isPicked(row.name)"
      :has-detail="row => Boolean(row.error_message)"
      :row-card="card"
      @pick="row => narrowing.toggle(row.name)"
    >
      <template #default="{ row }">
        <span :data-rank="1" class="roster-name" :title="row.name">{{ row.name }}</span>
        <span :data-rank="3">{{ row.symbol }}</span>
        <span :data-rank="4">{{ row.market_type }}</span>
        <span :data-rank="4">{{ row.account_currency }}</span>
        <span :data-rank="4">{{ row.data_broker_type }}</span>
        <span :data-rank="2" class="figure-covered">{{ marketSpan(row.tick_timespan_seconds) }}</span>
        <span :data-rank="3">{{ row.ticks_processed.toLocaleString() }}</span>
        <!-- the machine's own figure, told apart from the market's by its muted ink -->
        <span
          :data-rank="4"
          class="figure-took"
          :title="t('Execution time: how long the scenario took on the machine, which says nothing about how much market time it processed')"
        >{{ took(row.execution_time_ms) }}</span>
        <span :data-rank="2">
          <template v-if="earned(row)">
            {{ earned(row)!.total_trades }}
            <template v-if="earned(row)!.total_trades">
              ({{ earned(row)!.winning_trades }}W/{{ earned(row)!.losing_trades }}L)
            </template>
          </template>
        </span>
        <span :data-rank="4">
          <template v-if="earned(row)">
            {{ percentOrNa(earned(row)!.win_rate, earned(row)!.total_trades) }}
          </template>
        </span>
        <span :data-rank="1" :class="signOf(row)">
          <template v-if="earned(row) && earned(row)!.total_trades">
            {{ amount(earned(row)!.net_profit, earned(row)!.currency) }}
          </template>
        </span>
        <span :data-rank="4">
          <template v-if="earned(row) && earned(row)!.total_trades">
            {{ numberOrNa(earned(row)!.profit_factor, earned(row)!.total_trades) }}
          </template>
        </span>
        <span :data-rank="3">
          <template v-if="earned(row)">
            {{ magnitude(earned(row)!.account_max_drawdown, earned(row)!.currency) }}
          </template>
        </span>
        <span :data-rank="4">
          <template v-if="earned(row)">
            {{ amount(earned(row)!.total_fees, earned(row)!.currency) }}
          </template>
        </span>
        <span :data-rank="1" class="roster-state" :class="row.status">
          {{ row.status === 'failed' ? '✖' : '✓' }} {{ row.status }}
          <!-- a warning scoped to THIS unit; a run-wide one belongs to its own panel -->
          <span
            v-if="warnedUnits.get(row.name)"
            class="roster-mark warned"
            :title="t('This scenario carries a warning of its own')"
          >⚠ {{ warnedUnits.get(row.name) }}</span>
        </span>
      </template>

      <!-- the reason a scenario produced nothing is prose and spans every track: squeezed into a
           column it would make that column as wide as the longest sentence in the run -->
      <template #detail="{ row }">{{ row.error_message }}</template>
    </RecordList>
  </div>
</template>

<style scoped>
.roster-notice {
  display: flex;
  gap: var(--space-xs);
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-warning);
  border-radius: 4px;
  color: var(--color-warning);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/* only what the shared list does NOT own: it carries the tracks, the row states, the picked edge
   and the spanning reason line */
.roster-list {
  max-height: 60vh;
  overflow-y: auto;
}

/* the interactive role, because the name IS the control — a row that looks like running text is a
   control nobody finds, which is exactly how this one went unnoticed */
.roster-name {
  color: var(--color-accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* the chosen row wears the annotation role in its name as well as on its edge, so it is not told
   apart by one channel alone */
.roster-list :deep(.record-row.picked) .roster-name {
  color: var(--color-annotation);
}

.roster-list :deep(.record-row:hover) .roster-name {
  text-decoration: underline;
}

/* every cell is a short word or a figure, so none of them wraps: the row stays one line and the
   columns stay comparable down the page */
.roster-list :deep(.record-row) > span,
.roster-list :deep(.record-group) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roster-picked {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-annotation);
  border-radius: 4px;
  color: var(--color-annotation);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.roster-picked .app-button {
  margin-left: auto;
}

.roster-state {
  white-space: nowrap;
}

.roster-state.success { color: var(--color-positive); }
.roster-state.failed { color: var(--color-error); }

/* a warning travels with its glyph, never on colour alone. It rides in the STATE cell: a track of
   its own stood empty on every healthy row and pushed the state off the edge. */
.roster-mark.warned {
  margin-left: var(--space-xs);
  color: var(--color-warning);
}

/* the tick timespan — the figure that says how BIG the scenario was */
.figure-covered {
  color: var(--color-text-primary);
}

/* the machine's cost, not the market's: present, and plainly secondary to everything beside it */
.figure-took {
  color: var(--color-text-secondary);
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }

/* the reason a scenario produced nothing is prose, and the list gives it every track — it only
   needs its line breaks kept */
.roster-list :deep(.record-detail) {
  white-space: pre-wrap;
}

.hint {
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
