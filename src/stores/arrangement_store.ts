import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { MAIN_LINK, emptyLink, useContextStore } from '@/stores/context_store'
import { readTabEntry, removeTabAndShared, writeTabAndShared } from '@/tab_storage'
import type { FacetSelection } from '@/types/facet_types'
import type { LinkContext, PositionRef } from '@/types/context_types'
import { VIEW_FOLDS, VIEW_ROW_CAPS } from '@/types/arrangement_types'
import type {
  DockPlace, StoredArrangement, StoredChart, StoredFacets, StoredPanelView, StoredRows, StoredRunChart,
  ViewFold, ViewRowList,
} from '@/types/arrangement_types'

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
  // one scenario in focus at most: the controls set no more, and a stored list is reconciled, not trusted
  const units = texts(run['units']).slice(0, 1)
  link.run = { id: text(run['id']), units, position: readPosition(run['position']) }
  link.deployment = { id: text(deployment['id']) }
  link.market = { broker: text(market['broker']), symbol: text(market['symbol']) }
  return link
}

const DIRECTIONS: DockPlace['direction'][] = ['within', 'left', 'right', 'above', 'below']

function nonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** One stored place, field by field — a place naming no panel to stand beside is no place. */
function readPlace(value: unknown): DockPlace | null {
  const stored = record(value)
  const besides = texts(stored['besides'])
  const direction = DIRECTIONS.find(entry => entry === stored['direction'])
  if (!besides.length || !direction) return null
  const place: DockPlace = { besides, direction }
  const index = nonNegative(stored['index'])
  const size = nonNegative(stored['size'])
  if (index !== undefined) place.index = index
  if (size !== undefined) place.size = size
  return place
}

function readPlaces(value: unknown): Record<string, DockPlace> {
  const places: Record<string, DockPlace> = {}
  for (const [id, stored] of Object.entries(record(value))) {
    const place = readPlace(stored)
    if (place) places[id] = place
  }
  return places
}

function readExpanded(value: unknown): Partial<Record<ViewFold, boolean>> {
  const stored = record(value)
  const expanded: Partial<Record<ViewFold, boolean>> = {}
  for (const fold of VIEW_FOLDS) {
    const shown = stored[fold]
    if (typeof shown === 'boolean') expanded[fold] = shown
  }
  return expanded
}

/** Rows of one run: none without the run they were kept for; a repeated key keeps its newest place. */
function readRows(value: unknown): StoredRows | undefined {
  const stored = record(value)
  const scope = text(stored['scope'])
  if (!scope) return undefined
  const lists = record(stored['keys'])
  const keys: Partial<Record<ViewRowList, string[]>> = {}
  for (const list of Object.keys(VIEW_ROW_CAPS) as ViewRowList[]) {
    const found = texts(lists[list])
    const kept = found.filter((key, index) => found.lastIndexOf(key) === index).slice(-VIEW_ROW_CAPS[list])
    if (kept.length) keys[list] = kept
  }
  return Object.keys(keys).length ? { scope, keys } : undefined
}

