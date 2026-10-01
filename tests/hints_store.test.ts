import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useHintsStore, reconcile } from '@/stores/hints_store'
import { hintIds } from '@/hint_registry'

const KNOWN = hintIds()[0] as string

describe('reconcile', () => {
  it('keeps the ids the registry still knows', () => {
    expect(reconcile({ version: 1, banned: [KNOWN] })).toEqual([KNOWN])
  })

  /**
   * Without this the list only ever grows, and a hint reintroduced under an old id would come
   * back already banned — a reader would never see an explanation written years later.
   */
  it('drops an id the registry no longer contains', () => {
    expect(reconcile({ version: 1, banned: [KNOWN, 'retired-hint'] })).toEqual([KNOWN])
  })

  it('discards a version it does not know, rather than guessing at the shape', () => {
    expect(reconcile({ version: 99, banned: [KNOWN] })).toEqual([])
  })

  it('survives anything that is not a ban list at all', () => {
    expect(reconcile(null)).toEqual([])
    expect(reconcile('nonsense')).toEqual([])
    expect(reconcile({ version: 1 })).toEqual([])
    expect(reconcile({ version: 1, banned: 'not-an-array' })).toEqual([])
  })

  it('never lets the same id in twice', () => {
    expect(reconcile({ version: 1, banned: [KNOWN, KNOWN] })).toEqual([KNOWN])
  })
})

describe('useHintsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('shows every registered hint until something says otherwise', () => {
    expect(useHintsStore().isVisible(KNOWN)).toBe(true)
  })

  /**
   * The two levels answer different things, and the difference is the whole point: a dismissal
   * means "not now" and must not punish a reader who closed the line by accident.
   */
  it('a dismissal lasts the session and is never written down', () => {
    const store = useHintsStore()
    store.dismiss(KNOWN)
    expect(store.isVisible(KNOWN)).toBe(false)
    expect(localStorage.getItem('hints.v1')).toBeNull()

    // a fresh visit: a new store over the same storage
    setActivePinia(createPinia())
    expect(useHintsStore().isVisible(KNOWN)).toBe(true)
  })

  it('a ban outlives the visit', () => {
    useHintsStore().ban(KNOWN)

    setActivePinia(createPinia())
    expect(useHintsStore().isVisible(KNOWN)).toBe(false)
  })

  it('the reset brings back everything, banned or merely dismissed', () => {
    const store = useHintsStore()
    store.ban(KNOWN)
    store.dismiss(KNOWN)
    store.reset()
    expect(store.isVisible(KNOWN)).toBe(true)

    setActivePinia(createPinia())
    expect(useHintsStore().isVisible(KNOWN)).toBe(true)
  })

  // An unknown id has no hint to hide, and asking about one must not throw.
  it('answers for an id nobody registered', () => {
    expect(useHintsStore().isVisible('no-such-hint')).toBe(true)
  })
})
