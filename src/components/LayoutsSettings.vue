<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import AppButton from '@/components/base/AppButton.vue'
import AppSwitch from '@/components/base/AppSwitch.vue'
import HintLine from '@/components/base/HintLine.vue'
import RecordList from '@/components/base/RecordList.vue'
import { useDockStore } from '@/stores/dock_store'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'
import { LAYOUT_WIDTH_RANGE, useSettingsStore } from '@/stores/settings_store'
import type { ListColumn } from '@/types/list_types'
import { t } from '@/translate'

/**
 * Settings › Layouts (viewer#37): the named layouts as a list with a detail, the way the servers are
 * kept. The Layouts menu only chooses; saving, renaming, deleting, resetting and carrying them to
 * another machine stand here. A tick marks the layout this window loaded.
 */
const store = useNamedLayoutsStore()
const dock = useDockStore()
const settingsStore = useSettingsStore()
const { layouts, loaded } = storeToRefs(store)
const { settings } = storeToRefs(settingsStore)

/** A width the store refuses — out of range, or across the other bound — leaves the field showing what holds. */
function onWidth(event: Event, apply: (value: number) => void): void {
  const input = event.target as HTMLInputElement
  const parsed = Number(input.value)
  if (!Number.isNaN(parsed)) apply(parsed)
  input.value = String(input.name === 'medium-from' ? settings.value.mediumFrom : settings.value.fullFrom)
}

/** A new layout's draft has no entry yet. */
const NEW = '__new'
const picked = ref<string>(loaded.value?.id ?? layouts.value[0]!.id)
const entry = computed(() => layouts.value.find(layout => layout.id === picked.value) ?? null)
const isNew = computed(() => picked.value === NEW)
/** A reader's own layout: only that one can be renamed or deleted. */
const own = computed(() => entry.value !== null && entry.value.shipped === null)

const name = ref('')
/** The first Delete asks; the second deletes. Undone when another row is picked. */
const confirmingDelete = ref(false)
const notice = ref<string | null>(null)
const importInput = ref<HTMLInputElement | null>(null)

// a picked row fills the form; a new one starts empty
watch([picked, entry], () => {
  name.value = entry.value?.name ?? ''
  confirmingDelete.value = false
}, { immediate: true })

// a layout deleted in another window takes its row with it
watch(entry, found => {
  if (!found && !isNew.value) picked.value = loaded.value?.id ?? layouts.value[0]!.id
})

const columns: ListColumn[] = [{ label: t('Layout'), width: 'minmax(0, 1fr)' }]

/** Why the name cannot be taken, in words — only where a name can be given at all. */
const problem = computed(() => {
  if (!isNew.value && !own.value) return null
  return store.nameProblem(name.value, isNew.value ? null : picked.value)
})

const renamed = computed(() => own.value && name.value.trim() !== entry.value?.name)

function save(): void {
  if (problem.value) return
  if (isNew.value) {
    if (store.saveAs(name.value)) picked.value = loaded.value?.id ?? picked.value
    return
  }
  if (renamed.value) store.rename(picked.value, name.value)
}

function remove(): void {
  if (!own.value) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  const id = picked.value
  picked.value = loaded.value && loaded.value.id !== id ? loaded.value.id : layouts.value[0]!.id
  store.remove(id)
}

