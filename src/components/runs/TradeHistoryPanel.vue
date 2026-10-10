<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import RecordList from '@/components/base/RecordList.vue'
import {
  amount, magnitude, numberOrNa, signClass, utcInstant,
} from '@/components/runs/report_format'
import { useDisplaySettings } from '@/composables/use_display_settings'
import { useScenarioSelection, showsUnit } from '@/composables/use_scenario_selection'
import { marksPosition, usePositionLink } from '@/composables/use_position_link'
import { rowKey } from '@/api/list_key'
import type { ListCard, ListColumn } from '@/types/list_types'
import type { TradeExecution, TradeHistoryReport, TradeRow } from '@/types/api/report_types'
import { plural, t } from '@/translate'

const props = defineProps<{
  model: TradeHistoryReport
}>()

/**
 * PROPORTIONAL tracks, not content-sized ones, and this is load-bearing rather than a preference.
 *
 * While every group is CLOSED the first five columns hold no cells at all — the group heading
 * spans them — so an `auto` or `max-content` track is sized from nothing and then re-sized the
 * moment a group opens, sliding every heading sideways. That was a real defect, fixed once with
 * `table-layout: fixed` plus eight percentage widths; these are those same eight proportions,
 * carried into the track declaration that now prevents it.
 *
 * `fr` rather than `%` because the grid's gaps are subtracted first, which percentages ignore and
 * then overflow. `minmax(0, …)` because a bare `Nfr` keeps an automatic MINIMUM, so one long cell
 * would widen its column after all.
 */
const columns: ListColumn[] = [
  /*
   * FIRST, and it is the trade's own key field rather than an affordance bolted on: a trade is
   * keyed `(scenario_name, position_id, exit_tick_index)`, so the position is part of what makes
   * this row itself. It is also the way back to the orders, which is why it reads as a link.
   *
   * Leftmost in BOTH panels, deliberately: the same field in the same place, so the two lists read
   * as two views of one thing. Rank 3, with the lots and the held time — navigation gives way to
   * the figures before the figures give way to each other.
   */
  {
    label: t('Position'),
    hint: t('The position this trade closed — a partial close books one trade more, so a trade is not its position.'),
    width: 'minmax(0, 14fr)',
    rank: 3,
  },
  // 12 rather than the table's 9: the old cells OVERFLOWED their column, so a symbol always showed
  // in full; a grid cell truncates instead, and 9 % cut `ETHUSD` to `ETHU…`. The three points come
  // from the two excursion columns, which had room to spare for an eight-character amount.
  { label: t('Symbol'), width: 'minmax(0, 12fr)', rank: 1 },
  { label: t('Dir'), width: 'minmax(0, 7fr)', rank: 2 },
  { label: t('Lots'), width: 'minmax(0, 7fr)', figure: true, rank: 3 },
  // rank 1 with the symbol, and the two together are what IDENTIFIES a trade to a reader: a
  // scenario trades one symbol many times, so the moment is what tells two rows apart
  { label: t('Opened'), width: 'minmax(0, 19fr)', rank: 1 },
  { label: t('Held'), width: 'minmax(0, 8fr)', figure: true, rank: 3 },
  { label: t('Worst against'), width: 'minmax(0, 16fr)', figure: true, rank: 4 },
  { label: t('Best in favour'), width: 'minmax(0, 16fr)', figure: true, rank: 4 },
  /*
   * LAST, where it was sixth, and the move is structural rather than cosmetic.
   *
   * The group heading is three cells over eight tracks — the name over five, the net over one, the
   * count and fees over the last two. That arithmetic is fixed at eight, and a rank that gives up
   * a column leaves it spanning tracks the grid no longer has. Counted from the END it holds at
   * every width: the name takes everything but the last track, the net takes the last one.
   *
   * Reading order gains by it besides. Opened · Held · worst · best · net is the life of the trade
   * in order, and the result of it now closes the line instead of sitting in the middle.
   */
  { label: t('Net P&L'), width: 'minmax(0, 15fr)', figure: true, rank: 1 },
]

