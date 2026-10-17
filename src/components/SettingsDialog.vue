<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import AppSelect from '@/components/base/AppSelect.vue'
import { useDockStore } from '@/stores/dock_store'
import { useHintsStore } from '@/stores/hints_store'
import { useLayoutStore } from '@/stores/layout_store'
import {
  SCENARIO_THRESHOLD_RANGE, TRADE_ROW_CAP_RANGE, useSettingsStore,
} from '@/stores/settings_store'
import type { LaneOrder, SettingsTab, ThemeName } from '@/types/settings_types'
import { t } from '@/translate'

const props = defineProps<{
  open: boolean
}>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const settingsStore = useSettingsStore()
const hintsStore = useHintsStore()
const layoutStore = useLayoutStore()
const dock = useDockStore()
const { settings } = storeToRefs(settingsStore)

const activeTab = ref<SettingsTab>('display')
const importInput = ref<HTMLInputElement | null>(null)
const importNotice = ref<string | null>(null)

// a fresh open honours the tab it was asked for, and drops a notice from the previous visit
watch(() => props.open, isOpen => {
  if (!isOpen) return
  activeTab.value = 'display'
  importNotice.value = null
})

const themeOptions = [
  { value: 'dark', label: `🌙 ${t('Dark')}` },
  { value: 'light', label: `☀️ ${t('Light')}` },
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

function exportLayout(): void {
  const blob = new Blob([layoutStore.exportLayout()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'finiexviewer-layout.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function onImportPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  // reported rather than thrown: a file that is not a layout is a mistake, not a failure
  const accepted = layoutStore.importLayout(await file.text())
  importNotice.value = accepted ? t('Layout replaced') : t('That file is not a layout')
}

/** Local time at the rendering edge — the identity is only ever as of the instant it was read. */
</script>

<template>
  <!-- one size whatever the tab: a frame that grows and shrinks as its tabs are switched moves the
       very buttons the reader is about to press, so the tallest tab sets the height -->
  <AppDialog
    :open="open"
    :title="`⚙️ ${t('Settings')}`"
    name="settings"
    height="min(38rem, 80vh)"
    @update:open="value => emit('update:open', value)"
  >
    <TabsRoot v-model="activeTab" class="settings-tabs">
      <TabsList class="tab-list">
        <TabsTrigger value="display" class="tab-trigger">🎚️ {{ t('Display') }}</TabsTrigger>
        <TabsTrigger value="layout" class="tab-trigger">🗂️ {{ t('Layout') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="display" class="tab-panel">
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

        <!-- a banned hint has no other way back: the control that banned it is gone with it -->
        <div class="setting">
          <span class="setting-label">{{ t('Hints') }}</span>
          <AppButton class="hints-reset" @click="hintsStore.reset()">
            {{ t('Show all hints again') }}
          </AppButton>
        </div>
        <p class="setting-hint">
          {{ t('Brings back every short explanation you dismissed or turned off.') }}
        </p>

        <AppButton @click="settingsStore.reset()">
          {{ t('Restore defaults') }}
        </AppButton>
      </TabsContent>

      <TabsContent value="layout" class="tab-panel">
        <!-- where the docked panels stand: one way back, beside everything else about arrangement -->
        <div class="setting">
          <span class="setting-label">{{ t('Panels') }}</span>
          <AppButton data-action="reset-dock" @click="dock.reset()">
            {{ t('Back to the suggested order') }}
          </AppButton>
        </div>
        <p class="setting-hint">
          {{ t('Deployments, Runs and the run bundle as tabs in one group, the run chart beside them in a wide window and among them in a narrow one — in front, the bundle where a run is chosen and the run list where none is.') }}
        </p>

        <div class="setting">
          <span class="setting-label">{{ t('Run bundle') }}</span>
          <p class="setting-hint">
            {{ t('The order of the sections in the run bundle is stored on this machine. A file carries it to another.') }}
          </p>
        </div>
        <div class="layout-actions">
          <AppButton @click="exportLayout()">
            ⬇️ {{ t('Export layout') }}
          </AppButton>
          <AppButton @click="importInput?.click()">
            ⬆️ {{ t('Import layout') }}
          </AppButton>
        </div>
        <input
          ref="importInput"
          class="import-input"
          type="file"
          accept="application/json"
          @change="onImportPicked"
        >
        <p v-if="importNotice" class="setting-hint">{{ importNotice }}</p>
      </TabsContent>
    </TabsRoot>
  </AppDialog>
</template>

<style scoped>
.settings-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tab-list {
  flex-shrink: 0;
  display: flex;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--color-border);
}

.tab-trigger {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: var(--space-xs) var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.tab-trigger[data-state="active"] {
  color: var(--color-text-primary);
  border-bottom-color: var(--color-accent);
}

.tab-trigger:focus-visible {
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
}

.tab-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding-top: var(--space-md);
}

/* The primitive keeps the inactive panels in the document and empties them. `display: flex` above
   beats the UA rule for `hidden`, so without this the empty shells stack and push the panel on
   show to the bottom of the dialog. */
.tab-panel[hidden],
.tab-panel[data-state="inactive"] {
  display: none;
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

.layout-actions {
  display: flex;
  gap: var(--space-sm);
}

.import-input {
  display: none;
}

/* the dialog only places its buttons; how a button looks belongs to AppButton */
.app-button {
  align-self: flex-start;
}
</style>
