<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle,
  TabsContent, TabsList, TabsRoot, TabsTrigger,
} from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'
import AppSelect from '@/components/base/AppSelect.vue'
import AppSpinner from '@/components/base/AppSpinner.vue'
import { useCallerStore } from '@/stores/caller_store'
import { useHintsStore } from '@/stores/hints_store'
import { useLayoutStore } from '@/stores/layout_store'
import {
  SCENARIO_THRESHOLD_RANGE, TRADE_ROW_CAP_RANGE, useSettingsStore,
} from '@/stores/settings_store'
import type { LaneOrder, SettingsTab, ThemeName } from '@/types/settings_types'
import { t } from '@/translate'

const props = defineProps<{
  open: boolean
  /** Which tab to show when it opens — the menu points the account entry straight at its own. */
  tab?: SettingsTab
}>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const settingsStore = useSettingsStore()
const hintsStore = useHintsStore()
const layoutStore = useLayoutStore()
const callerStore = useCallerStore()
const { settings } = storeToRefs(settingsStore)
const { identity, state, readAt, displayName } = storeToRefs(callerStore)

const activeTab = ref<SettingsTab>(props.tab ?? 'display')
const importInput = ref<HTMLInputElement | null>(null)
const importNotice = ref<string | null>(null)

// a fresh open honours the tab it was asked for, and drops a notice from the previous visit
watch(() => props.open, isOpen => {
  if (!isOpen) return
  activeTab.value = props.tab ?? 'display'
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
function readAtLabel(at: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(at)
}
</script>

<template>
  <DialogRoot :open="open" @update:open="value => emit('update:open', value)">
    <DialogPortal>
      <DialogOverlay class="settings-overlay" />
      <!-- no description on purpose: the title names it and every field carries its own label.
           Stated rather than left out, which is what the primitive asks for. -->
      <DialogContent class="settings-dialog" :aria-describedby="undefined">
        <DialogTitle class="settings-title">⚙️ {{ t('Settings') }}</DialogTitle>

        <TabsRoot v-model="activeTab" class="settings-tabs">
          <TabsList class="tab-list">
            <TabsTrigger value="display" class="tab-trigger">🎚️ {{ t('Display') }}</TabsTrigger>
            <TabsTrigger value="layout" class="tab-trigger">🗂️ {{ t('Layout') }}</TabsTrigger>
            <TabsTrigger value="account" class="tab-trigger">👤 {{ t('Account') }}</TabsTrigger>
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
            <p class="setting-hint">
              {{ t('The panel arrangement is stored on this machine. A file carries it to another.') }}
            </p>
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

          <TabsContent value="account" class="tab-panel">
            <AppSpinner v-if="state === 'loading' || state === 'idle'" />

            <!-- a 200 here proves nothing: with gating off the server verifies no token at all,
                 so every identity field is null even for a caller that sent a valid one -->
            <p v-else-if="state === 'unenforced'" class="account-notice warn">
              <span class="mark">⚠</span>
              {{ t('This server verifies no token — there is no identity to show') }}
            </p>

            <p v-else-if="state === 'unauthenticated'" class="account-notice warn">
              <span class="mark">⚠</span>{{ t('The token was refused') }}
            </p>

            <p v-else-if="state === 'failed'" class="account-notice bad">
              <span class="mark">✖</span>{{ t('The server did not answer') }}
            </p>

            <template v-else-if="identity">
              <dl class="account-rows">
                <dt>{{ t('Acting as') }}</dt>
                <dd>{{ displayName }}</dd>
                <dt>{{ t('Account') }}</dt>
                <dd>{{ identity.account }} · {{ identity.account_kind }}</dd>
                <dt>{{ t('Client') }}</dt>
                <dd>{{ identity.client }}</dd>
                <dt>{{ t('Grants') }}</dt>
                <dd>{{ identity.grants?.join(' · ') || t('none') }}</dd>
                <template v-if="identity.note">
                  <dt>{{ t('Token note') }}</dt>
                  <dd>{{ identity.note }}</dd>
                </template>
              </dl>
              <p v-if="readAt" class="setting-hint">
                {{ t('as of') }} {{ readAtLabel(readAt) }}
              </p>
            </template>
          </TabsContent>
        </TabsRoot>

        <div class="settings-actions">
          <!-- as-child: the primitive keeps the dismiss behaviour, AppButton carries the look -->
          <DialogClose as-child>
            <AppButton>{{ t('Close') }}</AppButton>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
/* Above every positioned thing on the page. Without this the timeline's markers (z-index 5 in
   TimelineChart) paint straight through a dialog that declares none — measured, not guessed. */
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background-color: rgb(0 0 0 / 50%);
}

.settings-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 81;
  width: min(26rem, calc(100vw - 2rem));
  max-height: calc(100vh - 4rem);
  overflow-y: auto;
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

.tab-list {
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
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding-top: var(--space-md);
  /* holds the dialog steady while tabs are switched, rather than letting it jump per tab */
  min-height: 12rem;
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

.account-rows {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-xs) var(--space-sm);
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.account-rows dt { color: var(--color-text-secondary); }

.account-rows dd {
  margin: 0;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

/* a status colour never travels alone — each carries its glyph and its sentence */
.account-notice {
  display: flex;
  gap: var(--space-xs);
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.account-notice.warn { color: var(--color-warning); }
.account-notice.bad { color: var(--color-error); }

.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

/* the dialog only places its buttons; how a button looks belongs to AppButton */
.app-button {
  align-self: flex-start;
}
</style>
