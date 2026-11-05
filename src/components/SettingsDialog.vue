<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import AppSelect from '@/components/base/AppSelect.vue'
import LayoutsSettings from '@/components/LayoutsSettings.vue'
import ServersSettings from '@/components/ServersSettings.vue'
import { useHintsStore } from '@/stores/hints_store'
import {
  SCENARIO_THRESHOLD_RANGE, TRADE_ROW_CAP_RANGE, useSettingsStore,
} from '@/stores/settings_store'
import type { LaneOrder, SettingsTab, ThemeName } from '@/types/settings_types'
import { t } from '@/translate'

const props = defineProps<{
  open: boolean
  // the tab a fresh open starts on
  tab?: SettingsTab
}>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const settingsStore = useSettingsStore()
const hintsStore = useHintsStore()
const { settings } = storeToRefs(settingsStore)

const activeTab = ref<SettingsTab>('display')

// a fresh open honours the tab it was asked for
watch(() => props.open, isOpen => {
  if (!isOpen) return
  activeTab.value = props.tab ?? 'display'
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
    width="min(46rem, 90vw)"
    @update:open="value => emit('update:open', value)"
  >
    <TabsRoot v-model="activeTab" class="settings-tabs">
      <TabsList class="tab-list">
        <TabsTrigger value="display" class="tab-trigger">🎚️ {{ t('Display') }}</TabsTrigger>
        <TabsTrigger value="layouts" class="tab-trigger">🗂️ {{ t('Layouts') }}</TabsTrigger>
        <TabsTrigger value="servers" class="tab-trigger">🖧 {{ t('Servers') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="servers" class="tab-panel">
        <ServersSettings />
      </TabsContent>

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

      <TabsContent value="layouts" class="tab-panel">
        <LayoutsSettings />
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

/* the scrollbar's track held free: a tab that scrolls and one that does not keep one width */
.tab-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
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

/* the dialog only places its buttons; how a button looks belongs to AppButton */
.app-button {
  align-self: flex-start;
}
</style>