/** Each panel's view, field by field: a name this build does not know is never copied, an empty entry is none. */
function readPanelViews(value: unknown): Record<string, StoredPanelView> {
  const views: Record<string, StoredPanelView> = {}
  for (const [id, stored] of Object.entries(record(value))) {
    const view: StoredPanelView = {}
    const expanded = readExpanded(record(stored)['expanded'])
    if (Object.keys(expanded).length) view.expanded = expanded
    const rows = readRows(record(stored)['rows'])
    if (rows) view.rows = rows
    if (Object.keys(view).length) views[id] = view
  }
  return views
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
    const raw = readTabEntry(STORAGE_KEY)
    if (!raw) return null
    const parsed = record(JSON.parse(raw))
    if (parsed['version'] !== SCHEMA_VERSION) {
      removeTabAndShared(STORAGE_KEY)
      return null
    }
    const links: Record<string, LinkContext> = {}
    for (const [id, link] of Object.entries(record(parsed['links']))) links[id] = readLink(link)
    if (!links[MAIN_LINK]) links[MAIN_LINK] = emptyLink()
    const bars: Record<string, StoredFacets> = {}
    for (const [id, facets] of Object.entries(record(parsed['bars']))) bars[id] = readFacets(facets)
    const chart: StoredChart = { timeframe: text(record(parsed['chart'])['timeframe']) }
    const storedRunChart = record(parsed['runChart'])
    const runChart: StoredRunChart = {
      run: text(storedRunChart['run']),
      unit: text(storedRunChart['unit']),
      timeframe: text(storedRunChart['timeframe']),
    }
    const dock = typeof parsed['dock'] === 'object' && parsed['dock'] !== null ? parsed['dock'] : null
    return {
      version: SCHEMA_VERSION, links, bars, chart, runChart, dock,
      places: readPlaces(parsed['places']),
      // added under version 1: an entry written before it reads as no view kept, which is the truth
      panelViews: readPanelViews(parsed['panelViews']),
    }
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
  const runChart = ref<StoredRunChart>(stored?.runChart ?? { run: null, unit: null, timeframe: null })
  // the layout is large and replaced whole, never edited in place — no deep reactivity needed
  const dock = shallowRef<object | null>(stored?.dock ?? null)
  // replaced whole as well, by the dock store, which owns what a place means
  const places = shallowRef<Record<string, DockPlace>>(stored?.places ?? {})
  // replaced whole on every change, one panel's entry at a time — see `setPanelView`
  const panelViews = shallowRef<Record<string, StoredPanelView>>(stored?.panelViews ?? {})

  function persist(): void {
    const arrangement: StoredArrangement = {
      version: SCHEMA_VERSION,
      links: context.links,
      bars: bars.value,
      chart: chart.value,
      runChart: runChart.value,
      dock: dock.value,
      places: places.value,
      panelViews: panelViews.value,
    }
    // this tab's own, and the start of the next new one — a full or blocked storage must not break
    // the app: the selection still works, unstored
    writeTabAndShared(STORAGE_KEY, JSON.stringify(arrangement))
  }

  watch([() => context.links, bars, chart, runChart], persist, { deep: true })
  watch([dock, places, panelViews], persist)

  function setFacets(bar: string, facets: StoredFacets): void {
    bars.value = { ...bars.value, [bar]: facets }
  }

  function setTimeframe(timeframe: string | null): void {
    chart.value = { timeframe }
  }

  function setDock(layout: object | null): void {
    dock.value = layout
  }

  function setPlaces(next: Record<string, DockPlace>): void {
    places.value = next
  }

  function setRunChart(next: StoredRunChart): void {
    runChart.value = next
  }

  /**
   * One panel's view. An entry left with nothing in it is removed, and the same view again writes
   * nothing — a `<details>` reports a toggle also when a kept value opens it on mount.
   */
  function setPanelView(panel: string, view: StoredPanelView): void {
    const kept: StoredPanelView = {}
    if (Object.keys(view.expanded ?? {}).length) kept.expanded = view.expanded
    if (view.rows && Object.keys(view.rows.keys).length) kept.rows = view.rows
    const next = { ...panelViews.value }
    if (Object.keys(kept).length) next[panel] = kept
    else delete next[panel]
    if (JSON.stringify(next) !== JSON.stringify(panelViews.value)) panelViews.value = next
  }

  /**
   * Keeps the places of the panels `known` accepts, each beside known panels only; a place left
   * beside none is none. Without it a retired kind's place, and a neighbour list naming one, were
   * copied forward by every write of the places.
   */
  function keepPlaces(known: (panel: string) => boolean): void {
    const kept: Record<string, DockPlace> = {}
    for (const [id, place] of Object.entries(places.value)) {
      if (!known(id)) continue
      const besides = place.besides.filter(known)
      if (besides.length) kept[id] = { ...place, besides }
    }
    if (JSON.stringify(kept) !== JSON.stringify(places.value)) places.value = kept
  }

  /**
   * Keeps the views of the panels `known` accepts. The dock store calls it, because it knows the
   * kinds: this store must not import the register, which imports a store that imports this one.
   */
  function keepPanelViews(known: (panel: string) => boolean): void {
    const kept = Object.entries(panelViews.value).filter(([id]) => known(id))
    if (kept.length < Object.keys(panelViews.value).length) panelViews.value = Object.fromEntries(kept)
  }

  return {
    bars, chart, runChart, dock, places, panelViews,
    setFacets, setTimeframe, setRunChart, setDock, setPlaces, keepPlaces, setPanelView, keepPanelViews,
  }
})
