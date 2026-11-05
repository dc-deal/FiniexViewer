import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { reconcile, useSettingsStore } from '@/stores/settings_store'
import { DEFAULT_SETTINGS } from '@/types/settings_types'
import type { Settings } from '@/types/settings_types'

const STORAGE_KEY = 'settings.v1'

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
}

function write(value: unknown): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function saved(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 1, ...DEFAULT_SETTINGS, ...overrides }
}

describe('reconcile', () => {
  it('returns the defaults when nothing was stored', () => {
    expect(reconcile(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps a stored value that is one of the values this build knows', () => {
    const settings = reconcile(saved({ theme: 'light', laneOrder: 'name' }))
    expect(settings.theme).toBe('light')
    expect(settings.laneOrder).toBe('name')
  })

  // the failure this guards: a build that removed a setting must not carry it forward as data
  it('drops a key this build does not know', () => {
    const settings = reconcile(saved({ tileColumns: 4 })) as Settings & { tileColumns?: number }
    expect(settings.tileColumns).toBeUndefined()
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  // the mirror case: a setting added since the value was stored takes its default, it is not absent
  it('gives a key the stored value is missing its default', () => {
    const settings = reconcile({ version: 1, theme: 'light' })
    expect(settings.theme).toBe('light')
    expect(settings.scenarioThreshold).toBe(DEFAULT_SETTINGS.scenarioThreshold)
    expect(settings.tradeRowCap).toBe(DEFAULT_SETTINGS.tradeRowCap)
  })

  it.each([
    ['below the range', { scenarioThreshold: 0 }],
    ['above the range', { scenarioThreshold: 5000 }],
    ['not a whole number', { scenarioThreshold: 6.5 }],
    ['not a number at all', { scenarioThreshold: '6' }],
  ])('refuses a threshold %s and uses the default', (_label, overrides) => {
    expect(reconcile(saved(overrides)).scenarioThreshold)
      .toBe(DEFAULT_SETTINGS.scenarioThreshold)
  })

  it('refuses a theme it does not recognise', () => {
    expect(reconcile(saved({ theme: 'solarized' })).theme).toBe(DEFAULT_SETTINGS.theme)
  })

  // the version is what a per-field check cannot do: catch a field that kept its name and
  // changed its meaning
  it('discards everything when the schema version does not match', () => {
    expect(reconcile({ ...saved({ theme: 'light' }), version: 99 })).toEqual(DEFAULT_SETTINGS)
  })

  /** The window widths of a layout's sizes (viewer#37) are taken together, and only with Medium below Full. */
  it('takes the window widths together, and only where Medium stands below Full', () => {
    expect(reconcile(saved({ sizeByWindow: true, mediumFrom: 700, fullFrom: 1300 }))).toMatchObject({
      sizeByWindow: true, mediumFrom: 700, fullFrom: 1300,
    })
    expect(reconcile(saved({ mediumFrom: 1600, fullFrom: 1300 }))).toMatchObject({ mediumFrom: 900, fullFrom: 1500 })
    expect(reconcile(saved({ mediumFrom: 700, fullFrom: 'wide' }))).toMatchObject({ mediumFrom: 900, fullFrom: 1500 })
    expect(reconcile(saved({ sizeByWindow: 'yes' })).sizeByWindow).toBe(false)
  })

  /** What picking a run does to the layout (viewer#37): a mode it knows, and a layout id by shape. */
  it('takes a known mode of choosing the layout by the run, and a layout id that is a word', () => {
    expect(reconcile(saved({ layoutByRun: 'switch', layoutForSession: 'own-x' }))).toMatchObject({
      layoutByRun: 'switch', layoutForSession: 'own-x', layoutForBacktest: 'backtests',
    })
    expect(reconcile(saved({ layoutByRun: 'always', layoutForBacktest: '' }))).toMatchObject({
      layoutByRun: 'offer', layoutForBacktest: 'backtests',
    })
  })

  it.each([
    ['a string', 'settings'],
    ['a number', 7],
    ['an array', []],
  ])('returns the defaults for %s', (_label, value) => {
    expect(reconcile(value)).toEqual(DEFAULT_SETTINGS)
  })
})

describe('useSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('starts on the defaults with an empty storage', () => {
    expect(useSettingsStore().settings).toEqual(DEFAULT_SETTINGS)
  })

  it('reads a stored value back through reconciliation', () => {
    write(saved({ theme: 'light', tradeRowCap: 200 }))
    const store = useSettingsStore()
    expect(store.settings.theme).toBe('light')
    expect(store.settings.tradeRowCap).toBe(200)
  })

  /** Dropped whole, and removed: an entry nothing will read again is not left behind. */
  it('removes an entry of another version rather than leaving it', () => {
    write({ ...saved({ theme: 'light' }), version: 99 })
    expect(useSettingsStore().settings).toEqual(DEFAULT_SETTINGS)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('survives a corrupt entry rather than failing to start', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(useSettingsStore().settings).toEqual(DEFAULT_SETTINGS)
  })

  it('writes every change through, so a reload finds it', () => {
    const store = useSettingsStore()
    store.setTheme('light')
    store.setLaneOrder('name')
    store.setScenarioThreshold(12)
    store.setTradeRowCap(1000)
    expect(stored()).toEqual(saved({
      theme: 'light',
      laneOrder: 'name',
      scenarioThreshold: 12,
      tradeRowCap: 1000,
    }))
  })

  it('records the schema version it wrote under', () => {
    const store = useSettingsStore()
    store.setTheme('light')
    expect(stored().version).toBe(1)
  })

  // ignored rather than clamped: a number silently changed to a different one is a wrong answer
  it.each([
    ['a threshold below the range', (s: ReturnType<typeof useSettingsStore>) =>
      s.setScenarioThreshold(0)],
    ['a threshold above the range', (s: ReturnType<typeof useSettingsStore>) =>
      s.setScenarioThreshold(101)],
    ['a fractional threshold', (s: ReturnType<typeof useSettingsStore>) =>
      s.setScenarioThreshold(6.5)],
    ['a row cap below the range', (s: ReturnType<typeof useSettingsStore>) =>
      s.setTradeRowCap(10)],
  ])('refuses %s and leaves the value alone', (_label, apply) => {
    const store = useSettingsStore()
    apply(store)
    expect(store.settings.scenarioThreshold).toBe(DEFAULT_SETTINGS.scenarioThreshold)
    expect(store.settings.tradeRowCap).toBe(DEFAULT_SETTINGS.tradeRowCap)
  })

  it('toggles the theme between the two it has', () => {
    const store = useSettingsStore()
    expect(store.settings.theme).toBe('dark')
    store.toggleTheme()
    expect(store.settings.theme).toBe('light')
    store.toggleTheme()
    expect(store.settings.theme).toBe('dark')
  })

  it('hands panels the display fields and nothing else', () => {
    const store = useSettingsStore()
    store.setTheme('light')
    expect(Object.keys(store.display).sort())
      .toEqual(['laneOrder', 'scenarioThreshold', 'tradeRowCap'])
  })

  it('refuses a window width that would cross the other, and keeps one that does not', () => {
    const store = useSettingsStore()
    store.setMediumFrom(1500)
    store.setFullFrom(900)
    expect(store.settings).toMatchObject({ mediumFrom: 900, fullFrom: 1500 })
    store.setMediumFrom(1000)
    store.setFullFrom(1800)
    store.setSizeByWindow(true)
    expect(stored()).toMatchObject({ mediumFrom: 1000, fullFrom: 1800, sizeByWindow: true })
  })

  it('returns to the defaults on reset and stores that too', () => {
    const store = useSettingsStore()
    store.setScenarioThreshold(20)
    store.reset()
    expect(store.settings).toEqual(DEFAULT_SETTINGS)
    expect(stored()).toEqual(saved())
  })

  /** Shared by every window: one window's change reaches the other, which no longer writes over it. */
  it('reads the settings again when another window changes them', () => {
    const store = useSettingsStore()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved({ theme: 'light' })))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    expect(store.settings.theme).toBe('light')
    // a write to another key is none of the settings' business
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved({ theme: 'dark' })))
    window.dispatchEvent(new StorageEvent('storage', { key: 'arrangement.v1' }))
    expect(store.settings.theme).toBe('light')
  })
})