/**
 * The fills of one trade — the executions that opened and closed it. Presented the way the
 * backend's own printout does, with the label inside the cell, so the sub-list needs no headings
 * of its own over two lines.
 */
const fillColumns: ListColumn[] = [
  { label: '', width: 'minmax(0, 10fr)' },
  { label: '', width: 'minmax(0, 24fr)' },
  { label: '', width: 'minmax(0, 10fr)' },
  { label: '', width: 'minmax(0, 24fr)' },
  { label: '', width: 'minmax(0, 15fr)' },
  { label: '', width: 'minmax(0, 14fr)' },
  { label: '', width: 'minmax(0, 7fr)' },
]

const display = useDisplaySettings()

/**
 * Rows drawn without virtualisation. A backtest of a few hours produces a handful; a thirty-day
 * session produces thousands, and drawing all of them would stall the page. So there is a cap —
 * and it is VISIBLE: a silent truncation reads as "that was all", which is the one thing a trade
 * list must never say. Virtualisation replaces this the day a run actually exceeds it.
 */
const rowCap = computed(() => display.value.tradeRowCap)

const narrowing = useScenarioSelection()
const link = usePositionLink()

/**
 * The way back to the orders of this trade's position — the DECLARED join
 * `(scenario_name, position_id)`, never the id alone: every scenario counts from `pos_<symbol>_1`.
 *
 * A trade is one CLOSE of a position, so several trades can lead to the same orders. That is
 * correct and not a collision: the question "what happened on the way to this position" has one
 * answer whichever of its closes the reader came from.
 */
function jumpToOrders(trade: TradeRow): void {
  link.jumpTo('orders', { scenario: trade.scenario_name, position: trade.position_id })
}

/** Every trade of the position a reader jumped to — a partial close means there are several. */
function rowClass(trade: TradeRow): string | undefined {
  return marksPosition(link.marked.value, trade.scenario_name, trade.position_id)
    ? 'marked'
    : undefined
}

/**
 * True while one scenario is on show. The funnel above the rows comes from `run-summary` and is a
 * RUN-wide count that cannot be split per unit, so it says so rather than sitting unlabelled over
 * a single scenario's trades — a run-wide figure read as a unit's is the silent wrongness this
 * whole selection was built to avoid.
 */
const narrowed = computed(() => narrowing.units.value.length > 0)

/**
 * The narrowing applies to the ROWS, and before the cap. Capping first would take the first N
 * trades of the whole run and filter what is left, so a unit that traded late would show nothing
 * while the panel claimed it had drawn everything.
 *
 * `scenario_name` is the unit's identity here — one value under four field names, confirmed in
 * the backend's code. A unit that traded nothing is still in the roster, so an empty result means
 * "traded nothing", never "failed to match", and the empty state below says exactly that.
 */
const selected = computed(() => {
  const units = narrowing.units.value
  if (!units.length) return props.model.trades
  return props.model.trades.filter(trade => showsUnit(units, trade.scenario_name))
})

const shown = computed(() => selected.value.slice(0, rowCap.value))
const hidden = computed(() => Math.max(0, selected.value.length - rowCap.value))

/**
 * What the cap is measured against. `count` is the run's own total and can exceed the rows the
 * response carried, so it stays the figure for the whole run — but under a narrowing it would
 * name a number the rows below have nothing to do with.
 */
const total = computed(() => narrowed.value ? selected.value.length : props.model.count)

/**
 * The trades grouped under the unit that produced them, each group carrying its own totals.
 *
 * A flat list with the totals in a footer put six units' rows one after another with nothing
 * saying where one ended — and the footer then read as more trades rather than as a summary. A
 * group header answers both at once: it shows the boundary AND puts the figures beside the rows
 * they are about. The unit order follows the trade order the backend returned; nothing is re-sorted.
 */
