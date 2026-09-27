import { defineStore } from 'pinia'
import { ref } from 'vue'
import { hintIds } from '@/hint_registry'
import type { StoredHints } from '@/types/hint_types'

const STORAGE_KEY = 'hints.v1'
const SCHEMA_VERSION = 1

/**
 * What a stored ban list is allowed to say.
 *
 * Reconciled rather than trusted, the same rule the layout and the settings follow: a wrong shape
 * or a version we do not know is discarded whole, and an id the registry no longer contains is
 * dropped. Without that last step the list only ever grows, and a hint reintroduced under an old
 * id would come back already banned.
 */
export function reconcile(stored: unknown): string[] {
  if (!stored || typeof stored !== 'object') return []
  const raw = stored as Partial<StoredHints>
  if (raw.version !== SCHEMA_VERSION) return []
  if (!Array.isArray(raw.banned)) return []
  const known = new Set(hintIds())
  return [...new Set(raw.banned.filter(id => typeof id === 'string' && known.has(id)))]
}

/**
 * Which hints a reader still sees.
 *
 * Two levels, because they answer different things. DISMISS means "not now" and lasts the session
 * — nothing is written, so the hint returns next visit and a reader who closed it by accident is
 * not punished for it. BAN means "never again" and is the only one that persists. Both are undone
 * by the reset in the settings dialog.
 */
export const useHintsStore = defineStore('hints', () => {
  // never stored: a dismissal is about this visit
  const dismissed = ref<string[]>([])
  const banned = ref<string[]>([])

  function load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      banned.value = raw ? reconcile(JSON.parse(raw)) : []
    } catch {
      // unreadable or blocked storage is not an error a reader can act on — every hint simply shows
      banned.value = []
    }
  }

  function persist(): void {
    const payload: StoredHints = { version: SCHEMA_VERSION, banned: banned.value }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // a full or blocked store loses the ban, never the app
    }
  }

  function isVisible(id: string): boolean {
    return !dismissed.value.includes(id) && !banned.value.includes(id)
  }

  /** Away for this visit. */
  function dismiss(id: string): void {
    if (!dismissed.value.includes(id)) dismissed.value = [...dismissed.value, id]
  }

  /** Away for good, until the reader resets. */
  function ban(id: string): void {
    if (!banned.value.includes(id)) {
      banned.value = [...banned.value, id]
      persist()
    }
  }

  /** Every hint again, including the ones banned in an earlier visit. */
  function reset(): void {
    dismissed.value = []
    banned.value = []
    persist()
  }

  load()

  return { dismissed, banned, isVisible, dismiss, ban, reset, load }
})
