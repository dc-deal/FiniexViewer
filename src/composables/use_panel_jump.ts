import { nextTick } from 'vue'
import { reportKindId } from '@/panel_kinds'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import type { PositionRef } from '@/types/context_types'

/** How long a jump waits for its marked row before it gives up. */
const MARK_WAIT_MS = 2000

/**
 * Where a section is drawn: its own panel where it is open as one, the run report's column
 * otherwise. A jump searches there and never in the whole document — a marked row elsewhere is not
 * the one the reader is about to look at.
 */
function sectionRoot(panelKind: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-panel-kind="${panelKind}"]`)
}

/**
 * Scroll the marked row into view, once it exists — WAITED FOR, never guessed.
 *
 * The mark is set at the click, so one tick later every row already drawn carries it. A panel the
 * jump had to OPEN is not drawn by then, and no fixed number of ticks is right. Measured
 * 2026-10-13: one tick found no row once the mark stopped riding in the URL, whose write had been
 * slow enough to hide it. So the section's root is watched until the row appears.
 * A row that never does is one the target panel does not draw — beyond its visible cap, or in a
 * group it folded — and the jump then leaves the mark where it is rather than scrolling to nothing.
 */
async function scrollToMark(sectionId: string, panelKind: string): Promise<void> {
  // one tick first, or a row still carrying the PREVIOUS mark would answer
  await nextTick()
  const root = sectionRoot(panelKind)
  if (!root) return
  const scrolled = (): boolean => {
    const row = root.querySelector(`[data-panel="${sectionId}"] .record-row.marked`)
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return row !== null
  }
  if (scrolled()) return
  const observer = new MutationObserver(() => { if (scrolled()) stop() })
  const timer = window.setTimeout(stop, MARK_WAIT_MS)
  function stop(): void {
    observer.disconnect()
    window.clearTimeout(timer)
  }
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
}

/**
 * The jump to a position in a sibling section: mark it, make its section reachable, scroll to its
 * row. The WORKSPACE's business, never a panel's — two sections act on it, the orders and the
 * trades, and both only read the mark and ask for the jump.
 *
 * The mark is part of the run's context, so a reload brings it back. The SCROLL is not: it happens
 * on the click, never on a restore, because a page that jumps on every reload is a page that moved
 * while the reader was not looking.
 */
export function usePanelJump(): (sectionId: string, ref: PositionRef) => void {
  const context = useContextStore()
  const dock = useDockStore()
  const layoutStore = useLayoutStore()
  return (sectionId, ref) => {
    context.mark(ref)
    const ownPanel = reportKindId(sectionId)
    if (dock.openIds.includes(ownPanel)) {
      // open as a panel of its own: that panel comes to the front, wherever it stands
      dock.open(ownPanel)
      void scrollToMark(sectionId, ownPanel)
      return
    }
    // in the column: the run report comes to the front — the jump may start in another panel — and
    // a hidden section is not in the column at all, and a folded one draws nothing, so the jump
    // has to make the target reachable before it can scroll to it
    dock.open('run')
    layoutStore.show(sectionId)
    layoutStore.setOpen(sectionId, true)
    void scrollToMark(sectionId, 'run')
  }
}
