import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { serverStateKey } from '@/active_server'
import { isServedLayerId } from '@/layer_registry'
import { MAIN_LINK, emptyLink, useContextStore } from '@/stores/context_store'
import { readTabEntry, removeTabAndShared, writeTabAndShared } from '@/tab_storage'
import type { FacetSelection } from '@/types/facet_types'
import type { LinkContext, PositionRef } from '@/types/context_types'
import { VIEW_FOLDS, VIEW_ROW_CAPS } from '@/types/arrangement_types'
import type {
  DockPlace, StoredArrangement, StoredChart, StoredFacets, StoredLayers, StoredPanelView, StoredRows, StoredRunChart,
  StoredServedLayers, ViewFold, ViewRowList,
} from '@/types/arrangement_types'
import { CHART_LAYER_IDS } from '@/types/chart_drawing_types'
import type { PaneLook, PaneLooks, PaneWeights } from '@/types/chart_pane_types'
import type { ChartLayerId } from '@/types/chart_drawing_types'
import type { ServedLayerId } from '@/types/indicator_drawing_types'
import { LAYER_OPACITY_MIN, LAYER_OPTION_IDS } from '@/types/layer_types'
import { LAYOUT_SIZES } from '@/types/named_layout_types'
import type { LayoutSize } from '@/types/named_layout_types'
import { PRICE_FORMS } from '@/types/run_chart_types'
import type { PriceForm } from '@/types/run_chart_types'
import type { LayerOptionId } from '@/types/layer_types'

const STORAGE_KEY = 'arrangement.v1'
const SCHEMA_VERSION = 1

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
  const sweep = record(stored['sweep'])
  const market = record(stored['market'])
  const link = emptyLink()
  // one scenario in focus at most: the controls set no more, and a stored list is reconciled, not trusted
  const units = texts(run['units']).slice(0, 1)
  link.run = { id: text(run['id']), units, position: readPosition(run['position']) }
  link.deployment = { id: text(deployment['id']) }
  // a link stored before sweeps had a key reads as none chosen: an added field needs no new version
  link.sweep = { id: text(sweep['id']) }
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

