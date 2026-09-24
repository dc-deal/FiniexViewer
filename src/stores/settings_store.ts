import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_SETTINGS } from '@/types/settings_types'
import type { DisplaySettings, LaneOrder, Settings, ThemeName } from '@/types/settings_types'

const STORAGE_KEY = 'settings.v1'
const SCHEMA_VERSION = 1

export const SCENARIO_THRESHOLD_RANGE = { min: 1, max: 100 } as const
export const TRADE_ROW_CAP_RANGE = { min: 50, max: 5000 } as const

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
  return settings
}

function readStored(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    // a corrupt or unreadable entry is the same as none — a preference never breaks the app
    return null
  }
}

/**
 * Presentation state, and only presentation state.
 *
 * What the user is LOOKING AT — run, scenario, symbol, filters — belongs in the URL, because that
 * is what makes a shared link mean something. How they ARRANGED it belongs here. The two never
 * swap places: a layout in a link shares a preference nobody asked for, and a selection in local
 * storage makes the link meaningless.
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
    reset,
  }
})
