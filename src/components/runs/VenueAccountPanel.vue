<script setup lang="ts">
import { computed } from 'vue'
import HintLine from '@/components/base/HintLine.vue'
import { utcInstant, venueFigure } from '@/components/runs/report_format'
import {
  accountOf, assetsOf, balanceOf, missingReads, partOf, readSummary, readsOf, reasonOf, reconciliationNotices,
  sidesOf, unitNames,
} from '@/components/runs/venue_account'
import type { VenueModel } from '@/components/runs/venue_account'
import { t } from '@/translate'

/**
 * What the venue itself held, beside the session's own books in the Latest state frame (viewer#54).
 * Two routes, each said as what it is: the venue's reads on the order-event stream, which stand from a
 * live session's first read on, and `venue-account`, written when the session ends.
 *
 * **The venue's own figures, never rounded and never a zero for an absence.** A value is what the
 * venue holds; *not read* is a read that failed; *not listed* is an asset the read does not name.
 *
 * **The comparison speaks only where it is off.** The live verdict is the Latest state frame's
 * (`reconcile_clean`), so it is not repeated here; what the account counts over the whole session is.
 */
const props = defineProps<{
  model: VenueModel
}>()

const units = computed(() => unitNames(props.model).map(name => {
  const { start, end } = sidesOf(props.model, name)
  const account = accountOf(props.model, name)
  return {
    name,
    start,
    end,
    assets: assetsOf(start, end),
    // a margin account only: on spot a holding is a balance, and the row would read as empty
    positions: [start?.positions, end?.positions].some(count => count !== null && count !== undefined),
    missing: missingReads(start, end, props.model.recording),
    notices: account ? reconciliationNotices(account) : [],
    reads: readsOf(props.model, name),
  }
}))
</script>

<template>
  <div class="venue-account">
    <HintLine id="venue-account" />
    <section v-for="unit in units" :key="unit.name" class="unit" :data-unit="unit.name">
      <h4 v-if="units.length > 1" class="unit-name">{{ unit.name }}</h4>

      <div class="venue-table">
        <span class="heading" />
        <span class="heading figure">{{ t('Start') }}</span>
        <span class="heading figure">{{ t('End') }}</span>

        <span class="label">{{ t('Open orders at the venue') }}</span>
        <span class="figure">{{ partOf(unit.start, 'venue_orders', unit.start?.orders ?? null, venueFigure) }}</span>
        <span class="figure">{{ partOf(unit.end, 'venue_orders', unit.end?.orders ?? null, venueFigure) }}</span>

        <template v-if="unit.positions">
          <span class="label">{{ t('Positions at the venue') }}</span>
          <span class="figure">{{ partOf(unit.start, 'venue_positions', unit.start?.positions ?? null, venueFigure) }}</span>
          <span class="figure">{{ partOf(unit.end, 'venue_positions', unit.end?.positions ?? null, venueFigure) }}</span>
        </template>

        <!-- the venue's own asset codes, which need not be the names the symbol uses -->
        <template v-for="asset in unit.assets" :key="asset">
          <span class="label asset">{{ asset }}</span>
          <span class="figure" data-side="start">{{ balanceOf(unit.start, asset, venueFigure) }}</span>
          <span class="figure" data-side="end">{{ balanceOf(unit.end, asset, venueFigure) }}</span>
        </template>
      </div>

      <p v-for="sentence in unit.missing" :key="sentence" class="missing">{{ sentence }}</p>
      <!-- a status travels with its glyph and its word -->
      <p v-for="notice in unit.notices" :key="notice.text" class="notice" :class="notice.tone">
        <template v-if="notice.tone === 'warning'">⚠ </template>{{ notice.text }}
      </p>
      <p v-if="model.reads?.truncated_tail" class="missing">
        {{ t('Its last line was being written, so the list ends before it') }}
      </p>

      <details v-if="unit.reads.length" class="reads">
        <summary>{{ t('Every read of the venue') }} ({{ unit.reads.length }})</summary>
        <div class="read-list">
          <template v-for="read in unit.reads" :key="read.seq">
            <span class="seq">seq {{ read.seq }}</span>
            <span class="when">{{ utcInstant(read.event_time) }}</span>
            <span class="reason">{{ reasonOf(read) }}</span>
            <span class="summary" :class="{ divergent: read.reconcile_state === 'divergent' }">{{ readSummary(read) }}</span>
          </template>
        </div>
      </details>
    </section>
  </div>
</template>

<style scoped>
.venue-account {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.unit {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.unit-name,
.missing,
.notice {
  margin: 0;
}

/* the figures stand beside their label rather than across the panel, where the eye loses the row */
.venue-table {
  display: grid;
  grid-template-columns: max-content minmax(6rem, max-content) minmax(6rem, max-content);
  justify-content: start;
  gap: 2px var(--space-lg);
  font-variant-numeric: tabular-nums;
}

.heading {
  color: var(--color-text-secondary);
}

.label {
  color: var(--color-text-secondary);
}

.asset {
  color: var(--color-text-primary);
}

.figure {
  text-align: right;
  color: var(--color-text-primary);
}

.missing {
  color: var(--color-text-secondary);
}

.notice.warning {
  color: var(--color-warning);
}

.notice.plain {
  color: var(--color-text-secondary);
}

.reads > summary {
  cursor: pointer;
  color: var(--color-accent);
}

.read-list {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  gap: 2px var(--space-md);
  margin-top: var(--space-xs);
}

.seq,
.when {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.summary {
  overflow-wrap: anywhere;
}

.summary.divergent {
  color: var(--color-warning);
}
</style>
