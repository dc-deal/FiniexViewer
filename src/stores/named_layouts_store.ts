import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import presets from '@/layout_presets.json'
import { readPanelViews, readPlaces, useArrangementStore } from '@/stores/arrangement_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import { onSharedWrite } from '@/tab_storage'
import { LAYOUT_SIZES, SHIPPED_LAYOUT_IDS } from '@/types/named_layout_types'
import type {
  LayoutSize, NamedLayout, NarrowSize, Placement, ShippedLayoutId, StoredLayouts,
} from '@/types/named_layout_types'
import type { StoredPanelView } from '@/types/arrangement_types'
import { BUNDLE_IDS } from '@/types/panel_types'
import type { ColumnState, PanelState, WorkspaceState } from '@/types/panel_types'
import { t } from '@/translate'

const STORAGE_KEY = 'layouts.v1'
const SCHEMA_VERSION = 1
/** How long a placement rests before it is written into its layout — a drag moves it many times. */
const SAVE_DELAY_MS = 500

/** What the shipped layouts are called; a reader's own carry the name they were given. */
const SHIPPED_NAMES: Record<ShippedLayoutId, string> = {
  backtests: t('Backtests'),
  deploys: t('Deploys'),
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** The halves of a view no run is bound to: what a panel shows expanded, a chart's layers and its panes. */
function placedViews(views: Record<string, StoredPanelView>): Placement['views'] {
  const placed: Placement['views'] = {}
  for (const [id, view] of Object.entries(views)) {
    const kept: Placement['views'][string] = {}
    if (view.expanded && Object.keys(view.expanded).length) kept.expanded = view.expanded
    if (view.layers && Object.keys(view.layers).length) kept.layers = view.layers
    if (view.panes && Object.keys(view.panes).length) kept.panes = view.panes
    if (view.maximized) kept.maximized = view.maximized
    if (Object.keys(kept).length) placed[id] = kept
  }
  return placed
}

/** One section's state in a column, field by field — whether its bundle has it is decided on load. */
function readPanelState(value: unknown): PanelState | null {
  const stored = object(value)
  if (!stored || typeof stored['id'] !== 'string') return null
  return {
    id: stored['id'],
    open: stored['open'] === true,
    pinned: stored['pinned'] === true,
    locked: stored['locked'] === true,
    hidden: stored['hidden'] === true,
  }
}

/** The bundles' columns by shape; what they hold is reconciled against the register on load. */
function readBundles(value: unknown): WorkspaceState['bundles'] {
  const stored = object(value) ?? {}
  const bundles: WorkspaceState['bundles'] = {}
  for (const bundle of BUNDLE_IDS) {
    const columns = object(stored[bundle])?.['columns']
    if (!Array.isArray(columns)) continue
    bundles[bundle] = {
      columns: columns.map((column): ColumnState => {
        const panels = object(column)?.['panels']
        return {
          width: 1,
          panels: Array.isArray(panels) ? panels.map(readPanelState).filter((panel): panel is PanelState => panel !== null) : [],
        }
      }),
    }
  }
  return bundles
}

/**
 * A placement read by shape, never trusted: a dock that is no object is no layout, and the rest are
 * read the way the arrangement reads its own. Whether the dock can be laid out is decided on load.
 */
function readPlacement(value: unknown): Placement | null {
  const stored = object(value)
  const dock = object(stored?.['dock'])
  if (!stored || !dock) return null
  return {
    dock,
    places: readPlaces(stored['places']),
    views: placedViews(readPanelViews(stored['views'])),
    bundles: readBundles(stored['bundles']),
  }
}

function shippedOf(id: string): ShippedLayoutId | null {
  return SHIPPED_LAYOUT_IDS.find(shipped => shipped === id) ?? null
}

const NARROW_SIZES = LAYOUT_SIZES.filter((size): size is NarrowSize => size !== 'full')

/** The sizes beside Full, each read by shape; one that cannot be read is left out, never guessed. */
function readSizes(value: unknown): NamedLayout['sizes'] {
  const stored = object(value) ?? {}
  const sizes: NamedLayout['sizes'] = {}
  for (const size of NARROW_SIZES) {
    const placement = readPlacement(stored[size])
    if (placement) sizes[size] = placement
  }
  return sizes
}

/** A shipped layout as it shipped, in every size: each laid out by the dock at that size. */
function shippedLayout(id: ShippedLayoutId): NamedLayout {
  const preset = presets[id]
  return { id, name: SHIPPED_NAMES[id], shipped: id, placement: readPlacement(preset.full)!, sizes: readSizes(preset) }
}

/**
 * A layout's placement in one size. A size it does not hold — a layout saved before sizes existed —
 * starts from the shipped layout's own for that size, *Backtests* for a reader's own: a narrow size
 * never starts as a copy of Full, which was laid out for a wide window.
 */
function placementOf(layout: NamedLayout, size: LayoutSize): Placement {
  if (size === 'full') return layout.placement
  return layout.sizes[size] ?? shippedLayout(layout.shipped ?? 'backtests').sizes[size]!
}

/** A layout with one size's placement replaced, the others as they were. */
function withPlacement(layout: NamedLayout, size: LayoutSize, placement: Placement): NamedLayout {
  return size === 'full'
    ? { ...layout, placement }
    : { ...layout, sizes: { ...layout.sizes, [size]: placement } }
}

/** One stored layout by shape. A shipped one keeps its shipped name: only a reader's own is renamed. */
function readLayout(value: unknown): NamedLayout | null {
  const stored = object(value)
  const id = typeof stored?.['id'] === 'string' ? stored['id'] : ''
  const name = typeof stored?.['name'] === 'string' ? stored['name'].trim() : ''
  const placement = readPlacement(stored?.['placement'])
  if (!id || !name || !placement) return null
  const shipped = shippedOf(id)
  // added under version 1: a layout stored before sizes existed reads as one holding Full alone
  return { id, name: shipped ? SHIPPED_NAMES[shipped] : name, shipped, placement, sizes: readSizes(stored?.['sizes']) }
}

/** The shipped layouts first, in their order and always there, then a reader's own in the order made. */
function withShipped(layouts: NamedLayout[]): NamedLayout[] {
  const unique = layouts.filter((layout, index) => layouts.findIndex(other => other.id === layout.id) === index)
  const shipped = SHIPPED_LAYOUT_IDS.map(id => unique.find(layout => layout.id === id) ?? shippedLayout(id))
  return [...shipped, ...unique.filter(layout => !layout.shipped)]
}

/**
 * The stored layouts, or null where the storage cannot be read. An entry of another schema is removed,
 * not converted, like every stored entry here: nothing will read that shape again.
 */
function readList(): NamedLayout[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = object(JSON.parse(raw))
    if (parsed?.['version'] !== SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      return []
    }
    const layouts = parsed['layouts']
    return Array.isArray(layouts) ? layouts.map(readLayout).filter((layout): layout is NamedLayout => layout !== null) : []
  } catch {
    return null
  }
}

