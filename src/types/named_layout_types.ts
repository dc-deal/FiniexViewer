import type { DockPlace, StoredPanelView } from '@/types/arrangement_types'
import type { WorkspaceState } from '@/types/panel_types'

/** The layouts the app ships: a reader may change them, and Reset brings them back as shipped. */
export const SHIPPED_LAYOUT_IDS = ['backtests', 'deploys'] as const
export type ShippedLayoutId = typeof SHIPPED_LAYOUT_IDS[number]

/**
 * The sizes a layout comes in (viewer#37), chosen per window: each is a placement of its own, so what
 * is changed in one leaves the others as they were.
 */
export const LAYOUT_SIZES = ['full', 'medium', 'mobile'] as const
export type LayoutSize = typeof LAYOUT_SIZES[number]
/** The sizes beside Full, which a layout keeps in `sizes`. */
export type NarrowSize = Exclude<LayoutSize, 'full'>

/**
 * Where the panels stand, and nothing else (viewer#37). It holds no selection — no run, deployment,
 * narrowing or marked position — so one layout fits every run, and loading one never changes what is
 * shown, only where.
 */
export interface Placement {
  /** The dock as dockview serialises it: the open panels, their splits and their tab stacks. */
  dock: object
  /** Where each panel stood last, a hidden one's included — what brings it back to its place. */
  places: Record<string, DockPlace>
  /** Each panel's view, the halves bound to no run: what it shows expanded, a chart's layers and its panes. */
  views: Record<string, Pick<StoredPanelView, 'expanded' | 'layers' | 'panes'>>
  /** The bundles' columns: their sections in order, which are folded, pinned, locked or hidden. */
  bundles: WorkspaceState['bundles']
}

/** A placement under a name. */
export interface NamedLayout {
  id: string
  name: string
  /** Which shipped layout this is, for Reset; null on a reader's own. */
  shipped: ShippedLayoutId | null
  /** The size Full: the placement a wide window takes. */
  placement: Placement
  /**
   * Medium and Mobile, each stored whole and never derived from Full. A size missing — a layout saved
   * before sizes existed — starts from the shipped layout's own placement for it.
   */
  sizes: Partial<Record<NarrowSize, Placement>>
}

/** `layouts.v1`, shared by every window, and the file the layouts export to. */
export interface StoredLayouts {
  version: number
  layouts: NamedLayout[]
}
