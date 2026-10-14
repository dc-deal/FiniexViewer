/**
 * What a browser tab keeps for itself — the arrangement and the column's layout — with the last one
 * any tab saved as the start of a new tab.
 *
 * Each browser tab keeps its OWN (viewer#31, 2026-10-14), which is what makes a second window the
 * way to compare two runs. With one shared `localStorage` the windows overwrote each other: on a
 * reload, the column's layout came back from the other window every time, and the run whenever the
 * other window's delayed save landed between this one's leaving and its reading. `sessionStorage`
 * belongs to one tab — a reload keeps it, a new tab starts without it — so a new tab ADOPTS the last
 * entry any tab saved and from then on reads only its own; a write goes to both: the tab's own, and
 * the start of the next new tab.
 *
 * What is the reader's rather than the tab's — the settings, the hints dismissed — stays in
 * `localStorage` alone. Every access may throw, in a private window or with storage blocked, and is
 * then the same as none: these are conveniences, never a reason for the app not to start.
 */

/**
 * Kept in the tab for a tab that started with nothing, so that it keeps starting with nothing: a
 * reload must not pick up what another tab saved meanwhile. Read back as none.
 */
const STARTED_EMPTY = ''

/**
 * This tab's own entry, or null. A tab that has none yet — a new one — adopts the last one any tab
 * saved and keeps it as its own: another tab's later write never reaches it, not even on a reload.
 *
 * Adopted at the READ rather than at the first write: the column's layout is written only when the
 * reader changes it, so a tab that changes nothing would otherwise read another tab's layout after
 * a reload.
 */
export function readTabEntry(key: string): string | null {
  let own: string | null = null
  try {
    own = sessionStorage.getItem(key)
  } catch {
    // blocked: this tab keeps nothing of its own, and reads the shared entry instead
  }
  if (own !== null) return own === STARTED_EMPTY ? null : own
  let shared: string | null = null
  try {
    shared = localStorage.getItem(key)
  } catch {
    // blocked storage: the same as none
  }
  try {
    sessionStorage.setItem(key, shared ?? STARTED_EMPTY)
  } catch {
    // blocked or full: this tab adopts nothing, and reads the shared entry again next time
  }
  return shared
}

/** Kept for this tab, and as the start of the next new one. */
export function writeTabAndShared(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // blocked: this tab keeps nothing of its own, and reads the shared entry instead
  }
  try {
    localStorage.setItem(key, value)
  } catch {
    // full or blocked: a new tab starts from what was there before
  }
}

/** Gone from this tab and from the shared start alike. */
export function removeTabAndShared(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // blocked storage: nothing was kept, so nothing has to go
  }
  try {
    localStorage.removeItem(key)
  } catch {
    // blocked storage: nothing was kept, so nothing has to go
  }
}