/** A deep copy that leaves every proxy behind: a layout is stored, never shared with a live store. */
function copied<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Named layouts (viewer#37): the placement of the panels saved under a name, loaded with one click.
 *
 * **A layout says WHERE, never WHAT.** It holds the dock, every hidden panel's last place, what each
 * panel shows expanded, a chart's layers and the heights of its panes, and the bundles' columns;
 * never the run, the deployment, a narrowing or the rows a panel keeps for one run. Loading one moves
 * the panels and leaves the selection alone, so one layout fits every run.
 *
 * **The loaded layout follows the reader** (operator, 2026-11-03): whatever this tab changes about its
 * placement is written into the layout it loaded, the way MetaTrader keeps a profile — back in it, it
 * stands as it was left. A shipped one changed that way comes back as shipped with *Reset*.
 *
 * **Each size is a layout of its own** (operator, 2026-11-04): *Full*, *Medium* and *Mobile* each keep
 * a placement, a tab loads one of them, and what it changes goes into that size alone.
 *
 * Shared by every window, in `localStorage`. Every write reads the stored list again first, and a write
 * in another window reaches this one, so a layout saved there is never lost here.
 */
export const useNamedLayoutsStore = defineStore('named_layouts', () => {
  const arrangement = useArrangementStore()
  const layoutStore = useLayoutStore()
  const dock = useDockStore()

  const layouts = ref<NamedLayout[]>(withShipped(readList() ?? []))
  /** Set while a layout is being laid out: what changes on the way is the layout's own, not the reader's. */
  let applying = false
  let timer: ReturnType<typeof setTimeout> | null = null

  /** The layout this tab loaded, or null — also where its id names one that is gone. */
  const loaded = computed(() => layouts.value.find(layout => layout.id === arrangement.layout) ?? null)
  /** The size of it this tab loaded — and the one a layout is loaded in where no size is named. */
  const loadedSize = computed<LayoutSize>(() => arrangement.layoutSize)
  /** The layout the chosen run maps to, offered beside the menu — set by `use_layout_by_run`, null where none is. */
  const offeredId = ref<string | null>(null)
  const offered = computed(() => layouts.value.find(layout => layout.id === offeredId.value) ?? null)

  function offer(id: string | null): void {
    offeredId.value = id
  }

  /** Forgets a loaded layout that no longer exists — deleted here or in another window. */
  function dropMissing(): void {
    if (arrangement.layout !== null && !loaded.value) arrangement.setLayout(null)
  }

  /**
   * The list as stored, read again so another window's write is kept, with `change` applied — and
   * written. The shipped layouts are in it before the change: where nothing was stored yet, a change
   * to one of them would otherwise find no entry to change.
   */
  function write(change: (list: NamedLayout[]) => NamedLayout[]): void {
    const next = withShipped(change(withShipped(readList() ?? layouts.value)))
    layouts.value = next
    try {
      const stored: StoredLayouts = { version: SCHEMA_VERSION, layouts: next }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    } catch {
      // a full or blocked storage keeps the layouts for this visit, and loses them after
    }
  }

  /** This tab's placement as it stands, or null where the dock has not been laid out yet. */
  function capture(): Placement | null {
    if (!arrangement.dock) return null
    return copied({
      dock: arrangement.dock,
      places: arrangement.places,
      views: placedViews(arrangement.panelViews),
      bundles: layoutStore.workspace.bundles,
    })
  }

  function cancelSave(): void {
    if (timer) clearTimeout(timer)
    timer = null
  }

  /** The placement into the layout this tab loaded, once it has rested. */
  function scheduleSave(): void {
    if (applying || arrangement.layout === null) return
    cancelSave()
    timer = setTimeout(saveLoaded, SAVE_DELAY_MS)
  }

  /** Into the size this tab loaded, and that size alone. */
  function saveLoaded(): void {
    timer = null
    const id = arrangement.layout
    const size = arrangement.layoutSize
    const placement = capture()
    if (id === null || !placement) return
    write(list => list.map(layout => (layout.id === id ? withPlacement(layout, size, placement) : layout)))
  }

  /** Lays a layout out in this tab in one size and marks it loaded. Says whether its dock could be laid out. */
  function apply(layout: NamedLayout, size: LayoutSize): boolean {
    cancelSave()
    applying = true
    const placement = placementOf(layout, size)
    try {
      const done = dock.restore(placement.dock, () => {
        // the places first: they keep out a bundle the layout leaves out
        arrangement.setPlaces(copied(placement.places))
        layoutStore.replace(copied(placement.bundles))
        arrangement.setPlacedViews(copied(placement.views))
      })
      if (done) arrangement.setLayout(layout.id, size)
      return done
    } finally {
      applying = false
    }
  }

  /**
   * A layout by id, laid out in a size — the one this tab stands in where none is named. The selection
   * stays as it is: a layout says where, never what.
   */
  function load(id: string, size: LayoutSize = arrangement.layoutSize): boolean {
    const layout = layouts.value.find(entry => entry.id === id)
    return layout ? apply(layout, size) : false
  }

  /** Why a name cannot be given, in words — or null where it can. */
  function nameProblem(name: string, except: string | null = null): string | null {
    const wanted = name.trim().toLowerCase()
    if (!wanted) return t('A layout needs a name')
    if (layouts.value.some(layout => layout.id !== except && layout.name.toLowerCase() === wanted)) {
      return t('A layout of this name exists')
    }
    return null
  }

  /**
   * This tab's placement as a layout of its own, loaded from then on in the size it stands in. The
   * other sizes come from the layout it was saved from, each in its own size — *Backtests* where none
   * was loaded — so every size starts from a placement made for it.
   */
  function saveAs(name: string): boolean {
    dock.flush()
    const placement = capture()
    if (nameProblem(name) || !placement) return false
    const id = `own-${Date.now().toString(36)}`
    const size = arrangement.layoutSize
    const source = loaded.value ?? shippedLayout('backtests')
    const fresh: NamedLayout = {
      id, name: name.trim(), shipped: null,
      placement: copied(placementOf(source, 'full')),
      sizes: Object.fromEntries(NARROW_SIZES.map(narrow => [narrow, copied(placementOf(source, narrow))])),
    }
    write(list => [...list, withPlacement(fresh, size, placement)])
    arrangement.setLayout(id, size)
    return true
  }

  /** A reader's own layout under another name; a shipped one keeps its own. */
  function rename(id: string, name: string): boolean {
    const layout = layouts.value.find(entry => entry.id === id)
    if (!layout || layout.shipped || nameProblem(name, id)) return false
    write(list => list.map(entry => (entry.id === id ? { ...entry, name: name.trim() } : entry)))
    return true
  }

  /** A reader's own layout, gone; a tab that had it loaded keeps its placement as its own. */
  function remove(id: string): void {
    const layout = layouts.value.find(entry => entry.id === id)
    if (!layout || layout.shipped) return
    write(list => list.filter(entry => entry.id !== id))
    dropMissing()
  }

  /** A shipped layout as it shipped, in every size — laid out again where this tab has it loaded. */
  function resetShipped(id: string): void {
    const shipped = shippedOf(id)
    if (!shipped) return
    const fresh = shippedLayout(shipped)
    write(list => list.map(entry => (entry.id === id ? fresh : entry)))
    if (arrangement.layout === id) apply(fresh, arrangement.layoutSize)
  }

  /** This tab's placement as its own again, loaded from no layout — the suggested order is not one. */
  function unload(): void {
    cancelSave()
    arrangement.setLayout(null, arrangement.layoutSize)
  }

  /** Every layout as one file, to take them to another machine. */
  function exportAll(): string {
    const stored: StoredLayouts = { version: SCHEMA_VERSION, layouts: layouts.value }
    return JSON.stringify(stored, null, 2)
  }

  /**
   * The layouts of a file, kept beside these: one with an id already here replaces it, the rest are
   * added. Nothing is laid out. Says how many were taken, or null where the file holds no layout.
   */
  function importAll(text: string): number | null {
    try {
      const parsed = object(JSON.parse(text))
      // another version is refused, as a stored one is removed: its fields may mean something else
      if (parsed?.['version'] !== SCHEMA_VERSION || !Array.isArray(parsed['layouts'])) return null
      const taken = parsed['layouts'].map(readLayout).filter((layout): layout is NamedLayout => layout !== null)
      if (!taken.length) return null
      write(list => {
        const byId = new Map(list.map(layout => [layout.id, layout]))
        for (const layout of taken) byId.set(layout.id, layout)
        return [...byId.values()]
      })
      return taken.length
    } catch {
      return null
    }
  }

  // the dock and the places are replaced whole; the columns change in place
  watch(() => [arrangement.dock, arrangement.places, arrangement.panelViews], scheduleSave)
  watch(() => layoutStore.workspace, scheduleSave, { deep: true })

  onSharedWrite(STORAGE_KEY, () => {
    layouts.value = withShipped(readList() ?? layouts.value)
    dropMissing()
  })
  dropMissing()

  return {
    layouts, loaded, loadedSize, offered,
    offer, load, saveAs, rename, remove, resetShipped, unload, nameProblem, exportAll, importAll,
  }
})