export function readPlaces(value: unknown): Record<string, DockPlace> {
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

/** Known layer ids, each once — a name this build does not draw is never copied. */
function readLayerIds(value: unknown): ChartLayerId[] {
  const found = texts(value).filter((id): id is ChartLayerId => (CHART_LAYER_IDS as readonly string[]).includes(id))
  return found.filter((id, index) => found.indexOf(id) === index)
}

/** A chart's drawing layers, field by field — whether they fit the chart is decided where it is read. */
function readLayers(value: unknown): StoredLayers | undefined {
  const stored = record(value)
  const layers: StoredLayers = {}
  for (const field of ['order', 'hidden'] as const) {
    const ids = readLayerIds(stored[field])
    if (ids.length) layers[field] = ids
  }
  // a share below the least one, or the whole of it, is no opacity to keep
  const opacity = record(stored['opacity'])
  const faint: Partial<Record<ChartLayerId, number>> = {}
  for (const id of CHART_LAYER_IDS) {
    const value = opacity[id]
    if (typeof value === 'number' && value >= LAYER_OPACITY_MIN && value < 100) faint[id] = Math.round(value)
  }
  if (Object.keys(faint).length) layers.opacity = faint
  const options = record(stored['options'])
  const switched: Partial<Record<LayerOptionId, boolean>> = {}
  for (const option of LAYER_OPTION_IDS) {
    const on = options[option]
    if (typeof on === 'boolean') switched[option] = on
  }
  if (Object.keys(switched).length) layers.options = switched
  const forms = record(stored['forms'])
  const drawn: StoredLayers['forms'] = {}
  for (const id of CHART_LAYER_IDS) {
    const form = forms[id]
    if (typeof form === 'string' && (PRICE_FORMS as readonly string[]).includes(form)) drawn[id] = form as PriceForm
  }
  if (Object.keys(drawn).length) layers.forms = drawn
  const served = readServedLayers(stored['served'])
  if (served) layers.served = served
  return Object.keys(layers).length ? layers : undefined
}

/** A worker's layers by the backend's ids: an id of another form, or an opacity out of range, is none. */
function readServedLayers(value: unknown): StoredServedLayers | undefined {
  const stored = record(value)
  const kept: StoredServedLayers = {}
  const hidden = texts(stored['hidden']).filter(isServedLayerId)
  if (hidden.length) kept.hidden = [...new Set(hidden)]
  const faint: Partial<Record<ServedLayerId, number>> = {}
  for (const [id, share] of Object.entries(record(stored['opacity']))) {
    if (isServedLayerId(id) && typeof share === 'number' && share >= LAYER_OPACITY_MIN && share < 100) faint[id] = Math.round(share)
  }
  if (Object.keys(faint).length) kept.opacity = faint
  return Object.keys(kept).length ? kept : undefined
}

/**
 * A pane's name read back: one of ours, or a worker's pane the backend named (contract 55) — its
 * word, so only that it is a short name is checked. A pane no run draws any more is laid out by no one.
 */
function isPaneName(value: unknown): value is string {
  return typeof value === 'string' && /^\S{1,120}$/.test(value)
}

/** A chart's panes' looks by name: a name of no pane's form, or a part that is not on, is none. */
function readPaneLooks(value: unknown): PaneLooks | undefined {
  const looks: PaneLooks = {}
  for (const [pane, stored] of Object.entries(record(value))) {
    if (!isPaneName(pane)) continue
    const look: PaneLook = {}
    if (record(stored)['frame'] === true) look.frame = true
    if (record(stored)['background'] === true) look.background = true
    if (Object.keys(look).length) looks[pane] = look
  }
  return Object.keys(looks).length ? looks : undefined
}

/** A chart's pane weights by the panes' names: a name of no pane's form, or a weight that is no positive number, is none. */
function readPaneWeights(value: unknown): PaneWeights | undefined {
  const weights: PaneWeights = {}
  for (const [id, weight] of Object.entries(record(value))) {
    if (isPaneName(id) && typeof weight === 'number' && Number.isFinite(weight) && weight > 0) weights[id] = weight
  }
  return Object.keys(weights).length ? weights : undefined
}

/** Each panel's view, field by field: a name this build does not know is never copied, an empty entry is none. */
export function readPanelViews(value: unknown): Record<string, StoredPanelView> {
  const views: Record<string, StoredPanelView> = {}
  for (const [id, stored] of Object.entries(record(value))) {
    const view: StoredPanelView = {}
    const expanded = readExpanded(record(stored)['expanded'])
    if (Object.keys(expanded).length) view.expanded = expanded
    const rows = readRows(record(stored)['rows'])
    if (rows) view.rows = rows
    const layers = readLayers(record(stored)['layers'])
    if (layers) view.layers = layers
    const panes = readPaneWeights(record(stored)['panes'])
    if (panes) view.panes = panes
    const maximized = record(stored)['maximized']
    if (isPaneName(maximized)) view.maximized = maximized
    const looks = readPaneLooks(record(stored)['looks'])
    if (looks) view.looks = looks
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
function readStored(key: string): StoredArrangement | null {
  try {
    const raw = readTabEntry(key)
    if (!raw) return null
    const parsed = record(JSON.parse(raw))
    if (parsed['version'] !== SCHEMA_VERSION) {
      removeTabAndShared(key)
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
      // added under version 1 as well: an entry written before it reads as no layout loaded
      layout: text(parsed['layout']),
      // and the size of it: an entry written before sizes existed stood in Full
      layoutSize: LAYOUT_SIZES.find(size => size === parsed['layoutSize']) ?? 'full',
    }
  } catch {
    // a corrupt or unreadable entry is the same as none — never a broken start
    return null
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

  /*
   * The arrangement is shared and the selection belongs to the server: a run id means something only
   * on its own system. The default server's selection stays in the main entry; any other's stands
   * under a key of its own, in the same shape, and only its selection is read from there.
   */
  const serverKey = serverStateKey()
  const ownKey = serverKey === null ? null : `${STORAGE_KEY}:${serverKey}`
  const stored = readStored(STORAGE_KEY)
  const own = ownKey === null ? stored : readStored(ownKey)
  if (own) context.restore(own.links)

  const bars = ref<Record<string, StoredFacets>>(own?.bars ?? {})
  const chart = ref<StoredChart>(own?.chart ?? { timeframe: null })
  const runChart = ref<StoredRunChart>(own?.runChart ?? { run: null, unit: null, timeframe: null })
  // the layout is large and replaced whole, never edited in place — no deep reactivity needed
  const dock = shallowRef<object | null>(stored?.dock ?? null)
  // replaced whole as well, by the dock store, which owns what a place means
  const places = shallowRef<Record<string, DockPlace>>(stored?.places ?? {})
  // replaced whole on every change, one panel's entry at a time — see `setPanelView`
  const panelViews = shallowRef<Record<string, StoredPanelView>>(own?.panelViews ?? {})
  // part of the placement, so it stands beside the dock in the main entry
  const layout = ref<string | null>(stored?.layout ?? null)
  const layoutSize = ref<LayoutSize>(stored?.layoutSize ?? 'full')

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
      layout: layout.value,
      layoutSize: layoutSize.value,
    }
    // this tab's own, and the start of the next new one — a full or blocked storage must not break
    // the app: the selection still works, unstored
    if (ownKey === null) {
      writeTabAndShared(STORAGE_KEY, JSON.stringify(arrangement))
      return
    }
    writeTabAndShared(ownKey, JSON.stringify({ ...arrangement, dock: null, places: {}, layout: null, layoutSize: 'full' }))
    // the placement goes to the main entry, around the default server's selection, read fresh
    const main = readStored(STORAGE_KEY)
    const shared: StoredArrangement = {
      version: SCHEMA_VERSION,
      links: main?.links ?? { [MAIN_LINK]: emptyLink() },
      bars: main?.bars ?? {},
      chart: main?.chart ?? { timeframe: null },
      runChart: main?.runChart ?? { run: null, unit: null, timeframe: null },
      panelViews: main?.panelViews ?? {},
      dock: dock.value,
      places: places.value,
      layout: layout.value,
      layoutSize: layoutSize.value,
    }
    writeTabAndShared(STORAGE_KEY, JSON.stringify(shared))
  }

  watch([() => context.links, bars, chart, runChart], persist, { deep: true })
  watch([dock, places, panelViews, layout, layoutSize], persist)

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

  /** The named layout this tab loaded, or null, and its size — see `named_layouts_store`. */
  function setLayout(id: string | null, size: LayoutSize = layoutSize.value): void {
    layout.value = id
    layoutSize.value = size
  }

  /**
   * A named layout's views: what each panel shows expanded, a chart's layers and the heights of its
   * panes, as the layout holds them. The rows this tab keeps for the run it shows are no part of a
   * layout and stay as they are.
   */
  function setPlacedViews(views: Record<string, StoredPanelView>): void {
    const next: Record<string, StoredPanelView> = {}
    for (const [id, view] of Object.entries(panelViews.value)) {
      if (view.rows) next[id] = { rows: view.rows }
    }
    for (const [id, view] of Object.entries(views)) {
      const kept: StoredPanelView = { ...next[id] }
      if (view.expanded && Object.keys(view.expanded).length) kept.expanded = view.expanded
      if (view.layers && Object.keys(view.layers).length) kept.layers = view.layers
      if (view.panes && Object.keys(view.panes).length) kept.panes = view.panes
      if (view.maximized) kept.maximized = view.maximized
      if (view.looks && Object.keys(view.looks).length) kept.looks = view.looks
      if (Object.keys(kept).length) next[id] = kept
    }
    if (JSON.stringify(next) !== JSON.stringify(panelViews.value)) panelViews.value = next
  }

  /**
   * One panel's view. An entry left with nothing in it is removed, and the same view again writes
   * nothing — a `<details>` reports a toggle also when a kept value opens it on mount.
   */
  function setPanelView(panel: string, view: StoredPanelView): void {
    const kept: StoredPanelView = {}
    if (Object.keys(view.expanded ?? {}).length) kept.expanded = view.expanded
    if (view.rows && Object.keys(view.rows.keys).length) kept.rows = view.rows
    if (view.layers && Object.keys(view.layers).length) kept.layers = view.layers
    if (view.panes && Object.keys(view.panes).length) kept.panes = view.panes
    if (view.maximized) kept.maximized = view.maximized
    if (view.looks && Object.keys(view.looks).length) kept.looks = view.looks
    const next = { ...panelViews.value }
    if (Object.keys(kept).length) next[panel] = kept
    else delete next[panel]
    if (JSON.stringify(next) !== JSON.stringify(panelViews.value)) panelViews.value = next
  }

  /**
   * Keeps the places of the panels `known` accepts, each beside known panels only. Without it a
   * retired kind's place, and a neighbour list naming one, were copied forward by every write.
   *
   * A place whose EVERY neighbour is gone keeps them as they were: a place is also the record that
   * the reader HID the panel — the bundle and the run chart come back on start unless one exists —
   * and dropped, it brought a hidden panel back on the next start. Shown again, such a panel opens
   * where one with no place does.
   */
  function keepPlaces(known: (panel: string) => boolean): void {
    const kept: Record<string, DockPlace> = {}
    for (const [id, place] of Object.entries(places.value)) {
      if (!known(id)) continue
      const besides = place.besides.filter(known)
      kept[id] = besides.length ? { ...place, besides } : place
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
    bars, chart, runChart, dock, places, panelViews, layout, layoutSize,
    setFacets, setTimeframe, setRunChart, setDock, setPlaces, keepPlaces, setPanelView, keepPanelViews,
    setLayout, setPlacedViews,
  }
})
