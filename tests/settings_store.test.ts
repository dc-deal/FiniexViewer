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

  it('returns to the defaults on reset and stores that too', () => {
    const store = useSettingsStore()
    store.setScenarioThreshold(20)
    store.reset()
    expect(store.settings).toEqual(DEFAULT_SETTINGS)
    expect(stored()).toEqual(saved())
  })
})
