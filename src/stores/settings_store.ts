import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { onSharedWrite } from '@/tab_storage'
import { DEFAULT_SETTINGS } from '@/types/settings_types'
import type { DisplaySettings, LaneOrder, LayoutByRun, Settings, ThemeName } from '@/types/settings_types'

const STORAGE_KEY = 'settings.v1'
const SCHEMA_VERSION = 1

export const SCENARIO_THRESHOLD_RANGE = { min: 1, max: 100 } as const
export const TRADE_ROW_CAP_RANGE = { min: 50, max: 5000 } as const
/** The window widths a layout's size may change at; Medium always starts below Full. */
export const LAYOUT_WIDTH_RANGE = { min: 320, max: 4000 } as const

/** What is written to storage: the settings plus the schema they were written under. */
interface StoredSettings extends Settings {
  version: number
}

function isWholeNumberWithin(value: unknown, range: { min: number, max: number }): boolean {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= range.min
    && value <= range.max
}

/**
 * Brings a stored value back in line with what this build knows, field by field.
 *
 * Nothing stored is trusted: the result is built from the defaults and a stored field is only
 * adopted when it passes its own check, so a key this build does not know is never copied and a key
 * the stored value is missing takes its default. The version guards the case a field check cannot —
 * a field that kept its name and changed its meaning.
 */
export function reconcile(stored: unknown): Settings {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS }
  const raw = stored as Partial<StoredSettings>
  if (raw.version !== SCHEMA_VERSION) return { ...DEFAULT_SETTINGS }

  const settings: Settings = { ...DEFAULT_SETTINGS }
  if (raw.theme === 'dark' || raw.theme === 'light') settings.theme = raw.theme
  if (raw.laneOrder === 'time' || raw.laneOrder === 'name') settings.laneOrder = raw.laneOrder
  if (isWholeNumberWithin(raw.scenarioThreshold, SCENARIO_THRESHOLD_RANGE)) {
    settings.scenarioThreshold = raw.scenarioThreshold as number
  }
  if (isWholeNumberWithin(raw.tradeRowCap, TRADE_ROW_CAP_RANGE)) {
    settings.tradeRowCap = raw.tradeRowCap as number
  }
  // added under version 1: an entry written before them reads as their defaults
  if (typeof raw.sizeByWindow === 'boolean') settings.sizeByWindow = raw.sizeByWindow
  // the two widths are taken together or not at all: one alone could stand above the other
  if (isWholeNumberWithin(raw.mediumFrom, LAYOUT_WIDTH_RANGE) && isWholeNumberWithin(raw.fullFrom, LAYOUT_WIDTH_RANGE)
    && (raw.mediumFrom as number) < (raw.fullFrom as number)) {
    settings.mediumFrom = raw.mediumFrom as number
    settings.fullFrom = raw.fullFrom as number
  }
  if (raw.layoutByRun === 'off' || raw.layoutByRun === 'offer' || raw.layoutByRun === 'switch') {
    settings.layoutByRun = raw.layoutByRun
  }
  // an id is taken by shape; whether its layout still exists is asked where it is used
  if (typeof raw.layoutForBacktest === 'string' && raw.layoutForBacktest) settings.layoutForBacktest = raw.layoutForBacktest
  if (typeof raw.layoutForSession === 'string' && raw.layoutForSession) settings.layoutForSession = raw.layoutForSession
  return settings
}

function readStored(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    // another version's entry is removed rather than left behind: nothing will ever read it again
    if (parsed && typeof parsed === 'object' && (parsed as Partial<StoredSettings>).version !== SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    // a corrupt or unreadable entry is the same as none — a preference never breaks the app
    return null
  }
}

/**
 * Presentation state, and only presentation state.
 *
 * What the user is LOOKING AT — run, scenario, symbol, filters — belongs to the link and the
 * arrangement (`arrangement.v1`), stored per browser tab. How they prefer the app to BEHAVE belongs
 * here, shared by every tab. The two never swap places: a preference stored with one tab's
 * selection would leave the other tabs, and a selection here would follow the reader into a tab
 * comparing another run.
 *
 * One versioned key, so the whole of it moves in one step the day a backend serves it per user.
 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(reconcile(readStored()))

  /** Only the fields a panel is given — the theme reaches the page through the document instead. */
  const display = computed<DisplaySettings>(() => ({
    scenarioThreshold: settings.value.scenarioThreshold,
    laneOrder: settings.value.laneOrder,
    tradeRowCap: settings.value.tradeRowCap,
  }))

  // another window changed them: this one reads them again rather than writing its own over them
  onSharedWrite(STORAGE_KEY, () => {
    settings.value = reconcile(readStored())
  })

  function persist(): void {
    try {
      const payload: StoredSettings = { version: SCHEMA_VERSION, ...settings.value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // a full or blocked storage must not break the app — the preference simply does not survive
    }
  }

  function setTheme(value: ThemeName): void {
    settings.value.theme = value
    persist()
  }

  function toggleTheme(): void {
    setTheme(settings.value.theme === 'dark' ? 'light' : 'dark')
  }

  function setLaneOrder(value: LaneOrder): void {
    settings.value.laneOrder = value
    persist()
  }

  /** Out-of-range input is ignored rather than clamped: a silently changed number is a wrong one. */
  function setScenarioThreshold(value: number): void {
    if (!isWholeNumberWithin(value, SCENARIO_THRESHOLD_RANGE)) return
    settings.value.scenarioThreshold = value
    persist()
  }

  function setTradeRowCap(value: number): void {
    if (!isWholeNumberWithin(value, TRADE_ROW_CAP_RANGE)) return
    settings.value.tradeRowCap = value
    persist()
  }

  function setSizeByWindow(value: boolean): void {
    settings.value.sizeByWindow = value
    persist()
  }

  /** A width that would stand at or above Full's, or out of range, is ignored rather than clamped. */
  function setMediumFrom(value: number): void {
    if (!isWholeNumberWithin(value, LAYOUT_WIDTH_RANGE) || value >= settings.value.fullFrom) return
    settings.value.mediumFrom = value
    persist()
  }

  function setFullFrom(value: number): void {
    if (!isWholeNumberWithin(value, LAYOUT_WIDTH_RANGE) || value <= settings.value.mediumFrom) return
    settings.value.fullFrom = value
    persist()
  }

  function setLayoutByRun(value: LayoutByRun): void {
    settings.value.layoutByRun = value
    persist()
  }

  /** The layout a kind of run maps to. */
  function setLayoutFor(kind: 'backtest' | 'session', id: string): void {
    if (!id) return
    if (kind === 'backtest') settings.value.layoutForBacktest = id
    else settings.value.layoutForSession = id
    persist()
  }

  function reset(): void {
    settings.value = { ...DEFAULT_SETTINGS }
    persist()
  }

  return {
    settings,
    display,
    setTheme,
    toggleTheme,
    setLaneOrder,
    setScenarioThreshold,
    setTradeRowCap,
    setSizeByWindow,
    setMediumFrom,
    setFullFrom,
    setLayoutByRun,
    setLayoutFor,
    reset,
  }
})