/**
 * What makes one trade unique — READ from the response rather than known, which is the whole point
 * of the declaration. `position_id` alone repeats in 3 of the 11 runs on this machine
 * (`pos_usdjpy_1` three times in one): a partial close books several records of ONE position, and
 * two scenarios of the same symbol both count from `pos_<symbol>_1`.
 */
const tradeKey = computed(() => props.model.keys.trades)

/**
 * A group heading's figures are the ones the API SERVED for that group, looked up by its key —
 * never folded from the rows. That is not fastidiousness: the backend's own reductions state that
 * a drawdown must come from the row that won it, a rate is rebuilt from summed components rather
 * than averaged, and a streak can cross a boundary. Folding here would be a second source of truth
 * that disagrees with theirs in exactly the cases nobody checks.
 *
 * Totals are declared unique by (scenario_name, currency), so a scenario that traded in two
 * currencies has TWO of them. Keying this map on the name alone let the second overwrite the first
 * in silence. No run does it today — but the declared key says it is possible, and the heading
 * shows one figure, so a scenario with more than one total gets NONE and falls back to its row
 * count rather than being handed an arbitrary half.
 */
const totals = computed(() => {
  const byName = new Map<string, typeof props.model.scenario_totals>()
  for (const total of props.model.scenario_totals) {
    const bucket = byName.get(total.scenario_name) ?? []
    bucket.push(total)
    byName.set(total.scenario_name, bucket)
  }
  return new Map(
    [...byName.entries()]
      .filter(([, bucket]) => bucket.length === 1)
      .map(([name, bucket]) => [name, bucket[0]!])
  )
})

function totalOf(name: string) {
  return totals.value.get(name) ?? null
}

/**
 * How many units the drawn rows cover. The list itself does the partitioning now, so this counts
 * the distinct names rather than building a second set of groups beside the one on screen.
 */
const unitCount = computed(() => new Set(shown.value.map(trade => trade.scenario_name)).size)

/**
 * Past the scenario threshold the individual unit recedes and its summary becomes the primary
 * thing: the group header still states the name, the net, the fees and the count, and the rows
 * under it wait to be asked for. A forty-scenario run is otherwise a list nobody reads.
 *
 * Nothing is hidden silently — the header says how many trades are behind it, and it is one click.
 */
const summarised = computed(() => unitCount.value >= display.value.scenarioThreshold)

/** A unit the reader has opened or closed by hand, which outranks the threshold for that unit. */
const overrides = ref(new Map<string, boolean>())

/**
 * A different RUN is a different set of units, so a choice made about the old one means nothing.
 *
 * Watched by the run's OWN id, never by `props.model`. The model is composed by the host — a fresh
 * object literal on every evaluation of its `sources` — so watching its identity forgets the
 * reader's choices whenever anything upstream re-evaluates, and the group they just opened closes
 * under them. The unit suite could not see it: there the model is a stable object.
 */
watch(() => props.model.run_id, () => overrides.value.clear())

function isExpanded(name: string): boolean {
  return overrides.value.get(name) ?? !summarised.value
}

function toggleGroup(name: string): void {
  overrides.value.set(name, !isExpanded(name))
}

/**
 * One execution, with the leg it came from. The leg is response STRUCTURE — which array held it —
 * not a value we worked out.
 */
interface FillRow {
  leg: string
  execution: TradeExecution
}

/**
 * The fills a reader has opened, by the trade's own key. Collapsed by default: measured on a real
 * run, every trade has one entry fill and one exit fill, so showing them always would treble the
 * list for two lines that matter on the 61 trades of 85 whose entry is SHARED with another trade.
 */
const openFills = ref(new Set<string>())

watch(() => props.model.run_id, () => openFills.value.clear())

function toggleFills(trade: TradeRow): void {
  const key = rowKey(trade, tradeKey.value)
  const open = new Set(openFills.value)
  if (!open.delete(key)) open.add(key)
  openFills.value = open
}

