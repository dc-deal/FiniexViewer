<script setup lang="ts">
import { storeToRefs } from 'pinia'
import {
  DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle,
} from 'reka-ui'
import AppSelect from '@/components/base/AppSelect.vue'
import {
  SCENARIO_THRESHOLD_RANGE, TRADE_ROW_CAP_RANGE, useSettingsStore,
} from '@/stores/settings_store'
import type { LaneOrder, ThemeName } from '@/types/settings_types'
import { t } from '@/translate'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const themeOptions = [
  { value: 'dark', label: t('Dark') },
  { value: 'light', label: t('Light') },
]

const laneOrderOptions = [
  { value: 'time', label: t('Start time') },
  { value: 'name', label: t('Name') },
]

function onNumber(event: Event, apply: (value: number) => void): void {
  const parsed = Number((event.target as HTMLInputElement).value)
  if (Number.isNaN(parsed)) return
  apply(parsed)
}
</script>

<template>
  <DialogRoot :open="open" @update:open="value => emit('update:open', value)">
    <DialogPortal>
      <DialogOverlay class="settings-overlay" />
      <!-- no description on purpose: the title names it and every field carries its own label.
           Stated rather than left out, which is what the primitive asks for. -->
      <DialogContent class="settings-dialog" :aria-describedby="undefined">
        <DialogTitle class="settings-title">{{ t('Settings') }}</DialogTitle>

        <div class="setting">
          <label class="setting-label" for="setting-theme">{{ t('Theme') }}</label>
          <AppSelect
            id="setting-theme"
            :model-value="settings.theme"
            :options="themeOptions"
            @update:model-value="value => settingsStore.setTheme(value as ThemeName)"
          />
        </div>

        <div class="setting">
          <label class="setting-label" for="setting-lane-order">{{ t('Timeline order') }}</label>
          <AppSelect
            id="setting-lane-order"
            :model-value="settings.laneOrder"
            :options="laneOrderOptions"
            @update:model-value="value => settingsStore.setLaneOrder(value as LaneOrder)"
          />
        </div>

        <div class="setting">
          <label class="setting-label" for="setting-threshold">{{ t('Summarise above') }}</label>
          <input
            id="setting-threshold"
            class="setting-number"
            type="number"
            :min="SCENARIO_THRESHOLD_RANGE.min"
            :max="SCENARIO_THRESHOLD_RANGE.max"
            :value="settings.scenarioThreshold"
            @change="event => onNumber(event, settingsStore.setScenarioThreshold)"
          >
          <p class="setting-hint">{{ t('scenarios — beyond this, units start collapsed') }}</p>
        </div>

        <div class="setting">
          <label class="setting-label" for="setting-row-cap">{{ t('Trade rows drawn') }}</label>
          <input
            id="setting-row-cap"
            class="setting-number"
            type="number"
            :min="TRADE_ROW_CAP_RANGE.min"
            :max="TRADE_ROW_CAP_RANGE.max"
            :step="50"
            :value="settings.tradeRowCap"
            @change="event => onNumber(event, settingsStore.setTradeRowCap)"
          >
        </div>

        <div class="settings-actions">
          <button class="settings-button" @click="settingsStore.reset()">
            {{ t('Restore defaults') }}
          </button>
          <DialogClose class="settings-button primary">{{ t('Close') }}</DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background-color: rgb(0 0 0 / 50%);
}

.settings-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(24rem, calc(100vw - 2rem));
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.settings-title {
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
}

.setting {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.setting-label,
.setting-hint {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.setting-hint {
  margin: 0;
}

.setting-number {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: var(--space-xs) var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  width: 100%;
  outline: none;
}

.setting-number:focus {
  border-color: var(--color-accent);
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.settings-button {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: var(--space-xs) var(--space-md);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.settings-button.primary {
  color: var(--color-text-primary);
}

.settings-button:focus-visible {
  border-color: var(--color-accent);
  outline: none;
}
</style>
