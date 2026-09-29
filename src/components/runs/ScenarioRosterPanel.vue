<script setup lang="ts">
import { computed, watch } from 'vue'
import FacetBar from '@/components/base/FacetBar.vue'
import HintLine from '@/components/base/HintLine.vue'
import AppButton from '@/components/base/AppButton.vue'
import { applyFacets, sortRows } from '@/components/base/facet_filter'
import { useFacetQuery } from '@/composables/use_facet_query'
import { useScenarioSelection } from '@/composables/use_scenario_selection'
import { amount, numberOrNa } from '@/components/runs/report_format'
import type { FacetDefinition, SortDefinition } from '@/types/facet_types'
import type { ScenarioRosterView, ScenarioRow } from '@/types/api/scenario_types'
import type { PortfolioUnitRow } from '@/types/api/report_types'
import { plural, t } from '@/translate'

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
 * The **tick timespan**: the market time a scenario actually processed, from its first to its last
 * tick. Both words are the backend's — measured, where a *data window* is declared, so a
 * tick-limited scenario ends before the window it was given.
 */
/** Polarity of what a unit earned — the same role the figure carries everywhere else. */
function signOf(row: ScenarioRow): string {
  const unit = earned(row)
  if (!unit || unit.net_profit === 0) return ''
  return unit.net_profit > 0 ? 'positive' : 'negative'
}

function covered(seconds: number): string {
  if (!seconds) return ''
  if (seconds < 5400) return `${(seconds / 60).toFixed(0)} min`
  if (seconds < 172_800) return `${(seconds / 3600).toFixed(1)} h`
  return `${(seconds / 86_400).toFixed(1)} d`
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

    <ul v-else class="roster-list">
      <li
        v-for="row in shown"
        :key="row.name"
        class="roster-row"
        :class="[row.status, { picked: isPicked(row.name) }]"
      >
        <button
          type="button"
          class="roster-head"
          :aria-pressed="isPicked(row.name)"
          :title="t('Show only this scenario in every section below')"
          @click="narrowing.toggle(row.name)"
        >
          <span class="roster-name">{{ row.name }}</span>
          <span class="roster-meta">
            {{ row.symbol }}
            <template v-if="row.market_type"> · {{ row.market_type }}</template>
            · {{ row.account_currency }}
            · {{ row.data_broker_type }}
          </span>
          <!-- a warning scoped to THIS unit; a run-wide one belongs to its own panel -->
          <span
            v-if="warnedUnits.get(row.name)"
            class="roster-mark warned"
            :title="t('This scenario carries a warning of its own')"
          >⚠ {{ warnedUnits.get(row.name) }}</span>
          <span class="roster-state" :class="row.status">
            {{ row.status === 'failed' ? '✖' : '✓' }} {{ row.status }}
          </span>
        </button>
        <p v-if="row.error_message" class="roster-reason">{{ row.error_message }}</p>
        <!-- What it DID, beside what it was. The figures come from the portfolio row joined on the
             unit name; a scenario the portfolio has no row for shows none of them rather than
             zeros, because "produced nothing" and "earned nothing" are different statements.

             Still not printed: worker_count, trades_requested and the signal counters read 0 on
             every row measured. -->
        <p v-else class="roster-figures">
          <span v-if="covered(row.tick_timespan_seconds)" class="figure-covered">
            {{ covered(row.tick_timespan_seconds) }}
          </span>
          {{ plural(row.ticks_processed, t('tick'), t('ticks')) }}
          <!-- the machine's own figure, told apart from the market's by its muted ink -->
          <span
            v-if="took(row.execution_time_ms)"
            class="figure-took"
            :title="t('Execution time: how long the scenario took on the machine')"
          >{{ t('in') }} {{ took(row.execution_time_ms) }}</span>
          <template v-if="earned(row)">
            · {{ plural(earned(row)!.total_trades, t('trade'), t('trades')) }}
            <span v-if="earned(row)!.total_trades" :class="signOf(row)">
              · {{ amount(earned(row)!.net_profit, earned(row)!.currency) }}
            </span>
            <template v-if="earned(row)!.total_trades">
              · {{ t('PF') }} {{ numberOrNa(earned(row)!.profit_factor, earned(row)!.total_trades) }}
            </template>
          </template>
        </p>
      </li>
    </ul>
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

.roster-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.roster-row {
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--color-border);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/* a button, because it is the control that narrows every section below — stripped back to the
   row it replaced, so nothing moved when it stopped being a plain div */
.roster-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* the mark sits in the annotation role and is a RULE down the side, so the narrowed row is not
   told apart by colour alone */
.roster-row.picked {
  border-left: 2px solid var(--color-annotation);
  padding-left: var(--space-xs);
}

.roster-row.picked .roster-name {
  color: var(--color-annotation);
}

/* the interactive role, because the name IS the control — a row that looks like running text is a
   control nobody finds, which is exactly how this one went unnoticed */
.roster-name {
  color: var(--color-accent);
}

/* the target reaches the whole row, so the hover says how far it extends */
.roster-head:hover {
  background-color: var(--color-bg-elevated);
}

.roster-head:hover .roster-name {
  text-decoration: underline;
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

.roster-meta,
.roster-figures {
  color: var(--color-text-secondary);
}

.roster-state {
  margin-left: auto;
}

.roster-state.success { color: var(--color-positive); }
.roster-state.failed { color: var(--color-error); }

/* a warning travels with its glyph, never on colour alone */
.roster-mark.warned {
  margin-left: auto;
  color: var(--color-warning);
}

/* the marked row already owns margin-left: auto, so the state follows the warning rather than
   fighting it for the right edge */
.roster-mark.warned + .roster-state {
  margin-left: var(--space-sm);
}

/* the tick timespan — the figure that says how BIG the scenario was, so it leads */
.figure-covered {
  color: var(--color-text-primary);
}

/* the machine's cost, not the market's: present, and plainly secondary to everything beside it */
.figure-took {
  color: var(--color-text-secondary);
}

.roster-figures .positive { color: var(--color-positive); }
.roster-figures .negative { color: var(--color-negative); }

.roster-reason {
  margin: var(--space-xs) 0 0;
  color: var(--color-error);
  white-space: pre-wrap;
}

.roster-figures {
  margin: var(--space-xs) 0 0;
}

.hint {
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
