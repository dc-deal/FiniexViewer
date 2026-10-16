import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readTabEntry, removeTabAndShared, writeTabAndShared } from '@/tab_storage'

const KEY = 'arrangement.v1'

describe('tab_storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A reload keeps the tab's own — another window's later write does not reach it. */
  it('reads the tab\'s own entry before the one any tab saved last', () => {
    sessionStorage.setItem(KEY, 'this tab')
    localStorage.setItem(KEY, 'another window, later')
    expect(readTabEntry(KEY)).toBe('this tab')
  })

  /** A NEW tab starts from the last arrangement saved, and from then on it is the tab's own. */
  it('starts a new tab from the last one saved, and keeps it as its own', () => {
    localStorage.setItem(KEY, 'last saved')
    expect(readTabEntry(KEY)).toBe('last saved')

    localStorage.setItem(KEY, 'another window, later')
    expect(readTabEntry(KEY)).toBe('last saved')
  })

  /** Starting with nothing is kept as well: a reload must not pick up what another tab saved meanwhile. */
  it('keeps starting with nothing as the tab\'s own', () => {
    expect(readTabEntry(KEY)).toBeNull()

    localStorage.setItem(KEY, 'another window, later')
    expect(readTabEntry(KEY)).toBeNull()
  })

  it('writes for this tab and as the start of the next, and removes from both', () => {
    writeTabAndShared(KEY, 'value')
    expect(sessionStorage.getItem(KEY)).toBe('value')
    expect(localStorage.getItem(KEY)).toBe('value')

    removeTabAndShared(KEY)
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  /** Where the tab's own storage is blocked, the shared entry is still read — one for every tab. */
  it('reads the shared entry where the tab cannot keep its own', () => {
    localStorage.setItem(KEY, 'last saved')
    // on the prototype, because jsdom's storage takes a property set on it as an item
    const { getItem, setItem } = Storage.prototype
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (this === sessionStorage) throw new Error('blocked')
      return getItem.call(this, key)
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === sessionStorage) throw new Error('blocked')
      setItem.call(this, key, value)
    })
    expect(readTabEntry(KEY)).toBe('last saved')

    localStorage.setItem(KEY, 'another window, later')
    expect(readTabEntry(KEY)).toBe('another window, later')
  })

  /** A private window or blocked storage is the same as none — never a reason not to start. */
  it('answers none, and throws nothing, where storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readTabEntry(KEY)).toBeNull()
    expect(() => writeTabAndShared(KEY, 'value')).not.toThrow()
    expect(() => removeTabAndShared(KEY)).not.toThrow()
  })
})