function showsFills(trade: TradeRow): boolean {
  return openFills.value.has(rowKey(trade, tradeKey.value))
}

function fillsOf(trade: TradeRow): FillRow[] {
  return [
    ...trade.entry_executions.map(execution => ({ leg: t('in'), execution })),
    ...trade.exit_executions.map(execution => ({ leg: t('out'), execution })),
  ]
}

/**
 * What this trade took of a fill it shares with others — the `shared(Nx)` line of the backend's own
 * printout. All three figures are served: `lots` on the trade, `volume` and `shared_by` on the
 * execution.
 *
 * Gated on `shared_by`, not on a volume comparison. The count is the backend's statement that the
 * fill belongs to several trades; comparing the two volumes would be us inferring the same thing,
 * and it would also be blind in the other direction — a fill can be shared without this trade's
 * share differing from the whole of it in any way we could see.
 */
function shareOf(trade: TradeRow, fill: FillRow): string {
  const shared = fill.execution.shared_by
  if (shared <= 1) return ''
  return `${trade.lots} ${t('of')} ${fill.execution.volume} · `
    + `${t('shared by')} ${plural(shared, t('trade'), t('trades'))}`
}

/**
 * In how many RECORDS this position was closed — one where it was closed whole.
 *
 * **`position_closes` on the row since contract 23, and it retires the `[0]` assumption.** This used
 * to read `entry_executions[0].shared_by`, which was safe only while every execution list was
 * 1-element: measured 1,556 of 1,556 at the time, with their cardinality table holding N-element
 * cases dormant until #143 and #342. The field says the same thing without reaching into a list at
 * all, and their note gives it the same property the old one had — *counted before any filter* — so
 * it still holds on a narrowed list where counting our own rows would not.
 *
 * `shareOf` below still reads `shared_by`, and that is correct: it sits on the EXECUTION and says
 * how many trades share THAT fill, which is a different statement from how many records the
 * position produced.
 *
 * It matters because the partial is a common case rather than an edge: 2 of the 18 trades in the
 * capture and 952 of 1,556 across the older archive belong to a position closed in parts. A row
 * reading `0.02` where the reader opened `0.10` is the question this answers.
 */
function closedInParts(trade: TradeRow): number {
  return trade.position_closes || 1
}

/**
 * The whole sentence, for the hover.
 *
 * `entry_lots` replaced a reach into `entry_executions[0].volume` (contract 23): the position's size
 * at ENTRY, stated on the row, so nothing has to be summed or indexed to say what was opened.
 *
 * And `close_type` says which record ENDED the chain — `full` is the last one — which answers the
 * third of the three questions put to testingide on 2026-10-05 and could not be answered from
 * `shared_by` at all.
 */
function partsOf(trade: TradeRow): string {
  const parts = closedInParts(trade)
  if (parts <= 1) return ''
  const ending = trade.close_type === 'full' ? t('this record closed it') : t('it stayed open after this')
  return `${t('This position was closed in parts')} — `
    + `${trade.lots} ${t('of')} ${trade.entry_lots} ${t('here')}, `
    + `${t('over')} ${plural(parts, t('record'), t('records'))}. ${ending}.`
}

