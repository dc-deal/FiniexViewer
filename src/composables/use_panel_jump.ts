import { nextTick } from 'vue'
import { reportKindId } from '@/panel_kinds'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import { useRunsStore } from '@/stores/runs_store'
import type { PositionRef } from '@/types/context_types'

/** How long a jump waits for its marked row before it gives up. */
const MARK_WAIT_MS = 2000

/** How long the row *Show in list* led to stays marked — long enough to be found, then gone. */
const FLASH_MS = 1600

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
async function scrollToRow(
  panelKind: string,
  selector: string,
  place: (row: HTMLElement) => void,
): Promise<HTMLElement | null> {
  // one tick first, or a row still carrying the PREVIOUS mark would answer
  await nextTick()
  const root = sectionRoot(panelKind)
  if (!root) return null
  const found = (): HTMLElement | null => {
    const row = root.querySelector<HTMLElement>(selector)
    if (row) place(row)
    return row
  }
  const now = found()
  if (now) return now
  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const row = found()
      if (row) stop(row)
    })
    const timer = window.setTimeout(() => stop(null), MARK_WAIT_MS)
    function stop(row: HTMLElement | null): void {
      observer.disconnect()
      window.clearTimeout(timer)
      resolve(row)
    }
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  })
}

function scrollToMark(sectionId: string, panelKind: string): void {
  void scrollToRow(panelKind, `[data-panel="${sectionId}"] .record-row.marked`,
    row => row.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}

/**
 * Centres a row in its own list and nowhere else. `scrollIntoView` also scrolls every ancestor
 * that overflows, and the run list sits in a view whose own scroll has no way back.
 */
function centreInList(row: HTMLElement): void {
  const list = row.closest<HTMLElement>('.run-list')
  if (!list) return
  const listBox = list.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
  list.scrollBy({ top: rowBox.top + rowBox.height / 2 - (listBox.top + listBox.height / 2), behavior: 'smooth' })
}

/** Marks a row for a moment: the eye finds it, and it never stays to be mistaken for a choice. */
function flash(row: HTMLElement): void {
  row.classList.remove('flash')
  // a second click while it still shows restarts it rather than ending it
  void row.offsetWidth
  row.classList.add('flash')
  window.setTimeout(() => row.classList.remove('flash'), FLASH_MS)
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
      dock.reveal(ownPanel, 'command')
      void scrollToMark(sectionId, ownPanel)
      return
    }
    // in the column: the run report comes to the front — the jump may start in another panel — and
    // a hidden section is not in the column at all, and a folded one draws nothing, so the jump
    // has to make the target reachable before it can scroll to it
    dock.reveal('run', 'command')
    layoutStore.show(sectionId)
    layoutStore.setOpen(sectionId, true)
    void scrollToMark(sectionId, 'run')
  }
}

/**
 * *Show in list*: the run list comes to the front — reopened where it stood if it was closed — and
 * the chosen run's row is centred in it and marked for a moment, the way an editor reveals a file in
 * its explorer. The family holding the row is opened first, in case the reader closed it. The row is
 * not focused: it wears its run's card, which opens on focus and would cover the list unasked.
 */
export function useShowInList(): () => void {
  const dock = useDockStore()
  const runsStore = useRunsStore()
  return () => {
    runsStore.askForChosenRow()
    dock.reveal('runs', 'command')
    // a panel just brought out is laid out one frame late; scrolled before that, the row would be
    // measured against a list that is about to change size
    window.requestAnimationFrame(() => {
      void scrollToRow('runs', '.run-list .record-row.picked:not(.record-unseen)', centreInList).then(row => {
        if (row) flash(row)
      })
    })
  }
}
