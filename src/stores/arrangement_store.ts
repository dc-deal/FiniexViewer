import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { MAIN_LINK, emptyLink, useContextStore } from '@/stores/context_store'
import type { FacetSelection } from '@/types/facet_types'
import type { LinkContext, PositionRef } from '@/types/context_types'
import type { StoredArrangement, StoredChart, StoredFacets } from '@/types/arrangement_types'

const STORAGE_KEY = 'arrangement.v1'
const SCHEMA_VERSION = 1

/** Where the chart selection was kept before it moved here — removed, never read (alpha). */
const RETIRED_KEYS = ['sel.broker', 'sel.symbol', 'sel.timeframe']

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function readPosition(value: unknown): PositionRef | null {
  const stored = record(value)
  const scenario = text(stored['scenario'])
  const position = text(stored['position'])
  return scenario && position ? { scenario, position } : null
}

/** One stored link, field by field — whatever does not have the right shape is left empty. */
function readLink(value: unknown): LinkContext {
  const stored = record(value)
  const run = record(stored['run'])
  const deployment = record(stored['deployment'])
  const market = record(stored['market'])
  const link = emptyLink()
  link.run = { id: text(run['id']), units: texts(run['units']), position: readPosition(run['position']) }
  link.deployment = { id: text(deployment['id']) }
  link.market = { broker: text(market['broker']), symbol: text(market['symbol']) }
  return link
}

function readSelection(value: unknown): FacetSelection | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const selection: FacetSelection = {}
  for (const [id, values] of Object.entries(value)) {
    const valid = texts(values)
    if (valid.length) selection[id] = valid
  }
  return selection
}

function readFacets(value: unknown): StoredFacets {
  const stored = record(value)
  const facets: StoredFacets = {
    search: typeof stored['search'] === 'string' ? stored['search'] : '',
    sort: typeof stored['sort'] === 'string' ? stored['sort'] : '',
    scope: text(stored['scope']),
  }
  const selection = readSelection(stored['selection'])
  if (selection) facets.selection = selection
  return facets
}

/**
 * The stored arrangement, reconciled — never trusted as it is. An entry of another schema is
 * REMOVED rather than converted: the project is alpha, and code that reads a shape nobody writes
 * any more outlives the one day it was useful.
 */
function readStored(): StoredArrangement | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = record(JSON.parse(raw))
    if (parsed['version'] !== SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    const links: Record<string, LinkContext> = {}
    for (const [id, link] of Object.entries(record(parsed['links']))) links[id] = readLink(link)
    if (!links[MAIN_LINK]) links[MAIN_LINK] = emptyLink()
    const bars: Record<string, StoredFacets> = {}
    for (const [id, facets] of Object.entries(record(parsed['bars']))) bars[id] = readFacets(facets)
    const chart: StoredChart = { timeframe: text(record(parsed['chart'])['timeframe']) }
    const dock = typeof parsed['dock'] === 'object' && parsed['dock'] !== null ? parsed['dock'] : null
    return { version: SCHEMA_VERSION, links, bars, chart, dock }
  } catch {
    // a corrupt or unreadable entry is the same as none — never a broken start
    return null
  }
}

function forget(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // blocked storage: nothing was kept, so nothing has to go
  }
}

/**
 * The selection and the per-bar state, stored under ONE versioned key and restored on load.
 *
 * It owns the storage and nothing else: the selection itself lives in the context store, which it
 * fills on creation and writes back on every change. Created at the root of the app, so every view
 * mounts onto a restored selection.
 */
export const useArrangementStore = defineStore('arrangement', () => {
  const context = useContextStore()

  RETIRED_KEYS.forEach(forget)
  const stored = readStored()
  if (stored) context.restore(stored.links)

  const bars = ref<Record<string, StoredFacets>>(stored?.bars ?? {})
  const chart = ref<StoredChart>(stored?.chart ?? { timeframe: null })
  // the layout is large and replaced whole, never edited in place — no deep reactivity needed
  const dock = shallowRef<object | null>(stored?.dock ?? null)

  function persist(): void {
    const arrangement: StoredArrangement = {
      version: SCHEMA_VERSION,
      links: context.links,
      bars: bars.value,
      chart: chart.value,
      dock: dock.value,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arrangement))
    } catch {
      // a full or blocked storage must not break the app — the selection still works, unstored
    }
  }

  watch([() => context.links, bars, chart], persist, { deep: true })
  watch(dock, persist)

  function setFacets(bar: string, facets: StoredFacets): void {
    bars.value = { ...bars.value, [bar]: facets }
  }

  function setTimeframe(timeframe: string | null): void {
    chart.value = { timeframe }
  }

  function setDock(layout: object | null): void {
    dock.value = layout
  }

  return { bars, chart, dock, setFacets, setTimeframe, setDock }
})