/** Seconds as the operator reads a holding period. */
function held(seconds: number): string {
  if (seconds < 90) return `${seconds.toFixed(0)} s`
  if (seconds < 5400) return `${(seconds / 60).toFixed(0)} min`
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} h`
  return `${(seconds / 86400).toFixed(1)} d`
}

/**
 * Everything the row has no width for. The excursions are given three ways by the backend — as a
 * price, as the unrealised P&L at that price, and as a distance — and all three are here, because
 * which one answers a question depends on the question.
 */
function details(trade: TradeRow): { label: string, value: string, tone?: string }[] {
  const rows = [
    { label: t('Opened'), value: `${utcInstant(trade.entry_time)} @ ${trade.entry_price}` },
    { label: t('Closed'), value: `${utcInstant(trade.exit_time)} @ ${trade.exit_price}` },
    { label: t('Ticks'), value: `${trade.entry_tick_index} to ${trade.exit_tick_index}` },
    { label: t('Entry'), value: `${trade.entry_type} · ${trade.entry_side}` },
    {
      label: t('Gross'),
      value: amount(trade.gross_pnl, trade.currency),
      tone: signClass(trade.gross_pnl),
    },
    {
      label: t('Net'),
      value: amount(trade.net_pnl, trade.currency),
      tone: signClass(trade.net_pnl),
    },
    {
      // `total_fees` is commission plus swap and nothing else — measured over 1,591 trade rows,
      // 1,563 of which carry a non-zero spread. Listing the spread as a third part of it printed
      // `Fees 0.00 · spread 1.30` on a trade whose spread WAS the whole cost. So the spread stands
      // on its own below, the way the aggregated panel has always listed it.
      label: t('Fees'),
      value: `${amount(trade.total_fees, trade.currency)} · ${t('commission')} `
        + `${trade.commission_cost.toFixed(2)} · ${t('swap')} ${trade.swap_cost.toFixed(2)}`,
    },
    {
      label: t('Spread'),
      value: amount(trade.spread_cost, trade.currency),
    },
    {
      label: t('Slippage'),
      // the exit half is absent on a quarter of the trades in this archive — stated as such rather
      // than as a zero, and never assumed to be a number
      value: `${t('in')} ${trade.entry_slippage.toFixed(4)} · `
        + `${t('out')} ${trade.exit_slippage === null ? t('n/a') : trade.exit_slippage.toFixed(4)}`,
    },
    {
      label: t('Worst against'),
      value: `${magnitude(trade.mae_pnl, trade.currency)} @ ${trade.mae_price} · `
        + `${trade.mae_distance.toFixed(2)} ${trade.price_unit}`,
    },
    {
      label: t('Best in favour'),
      value: `${amount(trade.mfe_pnl, trade.currency)} @ ${trade.mfe_price} · `
        + `${trade.mfe_distance.toFixed(2)} ${trade.price_unit}`,
    },
    // null where no stop was set: the trade has no R to be a multiple of, which is an absence
    { label: t('R multiple'), value: numberOrNa(trade.r_multiple) },
    {
      label: t('Fills'),
      value: `${trade.entry_executions.length} / ${trade.exit_executions.length}`,
    },
  ]
  // '' means the close was not attributed — shown only where it says something
  if (trade.close_reason) rows.splice(3, 0, { label: t('Closed by'), value: trade.close_reason })
  if (trade.stop_loss !== null) rows.push({ label: t('Stop loss'), value: String(trade.stop_loss) })
  if (trade.take_profit !== null) {
    rows.push({ label: t('Take profit'), value: String(trade.take_profit) })
  }
  return rows
}

/** Every trade has a card — there is always more than eight columns can hold. */
function card(trade: TradeRow): ListCard {
  return {
    title: `${trade.scenario_name} · ${trade.direction} ${trade.lots}`,
    details: details(trade),
  }
}
</script>

<template>
  <div class="trade-history">
    <p v-if="hidden" class="notice">
      <span class="mark">⚠</span>
      {{ t('Showing the first') }} {{ rowCap }} {{ t('of') }} {{ total }}
      {{ t('trades — the remainder are not drawn, which is not the same as not there') }}
    </p>

    <!-- an empty narrowed set is a statement about the SCENARIO, not a failed match: every unit
         the run declared is in the roster whether it traded or not -->
    <div v-if="!selected.length" class="hint">
      {{ narrowed
        ? t('The chosen scenarios closed no positions')
        : t('This run closed no positions') }}
    </div>
    <RecordList
      v-else
      class="trade-list"
      :rows="shown"
      :columns="columns"
      :row-key="trade => rowKey(trade, tradeKey)"
      :row-class="rowClass"
      :group-by="trade => trade.scenario_name"
      :is-open="isExpanded"
      :row-card="card"
      :shows-children="showsFills"
      @toggle="toggleGroup"
      @pick="toggleFills"
    >
      <!--
        The boundary and the summary in one row: it says where a unit's trades begin AND what they
        came to, instead of leaving the second half in a detached footer. The figures are the API's
        SERVED `scenario_totals`, looked up by name — and the net still lands under its own heading,
        so a reader runs down the one column and meets both the trades and their totals.
      -->
      <template #group="{ group, marker }">
        <!-- TWO cells, counted from the end: everything but the last track, then the last track.
             The old three-cell form was fixed at eight columns and a rank that gives one up would
             leave it spanning tracks the grid no longer has. The count and the fees ride inside the
             name — they are a note ABOUT the group, never values of a column. -->
        <span class="group-name" :title="group.key">
          <span v-if="marker" class="record-marker" aria-hidden="true">{{ marker }}</span>
          {{ group.key }}
          <span class="group-meta">
            {{ plural(group.rows.length, t('trade'), t('trades')) }}
            <template v-if="totalOf(group.key)">
              · {{ t('fees') }}
              {{ amount(totalOf(group.key)!.total_fees, totalOf(group.key)!.currency) }}
            </template>
          </span>
        </span>
        <span class="group-net" :class="signClass(totalOf(group.key)?.net_pnl ?? 0)">
          <template v-if="totalOf(group.key)">
            {{ amount(totalOf(group.key)!.net_pnl, totalOf(group.key)!.currency) }}
          </template>
        </span>
      </template>

      <!-- the rank on every cell is the one its own column declares, and each of these lists
           asserts the two agree: the list owns the tracks, this template owns the cells -->
      <template #default="{ row: trade, marker }">
        <span :data-rank="3" class="trade-position" :title="partsOf(trade) || trade.position_id">
          <!-- the fills opened with no glyph at all until 2026-10-08, so nothing said the row
               could be opened. The LIST decides the shape; this only places it. -->
          <span v-if="marker" class="record-marker" aria-hidden="true">{{ marker }}</span>
          <!-- a link only where there is an Orders panel to land in -->
          <button
            v-if="link.canJumpTo('orders')"
            type="button"
            class="to-orders"
            :title="t('Show the orders of this position')"
            @click.stop="jumpToOrders(trade)"
          >{{ trade.position_id }} ↗</button>
          <template v-else>{{ trade.position_id }}</template>
          <!-- the partial, said on the ROW. 952 of 1,556 trades are one, and the reader who sees
               0.02 where they opened 0.10 had to open the fills to find out why -->
          <span v-if="closedInParts(trade) > 1" class="in-parts"
            >{{ t('of') }} {{ closedInParts(trade) }}</span>
        </span>
        <span :data-rank="1" :title="trade.symbol">{{ trade.symbol }}</span>
        <span :data-rank="2">{{ trade.direction }}</span>
        <span :data-rank="3" class="figure-cell">{{ trade.lots }}</span>
        <span :data-rank="1">{{ utcInstant(trade.entry_time) }}</span>
        <span :data-rank="3" class="figure-cell">{{ held(trade.duration_s) }}</span>
        <span :data-rank="4" class="figure-cell">{{ magnitude(trade.mae_pnl, trade.currency) }}</span>
        <span :data-rank="4" class="figure-cell">{{ amount(trade.mfe_pnl, trade.currency) }}</span>
        <span :data-rank="1" class="figure-cell" :class="signClass(trade.net_pnl)">
          {{ amount(trade.net_pnl, trade.currency) }}
        </span>
      </template>

      <!--
        The third level: the executions that opened and closed this trade. Laid out the way the
        backend's own printout does, label inside the cell — so the sub-list needs no headings over
        two lines, and it is read-only because the in-then-out ORDER is the content.
      -->
      <template #children="{ row: trade }">
        <RecordList
          class="fill-list"
          :rows="fillsOf(trade)"
          :columns="fillColumns"
          :row-key="fill => `${fill.leg}-${fill.execution.trade_id}`"
          hide-head
          inert
        >
          <template #default="{ row: fill }">
            <span class="fill-leg">└─ {{ fill.leg }}</span>
            <span :title="fill.execution.trade_id">{{ fill.execution.trade_id }}</span>
            <span>{{ t('vol') }} {{ fill.execution.volume }}</span>
            <span class="fill-share">{{ shareOf(trade, fill) }}</span>
            <span :title="String(fill.execution.price)">
              {{ t('price') }} {{ fill.execution.price }}
            </span>
            <span :title="`${fill.execution.fee} ${fill.execution.fee_currency}`">
              {{ t('fee') }} {{ fill.execution.fee }} {{ fill.execution.fee_currency }}
            </span>
            <span>{{ fill.execution.liquidity }}</span>
          </template>
        </RecordList>
      </template>
    </RecordList>
  </div>
</template>

<style scoped>
.notice {
  margin: 0 0 var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-warning);
  border-radius: 4px;
  color: var(--color-warning);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.mark { margin-right: var(--space-xs); }

/* Every cell of this list is a figure or a short word, so none of them wraps: the row stays one
   line and the columns stay comparable down the page. The tracks are fixed proportions, declared
   in the script — so a long value is cut rather than allowed to widen its column. */
.trade-list :deep(.record-row) > span,
.trade-list :deep(.record-group) > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Counted from the END, and that is what makes the heading survive the ranks: the name takes every
   track but the last, the net takes the last one. A `span 5` was fixed at eight columns, so a rank
   that gave one up left it spanning tracks that were no longer there. The Symbol column alone is
   12 % of the width and cut `ETHUSD_blocks_06` to `ETHU…`, which is why the name spans at all. */

/* A FIGURE CELL is right-aligned under its right-aligned heading. `figure: true` on a column aligns
   the HEADING; the cells are this component's, so the second half lives here. Measured 2026-09-30
   across every ranked list: three of four had figure cells sitting up to 172 px left of the heading
   they belong to. The geometry is asserted in `e2e/list_ranks.spec.ts` — no unit test can see it. */
.trade-list :deep(.figure-cell) {
  text-align: right;
}

/* interactive text wears the link role, and the mark covers every trade of that position */
.to-orders {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--color-accent);
  cursor: pointer;
}

.to-orders:hover,
.to-orders:focus-visible {
  text-decoration: underline;
}

/* the partial marker rides with the position, not in the figure column — a figure column is
   right-aligned digits, and prose in it breaks the one property the whole list is built on */
.in-parts {
  color: var(--color-text-secondary);
  margin-left: var(--space-xs);
}

.trade-position {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trade-list :deep(.record-row.marked) {
  background-color: var(--color-bg-raised);
}

.group-name {
  grid-column: 1 / -2;
  color: var(--color-text-primary);
}

.group-net {
  grid-column: -2 / -1;
  text-align: right;
}

/* the count and the fees are a NOTE about the group, not values of any column — so they read on
   after the name in the same cell rather than sitting under a heading they have nothing to do with */
.group-meta {
  color: var(--color-text-secondary);
}

/* the fills are a level BELOW the trade, and the indent plus the secondary ink says so without a
   frame — a box around two lines inside a row is more furniture than information */
.fill-list :deep(.record-row) {
  border-bottom: none;
  color: var(--color-text-secondary);
}

.fill-leg { color: var(--color-text-secondary); }

/* the share of a shared fill is the one thing here worth noticing, so it is not muted with the
   rest — this is the `shared(Nx)` case the backend's printout marks */
.fill-share { color: var(--color-text-primary); }

.hint {
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }
</style>