function exportAll(): void {
  const blob = new Blob([store.exportAll()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'finiexviewer-layouts.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function onImportPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  // reported rather than thrown: a file that is not a layout is a mistake, not a failure
  const taken = store.importAll(await file.text())
  notice.value = taken === null
    ? t('That file holds no layout')
    : `${taken} ${taken === 1 ? t('layout taken') : t('layouts taken')}`
}

/**
 * The suggested order is no named layout: a layout loaded before would otherwise take it in as its
 * own placement and lose the one it held.
 */
function suggestedOrder(): void {
  store.unload()
  dock.reset()
}
</script>

<template>
  <div class="layouts-settings">
    <HintLine id="layouts" />
    <div class="layouts-body">
      <div class="layouts-list">
        <RecordList
          :rows="layouts"
          :columns="columns"
          :row-key="row => row.id"
          :is-picked="row => row.id === picked"
          @pick="row => { picked = row.id }"
        >
          <template #default="{ row }">
            <span class="layout-row" :data-layout="row.id" :data-loaded="row.id === loaded?.id">
              <span class="layout-check" aria-hidden="true">{{ row.id === loaded?.id ? '✓' : '' }}</span>
              <span class="layout-name">{{ row.name }}</span>
              <span v-if="row.shipped" class="layout-word">{{ t('shipped') }}</span>
            </span>
          </template>
        </RecordList>
        <AppButton data-action="new-layout" @click="picked = NEW">+ {{ t('Save this window as …') }}</AppButton>
        <div class="layouts-files">
          <AppButton data-action="export" @click="exportAll()">⬇️ {{ t('Export all …') }}</AppButton>
          <AppButton data-action="import" @click="importInput?.click()">⬆️ {{ t('Import …') }}</AppButton>
        </div>
        <p v-if="notice" class="layout-notice">{{ notice }}</p>
        <input ref="importInput" class="import-input" type="file" accept="application/json" @change="onImportPicked">
      </div>

      <form class="layout-detail" @submit.prevent="save">
        <label class="field">
          <span class="field-label">{{ t('Name') }}</span>
          <input
            v-model="name"
            class="field-input layout-name-input"
            name="layout-name"
            autocomplete="off"
            :readonly="!isNew && !own"
          >
        </label>
        <p v-if="problem && (name || !isNew)" class="layout-problem">⚠ {{ problem }}</p>
        <div class="layout-actions">
          <AppButton v-if="isNew" type="submit" data-action="confirm-name" :disabled="problem !== null">
            {{ t('Save') }}
          </AppButton>
          <AppButton v-if="own" type="submit" data-action="rename" :disabled="problem !== null || !renamed">
            {{ t('Rename') }}
          </AppButton>
          <AppButton v-if="entry?.shipped" type="button" data-action="reset-shipped" @click="store.resetShipped(picked)">
            {{ t('Reset to shipped') }}
          </AppButton>
          <AppButton v-if="own" type="button" data-action="delete" @click="remove()">
            {{ confirmingDelete ? `${t('Really delete')} ${entry?.name}` : t('Delete') }}
          </AppButton>
        </div>
      </form>
    </div>

    <!-- the window's width choosing the loaded layout's size: off unless the reader wants it -->
    <div class="setting size-by-window">
      <AppSwitch
        :model-value="settings.sizeByWindow"
        :label="t('Choose the size by the window')"
        data-setting="size-by-window"
        @update:model-value="settingsStore.setSizeByWindow"
      />
      <div class="widths">
        <label class="field width">
          <span class="field-label">{{ t('Medium from') }}</span>
          <input
            class="field-input"
            name="medium-from"
            type="number"
            :min="LAYOUT_WIDTH_RANGE.min"
            :max="LAYOUT_WIDTH_RANGE.max"
            :step="50"
            :value="settings.mediumFrom"
            @change="event => onWidth(event, settingsStore.setMediumFrom)"
          >
        </label>
        <label class="field width">
          <span class="field-label">{{ t('Full from') }}</span>
          <input
            class="field-input"
            name="full-from"
            type="number"
            :min="LAYOUT_WIDTH_RANGE.min"
            :max="LAYOUT_WIDTH_RANGE.max"
            :step="50"
            :value="settings.fullFrom"
            @change="event => onWidth(event, settingsStore.setFullFrom)"
          >
        </label>
      </div>
      <HintLine id="size-by-window" />
    </div>

    <!-- where the docked panels stand without a layout: one way back, beside the layouts -->
    <div class="setting">
      <span class="field-label">{{ t('Panels') }}</span>
      <AppButton data-action="reset-dock" @click="suggestedOrder()">
        {{ t('Back to the suggested order') }}
      </AppButton>
      <HintLine id="suggested-order" />
    </div>
  </div>
</template>

<style scoped>
/* no part of it shrinks below what it holds: the tab scrolls instead, where the parts would overlap */
.layouts-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* side by side where the dialog has the room, one above the other where it has not */
.layouts-body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-md);
}

.layouts-list {
  flex: 1 1 11rem;
  max-width: 16rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-sm);
  min-width: 0;
}

.layouts-list :deep(.record-shell) {
  width: 100%;
}

.layout-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  min-width: 0;
}

/* the tick's own column, as in the menu: every name starts at one edge, ticked or not */
.layout-check {
  flex-shrink: 0;
  width: 2ch;
}

.layout-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* that a layout shipped with the app, in words at the end of its row */
.layout-word {
  margin-left: auto;
  padding-left: var(--space-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.layouts-files {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.import-input {
  display: none;
}

.layout-detail {
  flex: 3 1 20rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-width: 0;
}

.field,
.setting {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}

.field-label,
.layout-notice {
  margin: 0;
  color: var(--color-text-secondary);
}

.field-input {
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

.field-input:focus {
  border-color: var(--color-accent);
}

/* a shipped layout's name is read here, not typed: no frame that offers a field */
.field-input:read-only {
  border-color: transparent;
  background: none;
  padding-left: 0;
}

.layout-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.layout-problem {
  margin: 0;
  color: var(--color-warning);
}

.setting .app-button {
  align-self: flex-start;
}

.widths {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.width {
  width: 9rem;
}
</style>
